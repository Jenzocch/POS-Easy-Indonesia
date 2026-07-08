const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ----- Products -----
  db: {
    getProducts: () => ipcRenderer.invoke('db:getProducts'),
    addProduct: (data) => ipcRenderer.invoke('db:addProduct', data),
    updateProduct: (id, data) => ipcRenderer.invoke('db:updateProduct', id, data),
    deleteProduct: (id) => ipcRenderer.invoke('db:deleteProduct', id),

    getMembers: () => ipcRenderer.invoke('db:getMembers'),
    addMember: (data) => ipcRenderer.invoke('db:addMember', data),
    updateMember: (id, data) => ipcRenderer.invoke('db:updateMember', id, data),
    deleteMember: (id) => ipcRenderer.invoke('db:deleteMember', id),

    getOrders: () => ipcRenderer.invoke('db:getOrders'),
    // DEAD-13: db:addOrder / db:getOrderItems IPC 通道渲染端零呼叫已移除（見報告精確清單）。
    // 顧客點餐用的 db.addOrder 是 electron/server.js 主行程內直接呼叫的 JS 方法，非透過此 IPC，不受影響。
    checkout: (orderData, stockUpdates, memberUpdate) =>
      ipcRenderer.invoke('db:checkout', orderData, stockUpdates, memberUpdate),

    getCustomerOrders: () => ipcRenderer.invoke('db:getCustomerOrders'),
    updateOrderStatus: (id, status) => ipcRenderer.invoke('db:updateOrderStatus', id, status),

    getSuppliers: () => ipcRenderer.invoke('db:getSuppliers'),
    addSupplier: (data) => ipcRenderer.invoke('db:addSupplier', data),
    updateSupplier: (id, data) => ipcRenderer.invoke('db:updateSupplier', id, data),
    deleteSupplier: (id) => ipcRenderer.invoke('db:deleteSupplier', id),

    getPurchases: () => ipcRenderer.invoke('db:getPurchases'),
    addPurchase: (data) => ipcRenderer.invoke('db:addPurchase', data),
    updatePurchase: (id, data) => ipcRenderer.invoke('db:updatePurchase', id, data),

    getPromotions: () => ipcRenderer.invoke('db:getPromotions'),
    addPromotion: (data) => ipcRenderer.invoke('db:addPromotion', data),
    updatePromotion: (id, data) => ipcRenderer.invoke('db:updatePromotion', id, data),
    deletePromotion: (id) => ipcRenderer.invoke('db:deletePromotion', id),

    getUsers: () => ipcRenderer.invoke('db:getUsers'),
    addUser: (data) => ipcRenderer.invoke('db:addUser', data),
    updateUser: (id, data) => ipcRenderer.invoke('db:updateUser', id, data),
    deleteUser: (id) => ipcRenderer.invoke('db:deleteUser', id),

    getAuditLogs: (filters) => ipcRenderer.invoke('db:getAuditLogs', filters),
    writeAuditLog: (entry) => ipcRenderer.invoke('db:writeAuditLog', entry),

    getManualJournal: () => ipcRenderer.invoke('db:getManualJournal'),
    addManualEntry: (data) => ipcRenderer.invoke('db:addManualEntry', data),
    deleteManualEntry: (id) => ipcRenderer.invoke('db:deleteManualEntry', id),

    getBackups: () => ipcRenderer.invoke('db:getBackups'),
    createBackup: (label, createdBy) => ipcRenderer.invoke('db:createBackup', label, createdBy),
    restoreBackup: (id) => ipcRenderer.invoke('db:restoreBackup', id),
    exportData: () => ipcRenderer.invoke('db:exportData'),
    importData: (data) => ipcRenderer.invoke('db:importData', data),

    migrateFromLocalStorage: (data) => ipcRenderer.invoke('db:migrateFromLocalStorage', data),
    isEmpty: () => ipcRenderer.invoke('db:isEmpty'),

    // ----- Refund -----
    refundOrder: (origId, refundData, stockUpdates, memberUpdate) =>
      ipcRenderer.invoke('db:refundOrder', origId, refundData, stockUpdates, memberUpdate),

    // ----- Held Orders -----
    getHeldOrders: () => ipcRenderer.invoke('db:getHeldOrders'),
    addHeldOrder: (data) => ipcRenderer.invoke('db:addHeldOrder', data),
    deleteHeldOrder: (id) => ipcRenderer.invoke('db:deleteHeldOrder', id),

    // ----- Shifts -----
    getShifts: () => ipcRenderer.invoke('db:getShifts'),
    getOpenShift: () => ipcRenderer.invoke('db:getOpenShift'),
    openShift: (data) => ipcRenderer.invoke('db:openShift', data),
    closeShift: (id, data) => ipcRenderer.invoke('db:closeShift', id, data),
    getCashLog: (shiftId) => ipcRenderer.invoke('db:getCashLog', shiftId),
    addCashLog: (data) => ipcRenderer.invoke('db:addCashLog', data),

    // ----- Waste -----
    getWasteLog: () => ipcRenderer.invoke('db:getWasteLog'),
    addWaste: (data) => ipcRenderer.invoke('db:addWaste', data),
    deleteWaste: (id) => ipcRenderer.invoke('db:deleteWaste', id),

    // ----- Topups -----
    getTopups: (memberId) => ipcRenderer.invoke('db:getTopups', memberId),
    addTopup: (data) => ipcRenderer.invoke('db:addTopup', data),

    // ----- Kasbon 賒帳 (Credit Ledger) -----
    getKasbonRecords: (memberId) => ipcRenderer.invoke('db:getKasbonRecords', memberId),
    getKasbonRecord: (id) => ipcRenderer.invoke('db:getKasbonRecord', id),
    addKasbonRecord: (data) => ipcRenderer.invoke('db:addKasbonRecord', data),
    recordKasbonPayment: (data) => ipcRenderer.invoke('db:recordKasbonPayment', data),
    getMemberKasbonBalance: (memberId) => ipcRenderer.invoke('db:getMemberKasbonBalance', memberId),
    getKasbonPayments: (recordId) => ipcRenderer.invoke('db:getKasbonPayments', recordId),
    getKasbonStoreTotal: () => ipcRenderer.invoke('db:getKasbonStoreTotal'),
    getKasbonAgingReport: () => ipcRenderer.invoke('db:getKasbonAgingReport'),
  },

  // ----- Printer -----
  printer: {
    printReceipt: (orderData) => ipcRenderer.invoke('printer:printReceipt', orderData),
    openCashDrawer: () => ipcRenderer.invoke('printer:openCashDrawer'),
    testPrint: () => ipcRenderer.invoke('printer:testPrint'),
    getStatus: () => ipcRenderer.invoke('printer:getStatus'),
  },

  // ----- Barcode -----
  barcode: {
    generate: (text, options) => ipcRenderer.invoke('barcode:generate', text, options),
    generateLabel: (product) => ipcRenderer.invoke('barcode:generateLabel', product),
    printLabels: (products, copies) => ipcRenderer.invoke('barcode:printLabels', products, copies),
  },

  // ----- Settings -----
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // ----- License 授權金鑰 -----
  license: {
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
    activate: (code) => ipcRenderer.invoke('license:activate', code),
  },

  // ----- Server -----
  server: {
    // DEAD-13: server:getLocalIP IPC 通道渲染端零呼叫已移除；getLocalIP() 這個 plain function
    // 仍保留在 main.js，getStatus handler 內部照樣呼叫它組出 ip 欄位，不受影響。
    getStatus: () => ipcRenderer.invoke('server:getStatus'),
    setTunnelEnabled: (enabled) => ipcRenderer.invoke('server:setTunnelEnabled', enabled),
  },

  // ----- Events -----
  onNewOrder: (callback) => {
    const handler = (_e, order) => callback(order)
    ipcRenderer.on('customer-order:new', handler)
    return () => ipcRenderer.removeListener('customer-order:new', handler)
  },
})
