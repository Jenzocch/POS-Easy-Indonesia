/**
 * Kasbon (賒帳 Credit Ledger) API Routes
 * Express endpoints for recording credit sales and payments
 */

const { validateCreateKasbon, validateRecordPayment, validateKastonLimit } = require('../src/utils/kasbon-validation')
const { KASBON_LIMITS } = require('../src/types/kasbon')

module.exports = function registerKastonRoutes(app, db, getSubscription) {
  /**
   * Create kasbon (credit sale)
   * POST /api/kasbon
   */
  app.post('/api/kasbon', (req, res) => {
    try {
      const { memberId, amount, dueDate, notes, createdBy } = req.body

      // Validate input
      const validation = validateCreateKasbon({ memberId, amount, dueDate, notes })
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors
        })
      }

      // Check subscription tier
      const subscription = getSubscription()
      if (subscription.tier === 'free') {
        return res.status(403).json({
          success: false,
          error: 'Kasbon is not available in Free tier'
        })
      }

      // Check tier limits
      const limits = KASBON_LIMITS[subscription.tier] || { perMember: 0, perStore: 0 }
      const member = db.getMemberById(memberId)
      if (!member) {
        return res.status(404).json({
          success: false,
          error: 'Member not found'
        })
      }

      const memberBalance = db.getMemberKastonBalance(memberId)
      const currentBalance = memberBalance?.balanceDue || 0

      // Validate against per-member limit
      const limitCheck = validateKastonLimit(currentBalance, amount, limits.perMember)
      if (!limitCheck.valid) {
        return res.status(422).json({
          success: false,
          error: limitCheck.error,
          exceeded: limitCheck.difference
        })
      }

      // Check store-level total AR
      const allBalance = db.prepare('SELECT COALESCE(SUM(balanceDue), 0) as total FROM kasbon_records WHERE status != ?').get('closed')
      const storeTotal = allBalance?.total || 0
      if (storeTotal + amount > limits.perStore) {
        return res.status(422).json({
          success: false,
          error: 'Store credit limit exceeded',
          currentTotal: storeTotal,
          limit: limits.perStore,
          exceeded: (storeTotal + amount) - limits.perStore
        })
      }

      // Create kasbon record
      const result = db.addKastonRecord({
        memberId,
        amount,
        principalAmount: amount,
        transactionType: 'credit_sale',
        transactionDate: new Date().toISOString(),
        dueDate: dueDate || null,
        notes: notes || '',
        createdBy: createdBy || 'system'
      })

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create kasbon record'
        })
      }

      const record = db.getKastonRecord(result.id)

      res.json({
        success: true,
        data: record,
        message: `Kasbon created: IDR ${amount.toLocaleString('id-ID')} for ${member.name}`
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })

  /**
   * Record kasbon payment
   * POST /api/kasbon/:id/pay
   */
  app.post('/api/kasbon/:id/pay', (req, res) => {
    try {
      const { amount, paymentDate, paymentMethod, referenceNumber, notes, createdBy } = req.body
      const kastonRecordId = req.params.id

      // Validate input
      const record = db.getKastonRecord(kastonRecordId)
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Kasbon record not found'
        })
      }

      const validation = validateRecordPayment({
        kastonRecordId,
        amount,
        paymentDate,
        paymentMethod,
        balanceDue: record.balanceDue
      })

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors
        })
      }

      // Record payment
      const result = db.recordKastonPayment({
        kastonRecordId,
        amount,
        paymentDate: paymentDate || new Date().toISOString(),
        paymentMethod: paymentMethod || 'cash',
        referenceNumber: referenceNumber || '',
        notes: notes || '',
        createdBy: createdBy || 'system'
      })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        })
      }

      const updatedRecord = db.getKastonRecord(kastonRecordId)

      res.json({
        success: true,
        data: {
          payment: result,
          record: updatedRecord
        },
        message: `Payment recorded: IDR ${amount.toLocaleString('id-ID')} | Status: ${result.newStatus}`
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })

  /**
   * Get kasbon records (list with filters)
   * GET /api/kasbon?memberId=&status=&dateFrom=&dateTo=
   */
  app.get('/api/kasbon', (req, res) => {
    try {
      const { memberId, status, dateFrom, dateTo, skip = 0, limit = 50 } = req.query

      let records = db.getKastonRecords(memberId || null)

      // Filter by status
      if (status) {
        records = records.filter(r => r.status === status)
      }

      // Filter by date range
      if (dateFrom || dateTo) {
        records = records.filter(r => {
          if (dateFrom && r.transactionDate < dateFrom) return false
          if (dateTo && r.transactionDate > dateTo) return false
          return true
        })
      }

      // Pagination
      const total = records.length
      const paginated = records.slice(parseInt(skip), parseInt(skip) + parseInt(limit))

      // Enrich with member info and payment count
      const enriched = paginated.map(r => {
        const member = db.getMemberById(r.memberId)
        const payments = db.getKastonPayments(r.id)
        return {
          ...r,
          memberName: member?.name || '',
          memberPhone: member?.phone || '',
          paymentCount: payments?.length || 0
        }
      })

      res.json({
        success: true,
        data: enriched,
        pagination: {
          total,
          skip: parseInt(skip),
          limit: parseInt(limit),
          returned: enriched.length
        }
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })

  /**
   * Get kasbon record details
   * GET /api/kasbon/:id
   */
  app.get('/api/kasbon/:id', (req, res) => {
    try {
      const record = db.getKastonRecord(req.params.id)
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Kasbon record not found'
        })
      }

      const member = db.getMemberById(record.memberId)
      const payments = db.getKastonPayments(record.id)

      res.json({
        success: true,
        data: {
          record,
          member: member ? {
            id: member.id,
            name: member.name,
            phone: member.phone,
            tier: member.tier
          } : null,
          payments: payments || [],
          summary: {
            principal: record.principalAmount,
            paid: record.paidAmount,
            remaining: record.balanceDue,
            paymentCount: payments?.length || 0
          }
        }
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })

  /**
   * Get member kasbon summary
   * GET /api/members/:id/kasbon
   */
  app.get('/api/members/:id/kasbon', (req, res) => {
    try {
      const member = db.getMemberById(req.params.id)
      if (!member) {
        return res.status(404).json({
          success: false,
          error: 'Member not found'
        })
      }

      const balance = db.getMemberKastonBalance(req.params.id)
      const records = db.getKastonRecords(req.params.id)

      res.json({
        success: true,
        data: {
          member: {
            id: member.id,
            name: member.name,
            phone: member.phone
          },
          balance: balance || {
            totalCredit: 0,
            totalPaid: 0,
            balanceDue: 0,
            activeRecordCount: 0,
            isBlacklisted: false
          },
          records: records || [],
          status: records?.filter(r => r.status === 'open').length > 0 ? 'active' : 'settled'
        }
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })

  /**
   * AR Aging Report
   * GET /api/kasbon/reports/aging
   */
  app.get('/api/kasbon/reports/aging', (req, res) => {
    try {
      const today = new Date()
      const allRecords = db.getKastonRecords(null)

      const aged = {
        current: [],      // Due date in future or null
        overdue30: [],    // 0-30 days overdue
        overdue60: [],    // 30-60 days overdue
        overdue90: []     // 90+ days overdue
      }

      for (const r of allRecords) {
        if (r.status === 'closed') continue

        const dueDate = r.dueDate ? new Date(r.dueDate) : null
        if (!dueDate || dueDate > today) {
          aged.current.push(r)
          continue
        }

        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24))
        if (daysOverdue <= 30) aged.overdue30.push(r)
        else if (daysOverdue <= 60) aged.overdue60.push(r)
        else aged.overdue90.push(r)
      }

      const summary = {
        totalAR: allRecords.reduce((sum, r) => sum + (r.balanceDue || 0), 0),
        totalRecords: allRecords.filter(r => r.status !== 'closed').length,
        buckets: {
          current: { count: aged.current.length, amount: aged.current.reduce((s, r) => s + r.balanceDue, 0) },
          overdue30: { count: aged.overdue30.length, amount: aged.overdue30.reduce((s, r) => s + r.balanceDue, 0) },
          overdue60: { count: aged.overdue60.length, amount: aged.overdue60.reduce((s, r) => s + r.balanceDue, 0) },
          overdue90: { count: aged.overdue90.length, amount: aged.overdue90.reduce((s, r) => s + r.balanceDue, 0) }
        }
      }

      res.json({
        success: true,
        data: {
          summary,
          detail: aged
        }
      })
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message
      })
    }
  })
}
