import { t, fmtMoney } from '../i18n'

// Apply all active promotions to cart, return discount amount + descriptions.
// Shared by PromotionsPage (management UI) and CartPanel (actual checkout application).
export function applyPromotions(cart, promotions, subtotal) {
  const now    = new Date().toISOString()
  const active = (promotions || []).filter(p => p.enabled && p.startAt <= now && p.endAt >= now)
  let   totalDiscount = 0
  const applied = []

  for (const promo of active) {
    if (promo.type === 'threshold' && subtotal >= promo.condition.threshold) {
      const d = promo.condition.discount
      totalDiscount += d
      applied.push({ id:promo.id, label:t('promo.applied_threshold', {name:promo.name, amt:fmtMoney(d)}), discount:d })
    }
    if (promo.type === 'percent') {
      const d = Math.round(subtotal * (1 - promo.condition.rate) * 100) / 100
      totalDiscount += d
      applied.push({ id:promo.id, label:t('promo.applied_percent', {name:promo.name, tenth:Math.round(promo.condition.rate*10), pct:Math.round((1-promo.condition.rate)*100), amt:fmtMoney(d)}), discount:d })
    }
    if (promo.type === 'buyget') {
      const totalQty = cart.reduce((s,i)=>s+i.qty,0)
      const sets     = Math.floor(totalQty / promo.condition.buy)
      if (sets > 0) {
        // Find cheapest items for free
        const sorted  = [...cart].flatMap(i=>Array(i.qty).fill(i.price)).sort((a,b)=>a-b)
        const freeQty = Math.min(sets * promo.condition.get, sorted.length)
        const d       = sorted.slice(0, freeQty).reduce((s,v)=>s+v, 0)
        totalDiscount += d
        applied.push({ id:promo.id, label:t('promo.applied_buyget', {name:promo.name, qty:freeQty, amt:fmtMoney(d)}), discount:d })
      }
    }
    if (promo.type === 'fixed') {
      const match = cart.filter(i => promo.condition.productIds?.includes(i.id))
      if (match.length > 0) {
        const d = match.reduce((s,i)=>s+Math.min(promo.condition.discount,i.price)*i.qty,0)
        totalDiscount += d
        applied.push({ id:promo.id, label:t('promo.applied_fixed', {name:promo.name, amt:fmtMoney(promo.condition.discount)}), discount:d })
      }
    }
  }

  return { totalDiscount: Math.min(totalDiscount, subtotal), applied }
}
