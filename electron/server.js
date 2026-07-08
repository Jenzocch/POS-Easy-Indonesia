/**
 * 顧客點餐伺服器
 * Express HTTP + WebSocket
 * Cloudflare Tunnel（讓外網/不同網路也能掃碼點餐）為選擇性功能，
 * 需店家在設定頁開啟 enablePublicTunnel 才會啟動，預設關閉。
 */
const express = require('express')
const { WebSocketServer } = require('ws')
const path = require('path')
const net = require('net')

module.exports = function startOrderServer(port, db, getMainWindow) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // 只信任「來自 loopback 的連線」所帶的 X-Forwarded-For。
  // 這台伺服器有兩種來源：(1) 區網內的客人裝置直連 —— socket 位址就是真實裝置 IP，無法偽造；
  // (2) Cloudflare Tunnel（cloudflared 常駐在同一台機器，透過 loopback 轉發到這裡）—— 這種連線
  // 的 socket 位址永遠是 127.0.0.1，真正的訪客 IP 要看 Cloudflare 附加的 X-Forwarded-For。
  // 用 Express 內建的 'loopback' 模式：只有連線本身就是 loopback 時才採信標頭，
  // 區網攻擊者直連時無法偽造 X-Forwarded-For 來繞過下面的限流。
  app.set('trust proxy', 'loopback')

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.sendStatus(200)
    next()
  })

  // ===== 客人下單限流（避免惡意灌單 / DoS）=====
  // House style 參考 src/utils/security.js 的 checkRateLimit()：per-key 滑動視窗，
  // 超過門檻後短暫鎖定。門檻設得寬鬆，讓一家人在幾分鐘內連下 3~4 張單不會被擋，
  // 但每秒數十次的灌單會被擋下。
  const ORDER_RATE_LIMIT_MAX = 8          // 每個視窗內最多幾張訂單
  const ORDER_RATE_LIMIT_WINDOW_MS = 60 * 1000   // 視窗長度：1 分鐘
  const ORDER_RATE_LIMIT_LOCK_MS = 5 * 60 * 1000 // 超過門檻後鎖定：5 分鐘
  const orderRateMap = new Map()

  function checkOrderRateLimit(key) {
    const now = Date.now()
    const entry = orderRateMap.get(key) || { attempts: 0, resetAt: now + ORDER_RATE_LIMIT_WINDOW_MS, lockedUntil: 0 }

    if (now < entry.lockedUntil) {
      return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) }
    }
    if (now > entry.resetAt) {
      entry.attempts = 0
      entry.resetAt = now + ORDER_RATE_LIMIT_WINDOW_MS
    }

    entry.attempts++
    orderRateMap.set(key, entry)

    if (entry.attempts > ORDER_RATE_LIMIT_MAX) {
      entry.lockedUntil = now + ORDER_RATE_LIMIT_LOCK_MS
      orderRateMap.set(key, entry)
      return { allowed: false, retryAfter: Math.ceil(ORDER_RATE_LIMIT_LOCK_MS / 1000) }
    }

    return { allowed: true }
  }

  // 定期清掉過期紀錄，避免長時間運作下 Map 無限成長
  const rateCleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of orderRateMap) {
      if (now > entry.resetAt && now > entry.lockedUntil) orderRateMap.delete(key)
    }
  }, 10 * 60 * 1000)
  rateCleanupTimer.unref?.()

  // 客人自填欄位長度上限（避免灌爆資料庫；超過直接拒絕，不做靜默截斷以免混淆真實訂單內容）
  const MAX_NOTE_LEN = 500
  const MAX_NAME_LEN = 100
  const MAX_TABLE_LEN = 50

  // 提供客人點餐頁面
  app.use('/menu', express.static(path.join(__dirname, '../public/menu')))

  // ===== API =====
  app.get('/api/menu', (req, res) => {
    try {
      const products = db.getProducts().filter(p => p.stock > 0 && p.price > 0)
      const categories = [...new Set(products.map(p => p.category))]
      const storeName = db.getSetting('storeName') || '雜貨店'
      res.json({ success: true, products, categories, storeName })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.post('/api/order', (req, res) => {
    try {
      const rl = checkOrderRateLimit(req.ip)
      if (!rl.allowed) {
        res.set('Retry-After', String(rl.retryAfter))
        return res.status(429).json({
          success: false,
          error: '下單太頻繁，請稍後再試',
          retryAfter: rl.retryAfter,
        })
      }

      const { items, note, tableNum, customerName } = req.body
      if (!items || !items.length) {
        return res.status(400).json({ success: false, error: '請至少選擇一項商品' })
      }
      if (typeof note === 'string' && note.length > MAX_NOTE_LEN) {
        return res.status(400).json({ success: false, error: `備註過長（上限 ${MAX_NOTE_LEN} 字）` })
      }
      if (typeof customerName === 'string' && customerName.length > MAX_NAME_LEN) {
        return res.status(400).json({ success: false, error: `姓名過長（上限 ${MAX_NAME_LEN} 字）` })
      }
      if (typeof tableNum === 'string' && tableNum.length > MAX_TABLE_LEN) {
        return res.status(400).json({ success: false, error: `桌號過長（上限 ${MAX_TABLE_LEN} 字）` })
      }

      let subtotal = 0
      const validItems = []
      for (const item of items) {
        const product = db.getProducts().find(p => p.id === item.id)
        if (!product) continue
        if (product.stock < item.qty) continue
        validItems.push({
          id: product.id, productId: product.id,
          name: product.name, price: product.price, qty: item.qty,
        })
        subtotal += product.price * item.qty
      }

      if (!validItems.length) {
        return res.status(400).json({ success: false, error: '所選商品無庫存' })
      }

      const order = {
        id: 'CO' + Date.now(), items: validItems,
        subtotal, discount: 0, total: subtotal,
        payMethod: 'pending', paid: 0, change: 0,
        memberId: '', pointsUsed: 0, pointsEarned: 0,
        time: new Date().toISOString(),
        source: 'customer', status: 'pending',
        tableNum: tableNum || '',
        note: (customerName ? customerName + ': ' : '') + (note || ''),
      }

      db.addOrder(order)

      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('customer-order:new', order)
      }
      broadcast(JSON.stringify({ type: 'order-created', order }))

      res.json({ success: true, orderId: order.id, total: order.total })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.get('/api/order/:id', (req, res) => {
    try {
      const orders = db.getOrders()
      const order = orders.find(o => o.id === req.params.id)
      if (!order) return res.status(404).json({ success: false, error: '找不到訂單' })
      res.json({ success: true, order: { id: order.id, status: order.status, total: order.total } })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })

  app.get('/api/info', (req, res) => {
    res.json({ storeName: db.getSetting('storeName') || '雜貨店', version: '2.0.0' })
  })

  // ===== Server 啟動 =====
  const clients = new Set()
  let server = null
  let actualPort = port
  let tunnelUrl = null
  let tunnelStop = null
  let cfChildRef = null

  function broadcast(message) {
    for (const client of clients) {
      try { if (client.readyState === 1) client.send(message) } catch {}
    }
  }

  // 啟動 Cloudflare Tunnel（免費、無警告頁面、客人掃碼直接進入公網）。
  // 這一步是「選擇性」的（opt-in）：只有店家在設定頁明確開啟 enablePublicTunnel 時才會呼叫，
  // 預設關閉——因為公網網址一旦外流，任何人都能連進 /api/order、/api/menu，
  // 只靠本檔案的限流/長度檢查降低風險，店家若不需要外送/外帶跨網點餐，不應該預設就對外曝露。
  function startTunnel() {
    if (cfChildRef) return // 已經在跑，不重複啟動
    try {
      const { bin: cfBin } = require('cloudflared')
      const { execFile } = require('child_process')

      const cfChild = execFile(cfBin, ['tunnel', '--url', `http://localhost:${actualPort}`, '--no-autoupdate'])
      cfChildRef = cfChild
      tunnelStop = () => { try { cfChild.kill() } catch {} }

      // 從 stderr 中解析 tunnel URL
      cfChild.stderr.on('data', (data) => {
        const text = data.toString()
        const match = text.match(/https:\/\/[^\s]+\.trycloudflare\.com/)
        if (match && !tunnelUrl) {
          tunnelUrl = match[0]
          console.log(`[POS] 外網點餐網址: ${tunnelUrl}/menu`)
        }
      })
      cfChild.on('exit', () => {
        tunnelUrl = null
        cfChildRef = null
        console.log('[POS] 外網穿透已斷線')
      })
    } catch (err) {
      console.log('[POS] 外網穿透啟動失敗:', err.message)
    }
  }

  function stopTunnel() {
    if (tunnelStop) tunnelStop()
    tunnelStop = null
    cfChildRef = null
    tunnelUrl = null
  }

  function tryPort(p) {
    return new Promise((resolve) => {
      const tester = net.createServer()
      tester.once('error', () => resolve(false))
      tester.once('listening', () => { tester.close(); resolve(true) })
      tester.listen(p, '0.0.0.0')
    })
  }

  async function boot() {
    // 找可用 port
    for (let p = port; p < port + 10; p++) {
      if (await tryPort(p)) {
        actualPort = p
        break
      }
    }

    // 啟動 HTTP server
    server = await new Promise((resolve) => {
      const s = app.listen(actualPort, '0.0.0.0', () => {
        console.log(`[POS] 點餐伺服器已啟動: http://0.0.0.0:${actualPort}`)
        resolve(s)
      })
      s.on('error', (err) => {
        console.log(`[POS] 伺服器啟動失敗: ${err.message}`)
        resolve(null)
      })
    })

    if (!server) return

    // WebSocket
    const wss = new WebSocketServer({ server })
    wss.on('connection', (ws) => {
      clients.add(ws)
      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    })

    // 是否自動啟動 Cloudflare Tunnel 由設定值決定，預設關閉（opt-in）
    try {
      if (db.getSetting('enablePublicTunnel') === 'true') {
        startTunnel()
      }
    } catch (err) {
      console.log('[POS] 讀取外網穿透設定失敗，維持不啟動:', err.message)
    }
  }

  boot()

  return {
    app,
    broadcast,
    getActualPort: () => actualPort,
    getTunnelUrl: () => tunnelUrl,
    isTunnelRunning: () => !!cfChildRef,
    startTunnel,
    stopTunnel,
    close: () => { stopTunnel(); if (server) server.close() },
  }
}
