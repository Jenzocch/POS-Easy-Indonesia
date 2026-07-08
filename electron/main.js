const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const os = require('os')

let mainWindow = null
let db = null
let orderServer = null

// 單一實例鎖定
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'POS Easy 雜貨店管理系統',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 載入 renderer
  const isDev = !app.isPackaged
  if (isDev) {
    // 生產模式用 build 好的 dist
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ===== 初始化 =====
app.whenReady().then(async () => {
  // 初始化 SQLite 資料庫
  // database.js 內建損毀復原（壞檔改名 + 建新庫）；若連復原都失敗（磁碟壞軌、
  // 目錄不可寫等），以前會靜默不開視窗 — 遠端店家完全無從得知發生什麼事。
  const initDatabase = require('./database')
  const dbPath = path.join(app.getPath('userData'), 'pos-data.db')
  try {
    db = initDatabase(dbPath)
  } catch (err) {
    console.error('[POS] 資料庫初始化失敗:', err)
    dialog.showErrorBox(
      'POS Easy — Database Error / 資料庫錯誤',
      'Database gagal dibuka. Hubungi dukungan teknis.\n' +
      `資料庫無法開啟，請聯絡技術支援。\n\nPath: ${dbPath}\nError: ${err.message}`
    )
    app.quit()
    return
  }

  // 資料庫損毀復原「必須大聲」：console.error 在打包後沒人看得到，店家會在
  // 全空的資料庫上交易一整天而不自知。這裡用「阻斷式」對話框 — 不關店（不 quit，
  // 讓他們能繼續營業），但一定要看到並按掉才會開視窗。
  if (db.recoveryInfo && db.recoveryInfo.recovered) {
    const corruptName = path.basename(db.recoveryInfo.corruptFile || '')
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'POS Easy — Pemulihan Database / 資料庫復原',
      message: 'Database rusak — database baru yang kosong telah dibuat\n資料庫損毀 — 已建立全新空白資料庫',
      detail:
        'Database lama rusak (kemungkinan karena listrik padam) dan tidak bisa dibuka. ' +
        'Sistem sudah membuat database baru yang KOSONG supaya toko tetap bisa berjualan.\n\n' +
        `File lama disimpan sebagai: ${corruptName}\n\n` +
        'Data dapat dipulihkan lewat menu Pengaturan > Cadangan & Pulihkan ' +
        '(pulihkan cadangan, atau impor file JSON dari folder backups/).\n\n' +
        '────────────────\n\n' +
        '舊資料庫已損毀（可能因斷電）無法開啟。系統已建立「全新空白」資料庫，讓您可以繼續營業。\n\n' +
        `舊檔已保留為：${corruptName}\n\n` +
        '請至 設定 > 備份還原 分頁還原備份，或匯入 backups/ 資料夾中的 JSON 備份檔以取回資料。',
      buttons: ['OK / 我知道了'],
      noLink: true,
    })
  }

  // 授權金鑰重新驗證（每次開機都跑，不信任資料表裡存的 tier 字串）：
  // licenseCode 是唯一持久化的來源，subscriptionTier 每次都從簽章重新推導、覆寫——
  // 這樣有人直接手改 settings 表偽造 tier 就完全失效。kasbon-shared.js 的
  // getSubscription() 只讀 subscriptionTier，這裡處理完它不需要任何改動。
  try {
    const license = require('./license')
    license.syncSubscriptionTier(db)
  } catch (err) {
    console.error('[POS] 授權驗證失敗，視同 free tier:', err)
  }

  // 啟動顧客點餐伺服器
  try {
    const startOrderServer = require('./server')
    const serverPort = db.getSetting('serverPort') || '3080'
    orderServer = startOrderServer(parseInt(serverPort), db, () => mainWindow)
  } catch (err) {
    console.log('[POS] 點餐伺服器啟動失敗，POS 功能正常:', err.message)
  }

  // 註冊所有 IPC handlers
  registerIpcHandlers()

  createWindow()
})

