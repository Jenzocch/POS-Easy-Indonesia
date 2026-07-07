import { describe, it, expect } from 'vitest'
import {
  validateCreateKasbon,
  validateRecordPayment,
  validateKastonLimit
} from './kasbon-validation'

describe('Kasbon Validation', () => {
  describe('validateCreateKasbon', () => {
    it('accepts valid kasbon creation', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: 100000,
        dueDate: '2026-08-07',
        notes: 'Test kasbon'
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects missing memberId', () => {
      const result = validateCreateKasbon({
        amount: 100000
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('memberId'))).toBe(true)
    })

    it('rejects invalid amount', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: -100
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('amount'))).toBe(true)
    })

    it('rejects zero amount', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: 0
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('amount'))).toBe(true)
    })

    it('rejects amount exceeding max', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: 2e12
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true)
    })

    it('rejects invalid date format', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: 100000,
        dueDate: 'invalid-date'
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('dueDate'))).toBe(true)
    })

    it('rejects notes exceeding max length', () => {
      const result = validateCreateKasbon({
        memberId: 'M123',
        amount: 100000,
        notes: 'a'.repeat(600)
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('max length'))).toBe(true)
    })
  })

  describe('validateRecordPayment', () => {
    it('accepts valid payment', () => {
      const result = validateRecordPayment({
        kastonRecordId: 'KR123',
        amount: 50000,
        paymentDate: '2026-07-15',
        paymentMethod: 'cash',
        balanceDue: 100000
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects missing kastonRecordId', () => {
      const result = validateRecordPayment({
        amount: 50000,
        paymentDate: '2026-07-15'
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('kastonRecordId'))).toBe(true)
    })

    it('rejects missing paymentDate', () => {
      const result = validateRecordPayment({
        kastonRecordId: 'KR123',
        amount: 50000
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('paymentDate'))).toBe(true)
    })

    it('rejects invalid amount', () => {
      const result = validateRecordPayment({
        kastonRecordId: 'KR123',
        amount: -50000,
        paymentDate: '2026-07-15'
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('amount'))).toBe(true)
    })

    it('rejects payment exceeding balance', () => {
      const result = validateRecordPayment({
        kastonRecordId: 'KR123',
        amount: 150000,
        paymentDate: '2026-07-15',
        balanceDue: 100000
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('exceeds balance'))).toBe(true)
    })

    it('rejects invalid payment method', () => {
      const result = validateRecordPayment({
        kastonRecordId: 'KR123',
        amount: 50000,
        paymentDate: '2026-07-15',
        paymentMethod: 'crypto'
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('paymentMethod'))).toBe(true)
    })

    it('accepts valid payment methods', () => {
      const methods = ['cash', 'transfer', 'check', 'other']
      for (const method of methods) {
        const result = validateRecordPayment({
          kastonRecordId: 'KR123',
          amount: 50000,
          paymentDate: '2026-07-15',
          paymentMethod: method
        })
        expect(result.valid).toBe(true, `Method ${method} should be valid`)
      }
    })
  })

  describe('validateKastonLimit', () => {
    it('accepts payment within limit', () => {
      const result = validateKastonLimit(50000, 50000, 100000)
      expect(result.valid).toBe(true)
    })

    it('rejects payment exceeding limit', () => {
      const result = validateKastonLimit(50000, 60000, 100000)
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.difference).toBe(10000)
    })

    it('accepts payment exactly at limit', () => {
      const result = validateKastonLimit(50000, 50000, 100000)
      expect(result.valid).toBe(true)
    })

    it('rejects when current balance equals limit', () => {
      const result = validateKastonLimit(100000, 1, 100000)
      expect(result.valid).toBe(false)
    })
  })
})
