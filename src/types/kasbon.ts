/**
 * Kasbon (賒帳 Credit Ledger) Types
 * Single-invoice credit tracking for members
 */

export type KastonTransactionType = 'credit_sale' | 'payment' | 'adjustment'
export type KastonStatus = 'open' | 'partial' | 'closed' | 'overdue'
export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'other'

/**
 * Kasbon Record: Single credit transaction
 */
export interface KastonRecord {
  id: string
  memberId: string
  transactionType: KastonTransactionType
  status: KastonStatus

  // Amounts (IDR)
  principalAmount: number        // Original credit amount
  paidAmount: number             // Amount paid so far
  balanceDue: number             // Principal - paid

  // Dates
  transactionDate: string        // ISO date or text
  dueDate: string | null         // Optional: due date for payment
  lastPaymentDate: string | null

  // Metadata
  notes: string
  createdBy: string
  createdAt: string              // ISO timestamp
  updatedAt: string
  deletedAt: string | null
}

/**
 * Kasbon Payment: Single payment against a Kasbon record
 */
export interface KastonPayment {
  id: string
  kasbon_record_id: string

  amount: number
  paymentDate: string            // ISO date or text
  paymentMethod?: PaymentMethod

  referenceNumber: string        // Invoice/check number
  notes: string

  createdBy: string
  createdAt: string
  deletedAt: string | null
}

/**
 * Member Kasbon Balance: Denormalized summary for fast lookups
 */
export interface MemberKastonBalance {
  id: string
  memberId: string

  totalCredit: number            // Total credit given
  totalPaid: number              // Total paid back
  balanceDue: number             // Total outstanding

  activeRecordCount: number      // Number of open kasbon records
  isBlacklisted: boolean         // Block new credit?

  updatedAt: string
}

/**
 * API Request: Create kasbon from credit sale
 */
export interface CreateKastonRequest {
  memberId: string
  amount: number
  dueDate?: string               // Optional: payment deadline
  notes?: string
  createdBy?: string
}

/**
 * API Request: Record payment
 */
export interface RecordPaymentRequest {
  kastonRecordId: string
  amount: number
  paymentDate: string
  paymentMethod?: PaymentMethod
  referenceNumber?: string
  notes?: string
  createdBy?: string
}

/**
 * API Response
 */
export interface KastonApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Subscription tier limits
 */
export interface KastonLimits {
  perMember: number              // Max balance per member
  perStore: number               // Max total AR allowed
}

export const KASBON_LIMITS: Record<string, KastonLimits> = {
  free: { perMember: 0, perStore: 0 },           // Kasbon disabled
  warung: { perMember: 50e6, perStore: 500e6 },  // 50M per member, 500M total
  resto: { perMember: 500e6, perStore: 5e9 },    // 500M per member, 5B total
}
