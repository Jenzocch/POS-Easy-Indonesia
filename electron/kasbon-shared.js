/**
 * Kasbon (賒帳 Credit Ledger) — 共用商業邏輯 (CommonJS)
 *
 * 同時供兩條路徑使用：
 *   1. electron/main.js 的 IPC handlers（POS 桌面 UI 走這條）
 *   2. electron/kasbon-routes.js 的 Express routes（點餐伺服器仍註冊這些端點）
 *
 * 為什麼不 require('../src/...')：
 *   - electron-builder 的 files 只打包 dist/、electron/、public/menu/，src/ 不在安裝包內。
 *   - src/utils/kasbon-validation.js 是 ESM（export function），main process 的 CJS require 會直接
 *     SyntaxError；src/types/kasbon.ts 是 TypeScript，require 會 MODULE_NOT_FOUND。
 *   因此驗證與額度表在此各留一份 CJS 版；修改時請與下列來源同步：
 *   - KASBON_LIMITS  → source of truth: src/types/kasbon.ts
 *   - validate*      → source of truth: src/utils/kasbon-validation.js（有 vitest 測試）
 *
 * 所有對外函式一律回傳 { success, ... } 結構化結果，內部 try/catch，絕不 throw——
 * 避免錯誤跨 IPC 拋出讓遠端店家的 renderer 收到 unhandled rejection。
 */

// 訂閱層級額度上限（IDR）— 複製自 src/types/kasbon.ts KASBON_LIMITS
const KASBON_LIMITS = {
  free: { perMember: 0, perStore: 0 },           // Kasbon disabled
  warung: { perMember: 50e6, perStore: 500e6 },  // 50M per member, 500M total
  resto: { perMember: 500e6, perStore: 5e9 },    // 500M per member, 5B total
}

// ===== Validation（CJS 鏡像，邏輯與 src/utils/kasbon-validation.js 一致）=====

function validateCreateKasbon({ memberId, amount, dueDate, notes }) {
  const errors = []
  if (!memberId || typeof memberId !== 'string') {
    errors.push('memberId is required and must be string')
  }
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    errors.push('amount must be positive number')
  }
  if (amount > 1e12) {
    errors.push('amount exceeds maximum (1 trillion IDR)')
  }
  if (dueDate) {
    if (typeof dueDate !== 'string') {
      errors.push('dueDate must be ISO string')
    } else if (isNaN(new Date(dueDate).getTime())) {
      errors.push('dueDate is invalid')
    }
  }
  if (notes && typeof notes !== 'string') {
    errors.push('notes must be string')
  }
  if (notes && typeof notes === 'string' && notes.length > 500) {
    errors.push('notes exceeds max length (500 characters)')
  }
  return { valid: errors.length === 0, errors }
}

function validateRecordPayment({ kastonRecordId, amount, paymentDate, paymentMethod, balanceDue }) {
  const errors = []
  if (!kastonRecordId || typeof kastonRecordId !== 'string') {
    errors.push('kastonRecordId is required and must be string')
  }
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    errors.push('amount must be positive number')
  }
  if (balanceDue !== undefined && amount > balanceDue) {
    errors.push(`amount (${amount}) exceeds balance due (${balanceDue})`)
  }
  if (!paymentDate || typeof paymentDate !== 'string') {
    errors.push('paymentDate is required and must be ISO string')
  } else if (isNaN(new Date(paymentDate).getTime())) {
    errors.push('paymentDate is invalid')
  }
  const validMethods = ['cash', 'transfer', 'check', 'other']
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    errors.push(`paymentMethod must be one of: ${validMethods.join(', ')}`)
  }
  return { valid: errors.length === 0, errors }
}

function validateKastonLimit(currentBalance, newAmount, tierLimit) {
  if (currentBalance + newAmount > tierLimit) {
    return {
      valid: false,
      error: `Cannot exceed limit: ${currentBalance + newAmount} > ${tierLimit}`,
      difference: (currentBalance + newAmount) - tierLimit,
    }
  }
  return { valid: true }
}

// ===== Subscription =====

/** 從 db settings 讀出訂閱資訊（存的可能是 JSON 或純字串） */
function getSubscription(db) {
  let raw = 'free'
  try { raw = db.getSetting('subscriptionTier') || 'free' } catch { /* settings 讀取失敗視同 free */ }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    return { tier: String(parsed) }
  } catch {
    return { tier: raw }
  }
}

// ===== 內部小工具 =====

function enrichRecord(db, r) {
  if (!r) return r
  let member = null
  let payments = []
  try { member = db.getMemberById(r.memberId) } catch { /* 顯示層資訊，失敗不致命 */ }
  try { payments = db.getKastonPayments(r.id) || [] } catch { /* 同上 */ }
  return {
    ...r,
    memberName: (member && member.name) || '',
    memberPhone: (member && member.phone) || '',
    paymentCount: payments.length,
  }
}

