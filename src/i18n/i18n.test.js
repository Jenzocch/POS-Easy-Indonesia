import { describe, it, expect } from 'vitest'
import { t, translations } from './translations.js'
import { fmtMoney, formatRupiah, parseCurrencyInput, formatDate, formatWhatsAppLink } from './formatting.js'

describe('t() translation helper', () => {
  it('returns Indonesian by default (no localStorage in node)', () => {
    expect(t('common.confirm')).toBe('Konfirmasi')
  })

  it('falls back to the key itself when missing everywhere', () => {
    expect(t('nonexistent.key.xyz')).toBe('nonexistent.key.xyz')
  })

  it('interpolates {vars}', () => {
    translations.id['test.hello'] = 'Halo {name}!'
    expect(t('test.hello', { name: 'Budi' })).toBe('Halo Budi!')
    delete translations.id['test.hello']
  })
})

describe('translation key parity (catches forgotten translations)', () => {
  // Every key present in zh must exist in en AND id — this is the test that
  // automatically catches "translated to English but forgot Indonesian".
  it('every zh key exists in en and id', () => {
    const missing = []
    for (const key of Object.keys(translations.zh)) {
      if (!(key in translations.en)) missing.push(`en: ${key}`)
      if (!(key in translations.id)) missing.push(`id: ${key}`)
    }
    expect(missing, `Missing translations:\n${missing.join('\n')}`).toEqual([])
  })

  it('every id key exists in zh and en (no orphan Indonesian keys)', () => {
    const missing = []
    for (const key of Object.keys(translations.id)) {
      if (!(key in translations.zh)) missing.push(`zh: ${key}`)
      if (!(key in translations.en)) missing.push(`en: ${key}`)
    }
    expect(missing, `Missing translations:\n${missing.join('\n')}`).toEqual([])
  })

  it('no empty translation values', () => {
    const empty = []
    for (const lang of ['zh', 'en', 'id']) {
      for (const [key, val] of Object.entries(translations[lang])) {
        if (typeof val !== 'string' || val.trim() === '') empty.push(`${lang}: ${key}`)
      }
    }
    expect(empty).toEqual([])
  })
})

describe('fmtMoney / Rupiah formatting', () => {
  it('formats with dot thousands separator, no decimals', () => {
    expect(fmtMoney(15000)).toBe('Rp 15.000')
    expect(fmtMoney(1500000)).toBe('Rp 1.500.000')
    expect(fmtMoney(500)).toBe('Rp 500')
    expect(fmtMoney(0)).toBe('Rp 0')
  })

  it('handles negatives and garbage', () => {
    expect(fmtMoney(-25000)).toBe('-Rp 25.000')
    expect(formatRupiah(NaN)).toBe('Rp 0')
    expect(formatRupiah(undefined)).toBe('Rp 0')
  })

  it('truncates decimals', () => {
    expect(fmtMoney(9999.99)).toBe('Rp 9.999')
  })
})

describe('parseCurrencyInput (Indonesian "15" → 15000 shorthand)', () => {
  it('multiplies small numbers by 1000 in id locale', () => {
    expect(parseCurrencyInput('15')).toBe(15000)
    expect(parseCurrencyInput('2.5')).toBe(2500)
  })

  it('leaves >= 1000 values untouched', () => {
    expect(parseCurrencyInput('15000')).toBe(15000)
  })

  it('can be disabled', () => {
    expect(parseCurrencyInput('15', false)).toBe(15)
  })
})

describe('formatDate', () => {
  it('formats DD/MM/YYYY', () => {
    expect(formatDate(new Date(2026, 6, 7))).toBe('07/07/2026')
  })

  it('handles invalid input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
  })
})

describe('formatWhatsAppLink', () => {
  it('converts Indonesian 08xx numbers to 62 prefix', () => {
    expect(formatWhatsAppLink('081234567890', 'Halo')).toBe('https://wa.me/6281234567890?text=Halo')
  })

  it('keeps existing 62 prefix', () => {
    expect(formatWhatsAppLink('+62 812-3456-7890')).toBe('https://wa.me/6281234567890?text=')
  })
})
