/**
 * Kasbon (賒帳 Credit Ledger) API Routes
 * Express endpoints for recording credit sales and payments
 *
 * 商業邏輯全部集中在 electron/kasbon-shared.js（與 IPC 路徑共用），
 * 這裡只負責 HTTP 進出與狀態碼對應。
 * 注意：不可 require('../src/...')——打包後安裝包內沒有 src/。
 */

const shared = require('./kasbon-shared')

module.exports = function registerKastonRoutes(app, db, getSubscription) {
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
