import { describe, it, expect } from 'vitest'
import { LOW_STOCK_THRESHOLD, isOutOfStock, isLowStock, needsRestock } from './stock'

describe('stock helpers', () => {
  it('門檻常數為 5', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5)
  })

  it.each([
    // [stock, isOutOfStock, isLowStock, needsRestock]
    [0,         true,  false, true ],  // 邊界：缺貨
    [1,         false, true,  true ],  // 邊界：低庫存下緣
    [5,         false, true,  true ],  // 邊界：等於門檻仍算低庫存
    [6,         false, false, false],  // 邊界：門檻 +1 即正常
    [-2,        true,  false, true ],  // 負庫存（超賣異常）算缺貨、要補
    [undefined, true,  false, true ],  // 缺 stock 欄位視為 0
    [100,       false, false, false],  // 充足
  ])('stock=%s → out=%s / low=%s / restock=%s', (stock, out, low, restock) => {
    const p = stock === undefined ? {} : { stock }
    expect(isOutOfStock(p)).toBe(out)
    expect(isLowStock(p)).toBe(low)
    expect(needsRestock(p)).toBe(restock)
  })

  it('isOutOfStock 與 isLowStock 互斥，且聯集恰為 needsRestock（Sidebar 徽章 = 庫存頁 低庫存+缺貨）', () => {
    const products = [-1, 0, 1, 3, 5, 6, 10, undefined].map(stock =>
      stock === undefined ? { id: 'u' } : { id: `s${stock}`, stock })
    for (const p of products) {
      expect(isOutOfStock(p) && isLowStock(p)).toBe(false)              // 互斥
      expect(isOutOfStock(p) || isLowStock(p)).toBe(needsRestock(p))    // 無縫拼滿
    }
    const restockCount = products.filter(needsRestock).length
    const lowPlusZero  = products.filter(isLowStock).length + products.filter(isOutOfStock).length
    expect(lowPlusZero).toBe(restockCount)
  })
})