// ===== 對外 API（皆回傳 {success, ...}，httpStatus 供 Express 路由對應狀態碼用）=====

/** 建立賒帳（含 tier 閘門、單一會員額度、全店 AR 總額檢查） */
function createKasbon(db, subscription, body) {
  try {
    const input = body || {}
    const memberId = input.memberId
    // IDR 無小數 — 寫入前一律取整
    const amount = Math.round(Number(input.amount) || 0)
    const dueDate = input.dueDate || null
    const notes = input.notes || ''

    const validation = validateCreateKasbon({ memberId, amount, dueDate, notes })
    if (!validation.valid) {
      return { success: false, error: 'Validation failed', errors: validation.errors, httpStatus: 400 }
    }

    const tier = (subscription && subscription.tier) || 'free'
    if (tier === 'free') {
      return { success: false, error: 'Kasbon is not available in Free tier', httpStatus: 403 }
    }

    const limits = KASBON_LIMITS[tier] || { perMember: 0, perStore: 0 }
    const member = db.getMemberById(memberId)
    if (!member) {
      return { success: false, error: 'Member not found', httpStatus: 404 }
    }

    const memberBalance = db.getMemberKastonBalance(memberId)
    const currentBalance = (memberBalance && memberBalance.balanceDue) || 0

    // 單一會員額度
    const limitCheck = validateKastonLimit(currentBalance, amount, limits.perMember)
    if (!limitCheck.valid) {
      return { success: false, error: limitCheck.error, exceeded: limitCheck.difference, httpStatus: 422 }
    }

    // 全店應收帳款總額（透過 database.js 的包裝方法，不直接 db.prepare）
    const storeTotal = db.getKastonStoreTotal()
    if (storeTotal + amount > limits.perStore) {
      return {
        success: false,
        error: 'Store credit limit exceeded',
        currentTotal: storeTotal,
        limit: limits.perStore,
        exceeded: (storeTotal + amount) - limits.perStore,
        httpStatus: 422,
      }
    }

    const result = db.addKastonRecord({
      memberId,
      principalAmount: amount,
      transactionType: 'credit_sale',
      transactionDate: new Date().toISOString(),
      dueDate,
      notes,
      createdBy: input.createdBy || 'system',
    })
    if (!result || !result.success) {
      return { success: false, error: (result && result.error) || 'Failed to create kasbon record', httpStatus: 500 }
    }

    const record = enrichRecord(db, db.getKastonRecord(result.id))
    return {
      success: true,
      data: record,
      message: `Kasbon created: IDR ${amount.toLocaleString('id-ID')} for ${member.name}`,
    }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

/** 記錄還款 */
function recordPayment(db, body) {
  try {
    const input = body || {}
    const kastonRecordId = input.kastonRecordId
    const amount = Math.round(Number(input.amount) || 0)
    const paymentDate = input.paymentDate || new Date().toISOString()

    const record = kastonRecordId ? db.getKastonRecord(kastonRecordId) : null
    if (!record) {
      return { success: false, error: 'Kasbon record not found', httpStatus: 404 }
    }

    const validation = validateRecordPayment({
      kastonRecordId,
      amount,
      paymentDate,
      paymentMethod: input.paymentMethod,
      // 與取整後的餘額比較，舊資料殘留小數時仍可一次付清
      balanceDue: Math.round(record.balanceDue),
    })
    if (!validation.valid) {
      return { success: false, error: 'Validation failed', errors: validation.errors, httpStatus: 400 }
    }

    const result = db.recordKastonPayment({
      kastonRecordId,
      amount,
      paymentDate,
      paymentMethod: input.paymentMethod || 'cash',
      referenceNumber: input.referenceNumber || '',
      notes: input.notes || '',
      createdBy: input.createdBy || 'system',
    })
    if (!result || !result.success) {
      return { success: false, error: (result && result.error) || 'Failed to record payment', httpStatus: 400 }
    }

    const updatedRecord = enrichRecord(db, db.getKastonRecord(kastonRecordId))
    return {
      success: true,
      data: { payment: result, record: updatedRecord },
      message: `Payment recorded: IDR ${amount.toLocaleString('id-ID')} | Status: ${result.newStatus}`,
    }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

/** 賒帳清單（篩選 + 分頁 + 會員資訊補齊） */
function listKasbonRecords(db, query) {
  try {
    const q = query || {}
    const skip = parseInt(q.skip, 10) || 0
    const limit = parseInt(q.limit, 10) || 50

    let records = db.getKastonRecords(q.memberId || null)
    if (q.status) {
      records = records.filter(r => r.status === q.status)
    }
    if (q.dateFrom || q.dateTo) {
      records = records.filter(r => {
        if (q.dateFrom && r.transactionDate < q.dateFrom) return false
        if (q.dateTo && r.transactionDate > q.dateTo) return false
        return true
      })
    }

    const total = records.length
    const paginated = records.slice(skip, skip + limit)
    const enriched = paginated.map(r => enrichRecord(db, r))

    return {
      success: true,
      data: enriched,
      pagination: { total, skip, limit, returned: enriched.length },
    }
  } catch (err) {
    return { success: false, error: err.message, data: [], httpStatus: 500 }
  }
}

/** 單筆賒帳明細（含會員、還款紀錄、摘要） */
function getKasbonRecordDetail(db, id) {
  try {
    const record = db.getKastonRecord(id)
    if (!record) {
      return { success: false, error: 'Kasbon record not found', httpStatus: 404 }
    }
    const member = db.getMemberById(record.memberId)
    const payments = db.getKastonPayments(record.id) || []
    return {
      success: true,
      data: {
        record,
        member: member ? { id: member.id, name: member.name, phone: member.phone, tier: member.tier } : null,
        payments,
        summary: {
          principal: record.principalAmount,
          paid: record.paidAmount,
          remaining: record.balanceDue,
          paymentCount: payments.length,
        },
      },
    }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

/** 會員賒帳摘要 */
function getMemberKasbonSummary(db, memberId) {
  try {
    const member = db.getMemberById(memberId)
    if (!member) {
      return { success: false, error: 'Member not found', httpStatus: 404 }
    }
    const balance = db.getMemberKastonBalance(memberId)
    const records = db.getKastonRecords(memberId) || []
    return {
      success: true,
      data: {
        member: { id: member.id, name: member.name, phone: member.phone },
        balance: balance || {
          totalCredit: 0,
          totalPaid: 0,
          balanceDue: 0,
          activeRecordCount: 0,
          isBlacklisted: false,
        },
        records,
        status: records.filter(r => r.status === 'open').length > 0 ? 'active' : 'settled',
      },
    }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

/** AR 帳齡報表 */
function getAgingReport(db) {
  try {
    const today = new Date()
    const allRecords = db.getKastonRecords(null) || []

    // 補上 memberName 供報表顯示（原路由回傳裸 record，UI 的 memberName 會是空白）
    const withNames = allRecords.map(r => {
      let member = null
      try { member = db.getMemberById(r.memberId) } catch { /* 顯示層資訊 */ }
      return { ...r, memberName: (member && member.name) || '' }
    })

    const aged = { current: [], overdue30: [], overdue60: [], overdue90: [] }
    for (const r of withNames) {
      if (r.status === 'closed') continue
      const dueDate = r.dueDate ? new Date(r.dueDate) : null
      if (!dueDate || isNaN(dueDate.getTime()) || dueDate > today) {
        aged.current.push(r)
        continue
      }
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24))
      if (daysOverdue <= 30) aged.overdue30.push(r)
      else if (daysOverdue <= 60) aged.overdue60.push(r)
      else aged.overdue90.push(r)
    }

    const sumBalance = (arr) => arr.reduce((s, r) => s + (r.balanceDue || 0), 0)
    const summary = {
      totalAR: sumBalance(withNames.filter(r => r.status !== 'closed')),
      totalRecords: withNames.filter(r => r.status !== 'closed').length,
      buckets: {
        current: { count: aged.current.length, amount: sumBalance(aged.current) },
        overdue30: { count: aged.overdue30.length, amount: sumBalance(aged.overdue30) },
        overdue60: { count: aged.overdue60.length, amount: sumBalance(aged.overdue60) },
        overdue90: { count: aged.overdue90.length, amount: sumBalance(aged.overdue90) },
      },
    }

    return { success: true, data: { summary, detail: aged } }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

/** 某筆賒帳的還款紀錄 */
function listPayments(db, recordId) {
  try {
    return { success: true, data: db.getKastonPayments(recordId) || [] }
  } catch (err) {
    return { success: false, error: err.message, data: [], httpStatus: 500 }
  }
}

/** 全店未清賒帳總額 */
function getStoreTotal(db) {
  try {
    return { success: true, total: db.getKastonStoreTotal() }
  } catch (err) {
    return { success: false, error: err.message, httpStatus: 500 }
  }
}

module.exports = {
  KASBON_LIMITS,
  validateCreateKasbon,
  validateRecordPayment,
  validateKastonLimit,
  getSubscription,
  createKasbon,
  recordPayment,
  listKasbonRecords,
  getKasbonRecordDetail,
  getMemberKasbonSummary,
  getAgingReport,
  listPayments,
  getStoreTotal,
}