app.on('window-all-closed', () => {
  if (orderServer) orderServer.close()
  if (db) db.close()
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// ===== IPC Handlers =====
function registerIpcHandlers() {
  // ----- Products -----
  ipcMain.handle('db:getProducts', () => db.getProducts())
  ipcMain.handle('db:addProduct', (_e, data) => db.addProduct(data))
  ipcMain.handle('db:updateProduct', (_e, id, data) => db.updateProduct(id, data))
  ipcMain.handle('db:deleteProduct', (_e, id) => db.deleteProduct(id))

  // ----- Members -----
  ipcMain.handle('db:getMembers', () => db.getMembers())
  ipcMain.handle('db:addMember', (_e, data) => db.addMember(data))
  ipcMain.handle('db:updateMember', (_e, id, data) => db.updateMember(id, data))
  ipcMain.handle('db:deleteMember', (_e, id) => db.deleteMember(id))

  // ----- Orders -----
  ipcMain.handle('db:getOrders', () => db.getOrders())
  // DEAD-13: db:addOrder / db:getOrderItems handlers 移除（渲染端零呼叫，見 preload.js 同批註解）。
  // db.addOrder() 這個 DB 方法本身保留 —— electron/server.js:75 顧客點餐流程直接呼叫它。

  // ----- Checkout (atomic) -----
  ipcMain.handle('db:checkout', (_e, orderData, stockUpdates, memberUpdate) => {
    return db.checkout(orderData, stockUpdates, memberUpdate)
  })

  // ----- Customer Orders -----
  ipcMain.handle('db:getCustomerOrders', () => db.getCustomerOrders())
  ipcMain.handle('db:updateOrderStatus', (_e, id, status) => {
    const result = db.updateOrderStatus(id, status)
    // 通知 WebSocket 客戶端
    if (orderServer && orderServer.broadcast) {
      orderServer.broadcast(JSON.stringify({ type: 'order-status', orderId: id, status }))
    }
    return result
  })

  // ----- Suppliers -----
  ipcMain.handle('db:getSuppliers', () => db.getSuppliers())
  ipcMain.handle('db:addSupplier', (_e, data) => db.addSupplier(data))
  ipcMain.handle('db:updateSupplier', (_e, id, data) => db.updateSupplier(id, data))
  ipcMain.handle('db:deleteSupplier', (_e, id) => db.deleteSupplier(id))

  // ----- Purchases -----
  ipcMain.handle('db:getPurchases', () => db.getPurchases())
  ipcMain.handle('db:addPurchase', (_e, data) => db.addPurchase(data))
  ipcMain.handle('db:updatePurchase', (_e, id, data) => db.updatePurchase(id, data))

  // ----- Promotions -----
  ipcMain.handle('db:getPromotions', () => db.getPromotions())
  ipcMain.handle('db:addPromotion', (_e, data) => db.addPromotion(data))
  ipcMain.handle('db:updatePromotion', (_e, id, data) => db.updatePromotion(id, data))
  ipcMain.handle('db:deletePromotion', (_e, id) => db.deletePromotion(id))

  // ----- Users -----
  ipcMain.handle('db:getUsers', () => db.getUsers())
  ipcMain.handle('db:addUser', (_e, data) => db.addUser(data))
  ipcMain.handle('db:updateUser', (_e, id, data) => db.updateUser(id, data))
  ipcMain.handle('db:deleteUser', (_e, id) => db.deleteUser(id))

  // ----- Audit Log -----
  ipcMain.handle('db:getAuditLogs', (_e, filters) => db.getAuditLogs(filters))
  ipcMain.handle('db:writeAuditLog', (_e, entry) => db.writeAuditLog(entry))

  // ----- Manual Journal -----
  ipcMain.handle('db:getManualJournal', () => db.getManualJournal())
  ipcMain.handle('db:addManualEntry', (_e, data) => db.addManualEntry(data))
  ipcMain.handle('db:deleteManualEntry', (_e, id) => db.deleteManualEntry(id))

  // ----- Backups -----
  ipcMain.handle('db:getBackups', () => db.getBackups())
  ipcMain.handle('db:createBackup', (_e, label, createdBy) => db.createBackup(label, createdBy))
  ipcMain.handle('db:restoreBackup', (_e, id) => db.restoreBackup(id))
  ipcMain.handle('db:exportData', () => db.exportData())
  ipcMain.handle('db:importData', (_e, data) => db.importData(data))

  // ----- Settings -----
  ipcMain.handle('settings:get', (_e, key) => db.getSetting(key))
  ipcMain.handle('settings:set', (_e, key, value) => db.setSetting(key, value))
  ipcMain.handle('settings:getAll', () => db.getAllSettings())

  // ----- Migration -----
  ipcMain.handle('db:migrateFromLocalStorage', (_e, data) => db.migrateFromLocalStorage(data))
  ipcMain.handle('db:isEmpty', () => db.isEmpty())

  // ----- Refund -----
  ipcMain.handle('db:refundOrder', (_e, origId, refundData, stockUpdates, memberUpdate) =>
    db.refundOrder(origId, refundData, stockUpdates, memberUpdate))

  // ----- Held Orders -----
  ipcMain.handle('db:getHeldOrders', () => db.getHeldOrders())
  ipcMain.handle('db:addHeldOrder', (_e, data) => db.addHeldOrder(data))
  ipcMain.handle('db:deleteHeldOrder', (_e, id) => db.deleteHeldOrder(id))

  // ----- Shifts -----
  ipcMain.handle('db:getShifts', () => db.getShifts())
  ipcMain.handle('db:getOpenShift', () => db.getOpenShift())
  ipcMain.handle('db:openShift', (_e, data) => db.openShift(data))
  ipcMain.handle('db:closeShift', (_e, id, data) => db.closeShift(id, data))
  ipcMain.handle('db:getCashLog', (_e, shiftId) => db.getCashLog(shiftId))
  ipcMain.handle('db:addCashLog', (_e, data) => db.addCashLog(data))

  // ----- Waste -----
  ipcMain.handle('db:getWasteLog', () => db.getWasteLog())
  ipcMain.handle('db:addWaste', (_e, data) => db.addWaste(data))
  ipcMain.handle('db:deleteWaste', (_e, id) => db.deleteWaste(id))

  // ----- Topups -----
  ipcMain.handle('db:getTopups', (_e, memberId) => db.getTopups(memberId))
  ipcMain.handle('db:addTopup', (_e, data) => db.addTopup(data))

  // ----- Kasbon 賒帳 (Credit Ledger) -----
  // 商業規則（tier 閘門、額度、驗證）在 electron/kasbon-shared.js，與 Express 路由共用同一套邏輯。
  // kasbon.* 一律回傳 { success, ... } 結構化結果、內部 try/catch，不會跨 IPC throw。
  const kasbon = require('./kasbon-shared')
  // 桌面 UI 自行做分頁/篩選，這裡放寬 limit 避免超過 50 筆時清單被截斷
  ipcMain.handle('db:getKastonRecords', (_e, memberId) => kasbon.listKasbonRecords(db, { memberId, limit: 10000 }))
  ipcMain.handle('db:getKastonRecord', (_e, id) => kasbon.getKasbonRecordDetail(db, id))
  ipcMain.handle('db:addKastonRecord', (_e, data) => kasbon.createKasbon(db, kasbon.getSubscription(db), data))
  ipcMain.handle('db:recordKastonPayment', (_e, data) => kasbon.recordPayment(db, data))
  ipcMain.handle('db:getMemberKastonBalance', (_e, memberId) => kasbon.getMemberKasbonSummary(db, memberId))
  ipcMain.handle('db:getKastonPayments', (_e, recordId) => kasbon.listPayments(db, recordId))
  ipcMain.handle('db:getKastonStoreTotal', () => kasbon.getStoreTotal(db))
  ipcMain.handle('db:getKastonAgingReport', () => kasbon.getAgingReport(db))

  // ----- License 授權金鑰 -----
  // 不信任渲染端傳來的任何 tier 字串——每次 getStatus/activate 都用 electron/license.js
  // 重新驗證簽章，settings 裡只存原始 licenseCode，衍生出的 subscriptionTier 每次都重寫。
  const license = require('./license')
  ipcMain.handle('license:getStatus', () => {
    const code = db.getSetting('licenseCode')
    if (!code) return { valid: false, reason: 'absent' }
    return license.verifyLicense(code)
  })
  ipcMain.handle('license:activate', (_e, code) => {
    const result = license.verifyLicense(code)
    if (!result.valid) {
      return result
    }
    db.setSetting('licenseCode', code)
    license.syncSubscriptionTier(db)
    return result
  })

  // ----- Printer -----
  ipcMain.handle('printer:printReceipt', async (_e, orderData) => {
    const printer = require('./printer')
    return printer.printReceipt(orderData, db.getAllSettings())
  })
  ipcMain.handle('printer:openCashDrawer', async () => {
    const printer = require('./printer')
    return printer.openCashDrawer(db.getAllSettings())
  })
  ipcMain.handle('printer:testPrint', async () => {
    const printer = require('./printer')
    return printer.testPrint(db.getAllSettings())
  })
  ipcMain.handle('printer:getStatus', async () => {
    const printer = require('./printer')
    return printer.getStatus(db.getAllSettings())
  })

  // ----- Barcode -----
  ipcMain.handle('barcode:generateLabel', async (_e, product) => {
    const barcode = require('./barcode')
    return barcode.generateLabel(product)
  })
  ipcMain.handle('barcode:printLabels', async (_e, products, copies) => {
    const barcode = require('./barcode')
    return barcode.printLabels(products, copies, db.getAllSettings())
  })

  // ----- Server Info -----
  // DEAD-13: server:getLocalIP handler 移除（渲染端零呼叫）；getLocalIP() 函式本身保留，
  // 下面的 server:getStatus handler 仍在內部呼叫它組出 ip 欄位。
  ipcMain.handle('server:getStatus', () => ({
    running: !!orderServer,
    ip: getLocalIP(),
    port: orderServer?.getActualPort?.() || db.getSetting('serverPort') || '3080',
    tunnelUrl: orderServer?.getTunnelUrl?.() || null,
    tunnelEnabled: db.getSetting('enablePublicTunnel') === 'true',
  }))

  // 外網穿透（Cloudflare Tunnel）為 opt-in，店家在設定頁切換時即時生效，
  // 不需要重啟 App；設定值同時寫入 DB，讓下次開機時 electron/server.js 的 boot() 讀得到。
  ipcMain.handle('server:setTunnelEnabled', (_e, enabled) => {
    db.setSetting('enablePublicTunnel', enabled ? 'true' : 'false')
    if (orderServer) {
      if (enabled) orderServer.startTunnel?.()
      else orderServer.stopTunnel?.()
    }
    return { success: true, enabled: !!enabled }
  })
}
