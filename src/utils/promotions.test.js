import { describe, it, expect } from 'vitest'
import { applyPromotions } from './promotions'

const PAST = new Date(Date.now() - 864e5).toISOString()
const FUTURE = new Date(Date.now() + 864e5).toISOString()

function promo(overrides) {
  return { id:'p1', name:'Test Promo', enabled:true, startAt:PAST, endAt:FUTURE, ...overrides }
}

const cart = [
  { id:'i1', name:'A', price:100, qty:2 },
  { id:'i2', name:'B', price:50,  qty:3 },
]
const subtotal = 350 // 100*2 + 50*3

describe('applyPromotions', () => {
  it('無促銷時不折抵', () => {
    const r = applyPromotions(cart, [], subtotal)
    expect(r.totalDiscount).toBe(0)
    expect(r.applied).toEqual([])
  })

  it('threshold：滿額才折抵', () => {
    const promos = [promo({ type:'threshold', condition:{ threshold:500, discount:50 } })]
    const below = applyPromotions(cart, promos, subtotal)
    expect(below.totalDiscount).toBe(0)

    const above = applyPromotions(cart, promos, 600)
    expect(above.totalDiscount).toBe(50)
    expect(above.applied).toHaveLength(1)
  })

  it('percent：依折扣率打折', () => {
    const promos = [promo({ type:'percent', condition:{ rate:0.9 } })] // 九折 = 折 10%
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(35) // 350 * 0.1
  })

  it('buyget：買 X 送 Y，挑最便宜的品項免費', () => {
    // cart 展開後單價陣列：[100,100,50,50,50] → 買 2 送 1，共 5 件可組 2 套 → 送 2 件（最便宜的兩件皆 50）
    const promos = [promo({ type:'buyget', condition:{ buy:2, get:1 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(100) // 50 + 50
  })

  it('buyget：件數不足一套時不觸發', () => {
    const promos = [promo({ type:'buyget', condition:{ buy:10, get:1 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(0)
  })

  it('fixed：只對指定商品折抵，且每件折抵不超過單價', () => {
    const promos = [promo({ type:'fixed', condition:{ productIds:['i1'], discount:200 } })]
    const r = applyPromotions(cart, promos, subtotal)
    // i1 單價 100，折 200 會超過單價，夾在 100 → 2 件 × 100 = 200
    expect(r.totalDiscount).toBe(200)
  })

  it('fixed：購物車沒有指定商品則不折抵', () => {
    const promos = [promo({ type:'fixed', condition:{ productIds:['not-in-cart'], discount:20 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(0)
  })

  it('停用的促銷不套用', () => {
    const promos = [promo({ type:'threshold', enabled:false, condition:{ threshold:100, discount:50 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(0)
  })

  it('已過期的促銷不套用', () => {
    const promos = [promo({ type:'threshold', endAt:PAST, condition:{ threshold:100, discount:50 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(0)
  })

  it('尚未開始的促銷不套用', () => {
    const promos = [promo({ type:'threshold', startAt:FUTURE, condition:{ threshold:100, discount:50 } })]
    const r = applyPromotions(cart, promos, subtotal)
    expect(r.totalDiscount).toBe(0)
  })

  it('多個促銷可疊加，但總折抵不超過小計', () => {
    const promos = [
      promo({ id:'p1', type:'threshold', condition:{ threshold:100, discount:200 } }),
      promo({ id:'p2', type:'percent', condition:{ rate:0.5 } }), // 折 50% = 175
    ]
    const r = applyPromotions(cart, promos, subtotal)
    // 200 + 175 = 375 > 350，夾限在 subtotal
    expect(r.totalDiscount).toBe(subtotal)
    expect(r.applied).toHaveLength(2)
  })
})
