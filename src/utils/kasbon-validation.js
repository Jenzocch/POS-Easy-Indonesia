/**
 * Kasbon (賒帳) validation schemas
 * Validates credit ledger inputs
 */

// Minimal validation without external dependency (if Zod not available)
// Can be replaced with Zod when dependency added

export function validateCreateKasbon({ memberId, amount, dueDate, notes }) {
  const errors = []

  // Required fields
  if (!memberId || typeof memberId !== 'string') {
    errors.push('memberId is required and must be string')
  }

  // Amount validation
  if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be positive number')
  }
  if (amount > 1e12) {
    // Sanity check: no transaction > 1 trillion IDR
    errors.push('amount exceeds maximum (1 trillion IDR)')
  }

  // Date validation (if provided)
  if (dueDate) {
    if (typeof dueDate !== 'string') {
      errors.push('dueDate must be ISO string')
    }
    // Try parsing to catch invalid dates
    try {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) {
        errors.push('dueDate is invalid')
      }
    } catch (e) {
      errors.push('dueDate parsing failed')
    }
  }

  // Notes: optional, max length
  if (notes && typeof notes !== 'string') {
    errors.push('notes must be string')
  }
  if (notes && notes.length > 500) {
    errors.push('notes exceeds max length (500 characters)')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateRecordPayment({ kastonRecordId, amount, paymentDate, paymentMethod, balanceDue }) {
  const errors = []

  // Required fields
  if (!kastonRecordId || typeof kastonRecordId !== 'string') {
    errors.push('kastonRecordId is required and must be string')
  }

  // Amount validation
  if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be positive number')
  }
  if (balanceDue !== undefined && amount > balanceDue) {
    errors.push(`amount (${amount}) exceeds balance due (${balanceDue})`)
  }

  // Payment date
  if (!paymentDate || typeof paymentDate !== 'string') {
    errors.push('paymentDate is required and must be ISO string')
  }
  try {
    const d = new Date(paymentDate)
    if (isNaN(d.getTime())) {
      errors.push('paymentDate is invalid')
    }
  } catch (e) {
    errors.push('paymentDate parsing failed')
  }

  // Payment method (if provided)
  const validMethods = ['cash', 'transfer', 'check', 'other']
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    errors.push(`paymentMethod must be one of: ${validMethods.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate Kasbon limits for subscription tier
 */
export function validateKastonLimit(currentBalance, newAmount, tierLimit) {
  if (currentBalance + newAmount > tierLimit) {
    return {
      valid: false,
      error: `Cannot exceed limit: ${currentBalance + newAmount} > ${tierLimit}`,
      difference: (currentBalance + newAmount) - tierLimit
    }
  }
  return { valid: true }
}
