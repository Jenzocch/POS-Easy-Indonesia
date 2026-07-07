/**
 * Kasbon (賒帳 Credit Ledger) API Routes
 * Express endpoints for recording credit sales and payments
 *
 * 商業邏輯全部集中在 electron/kasbon-shared.js（與 IPC 路徑共用），
 * 這裡只負責 HTTP 進出與狀態碼對應。
 * 注意：不可 require('../src/...')——打包後安裝包內沒有 src/。
 */

const shared = require('./kasbon-shared')

// 只允許本機呼叫的守門 middleware：
// 點餐伺服器會自動開 Cloudflare Tunnel 對公網放行（CORS *、無驗證），但賒帳是
// 店家的錢帳，桌面 UI 已改走 IPC，這些 HTTP 端點不該讓網際網路上任何人碰。
// 注意：經 cloudflared tunnel 進來的請求，socket 端看起來「來自 localhost」
// （cloudflared 在本機轉發），所以除了檢查 remoteAddress，只要帶有常見的
// tunnel/代理轉發標頭（cf-connecting-ip / x-forwarded-for / cf-ray / cdn-loop /
// forwarded / x-real-ip）也一律拒絕。
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const TUNNEL_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'cf-ray', 'cdn-loop', 'forwarded', 'x-real-ip']

function kasbonLocalOnly(req, res, next) {
  const remoteAddress = (req.socket && req.socket.remoteAddress) || ''
  const viaTunnel = TUNNEL_HEADERS.some(h => req.headers[h] !== undefined)
  if (!LOOPBACK_ADDRS.has(remoteAddress) || viaTunnel) {
    return res.status(403).json({
      success: false,
      error: 'Kasbon API is restricted to the local machine (loopback only). Use the POS desktop app.',
    })
  }
  next()
}

module.exports = function registerKastonRoutes(app, db, getSubscription) {
  // 所有 kasbon 相關路徑（含 /api/members/:id/kasbon）一律先過本機守門
  app.use('/api/kasbon', kasbonLocalOnly)
  app.use('/api/members/:id/kasbon', kasbonLocalOnly)

  // shared.* 一律回傳 { success, ..., httpStatus? }；httpStatus 只用於 HTTP 層，不進 response body
  const send = (res, result) => {
    const { httpStatus, ...body } = result
    res.status(httpStatus || (body.success ? 200 : 500)).json(body)
  }

  /**
   * Create kasbon (credit sale)
   * POST /api/kasbon
   */
  app.post('/api/kasbon', (req, res) => {
    send(res, shared.createKasbon(db, getSubscription(), req.body || {}))
  })

  /**
   * Record kasbon payment
   * POST /api/kasbon/:id/pay
   */
  app.post('/api/kasbon/:id/pay', (req, res) => {
    send(res, shared.recordPayment(db, { ...(req.body || {}), kastonRecordId: req.params.id }))
  })

  /**
   * AR Aging Report
   * GET /api/kasbon/reports/aging
   */
  app.get('/api/kasbon/reports/aging', (req, res) => {
    send(res, shared.getAgingReport(db))
  })

  /**
   * Get kasbon records (list with filters)
   * GET /api/kasbon?memberId=&status=&dateFrom=&dateTo=&skip=&limit=
   */
  app.get('/api/kasbon', (req, res) => {
    send(res, shared.listKasbonRecords(db, req.query || {}))
  })

  /**
   * Get kasbon record details
   * GET /api/kasbon/:id
   */
  app.get('/api/kasbon/:id', (req, res) => {
    send(res, shared.getKasbonRecordDetail(db, req.params.id))
  })

  /**
   * Get member kasbon summary
   * GET /api/members/:id/kasbon
   */
  app.get('/api/members/:id/kasbon', (req, res) => {
    send(res, shared.getMemberKasbonSummary(db, req.params.id))
  })
}
