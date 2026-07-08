import { useState, useMemo } from 'react'
import { X, RotateCcw } from 'lucide-react'
import Modal from './Modal'
import { t, fmtMoney, formatDateTime } from '../i18n'

export default function RefundModal({ order, onClose, onRefund, session, priorRefunds = [] }) {
  const [refundQty, setRefundQty] = useState({})
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 注意：hooks 一律放在任何 early return 之前，避免 hooks 數量隨 order 變動而違反 hooks 規則
  const items = useMemo(() => order?.items || [], [order])

  // 之前已退數量（同一張原單可被多次部分退貨）→ 算出每個品項剩餘可退量，避免超退
  const refundedById = useMemo(() => {
    const m = {}
    for (const ro of priorRefunds)
      for (const it of (ro.items || [])) m[it.id] = (m[it.id] || 0) + Math.abs(it.qty || 0)
    return m
  }, [priorRefunds])
  const remainingOf = (item) => Math.max(0, Math.abs(item.qty) - (refundedById[item.id] || 0))

  const refundItems = useMemo(() => items.map(item => ({
    ...item,
    qty: refundQty[item.id] || 0,
  })).filter(i => i.qty > 0), [items, refundQty])

  const refundTotal = refundItems.reduce((s, i) => s + i.price * i.qty, 0)
  const ratio = order && order.subtotal > 0 ? refundTotal / order.subtotal : 0
  const refundDiscount = Math.round((order?.discount || 0) * ratio)
  const refundManual = Math.round((order?.manualDiscount || 0) * ratio)
  const refundActual = refundTotal - refundDiscount - refundManual
  // 原單若用儲值付，按比例退回儲值，其餘才退現金/原付款 → 讓收銀員清楚該退多少現金
  const restoredBalance = Math.round((order?.balanceUsed || 0) * ratio)
  const cashBack = refundActual - restoredBalance

  if (!order) return null

  function setQty(id, val) {
    const item = items.find(i => i.id === id)
    if (!item) return
    const v = Math.max(0, Math.min(remainingOf(item), parseInt(val) || 0))
    setRefundQty(p => ({ ...p, [id]: v }))
  }

  async function handleSubmit() {
    if (!refundItems.length || submitting) return
    setSubmitting(true)
    try {
      const r = await onRefund(order, refundItems, { reason, cashier: session?.username || '' })
      if (r) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      maxWidth={480}
      overlayStyle={{ background:'rgba(0,0,0,0.5)', backdropFilter:'none' }}
      panelStyle={{ padding:0, display:'flex', flexDirection:'column', maxHeight:'88vh', overflowY:'hidden' }}
    >
        <div style={rm.head}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <RotateCcw size={16}/>
            <span style={{fontWeight:600}}>{t('pos.refund')}</span>
            <span style={{fontSize:11, color:'var(--text-tertiary)'}}>{order.id}</span>
          </div>
          <button onClick={onClose} style={{padding:4}}><X size={18}/></button>
        </div>

        <div style={{padding:'14px 18px', background:'var(--bg-overlay)', fontSize:13}}>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <span style={{color:'var(--text-secondary)'}}>{t('pos.refund_original_total')}</span>
            <span style={{fontFamily:'var(--font-mono)', fontWeight:500}}>{fmtMoney(order.total)}</span>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:4, fontSize:12}}>
            <span style={{color:'var(--text-tertiary)'}}>{formatDateTime(order.time)}</span>
            <span style={{color:'var(--text-tertiary)'}}>{order.payMethod === 'cash' ? t('pos.cash') : order.payMethod === 'card' ? t('pos.card') : t('pos.mixed')}</span>
          </div>
        </div>

        <div style={{padding:'12px 18px', maxHeight:'40vh', overflowY:'auto'}}>
          <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em'}}>{t('pos.refund_select_items')}</div>
          {items.map(item => {
            const maxQty = remainingOf(item)
            const already = refundedById[item.id] || 0
            const done = maxQty === 0
            const cur = refundQty[item.id] || 0
            return (
              <div key={item.id} style={{...rm.itemRow, opacity: done ? 0.45 : 1}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:500}}>{item.name}</div>
                  <div style={{fontSize:11, color:'var(--text-tertiary)'}}>
                    {fmtMoney(item.price)} × {Math.abs(item.qty)}
                    {already > 0 && <span style={{color:'var(--amber)', marginLeft:6}}>{t('pos.refund_already', { n: already })}</span>}
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <button onClick={()=>setQty(item.id, cur - 1)} style={rm.qtyBtn} disabled={done}>−</button>
                  <input type="number" inputMode="numeric" value={cur} onChange={e=>setQty(item.id, e.target.value)} disabled={done}
                    style={{width:50, textAlign:'center', fontFamily:'var(--font-mono)', fontSize:14, background:'var(--bg-overlay)', borderRadius:6, padding:'4px 0', border:'1px solid var(--border-dim)'}}/>
                  <button onClick={()=>setQty(item.id, cur + 1)} style={rm.qtyBtn} disabled={done}>+</button>
                  <button onClick={()=>setQty(item.id, maxQty)} style={{fontSize:11, color: done ? 'var(--text-tertiary)' : 'var(--gold)', marginLeft:4, padding:4}} disabled={done}>{done ? t('pos.refund_all_done') : t('pos.refund_max')}</button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{padding:'14px 18px', borderTop:'1px solid var(--border-dim)'}}>
          <input className="field" placeholder={t('pos.refund_reason_placeholder')} value={reason} onChange={e=>setReason(e.target.value)} style={{marginBottom:12}}/>

          <div style={{background:'var(--red-dim)', padding:'12px 14px', borderRadius:8, marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-secondary)', marginBottom:2}}>
              <span>{t('pos.refund_subtotal')}</span><span style={{fontFamily:'var(--font-mono)'}}>{fmtMoney(refundTotal)}</span>
            </div>
            {refundDiscount > 0 && (
              <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-secondary)', marginBottom:2}}>
                <span>{t('pos.refund_reverse_points')}</span><span style={{fontFamily:'var(--font-mono)'}}>−{fmtMoney(refundDiscount)}</span>
              </div>
            )}
            {refundManual > 0 && (
              <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-secondary)', marginBottom:2}}>
                <span>{t('pos.refund_reverse_manual')}</span><span style={{fontFamily:'var(--font-mono)'}}>−{fmtMoney(refundManual)}</span>
              </div>
            )}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:6}}>
              <span style={{fontSize:13, fontWeight:600, color:'var(--red)'}}>{t('pos.refund_actual')}</span>
              <span style={{fontFamily:'var(--font-mono)', fontSize:20, fontWeight:600, color:'var(--red)'}}>
                {fmtMoney(refundActual)}
              </span>
            </div>
            {restoredBalance > 0 && (
              <div style={{marginTop:8, paddingTop:8, borderTop:'1px dashed var(--border-dim)'}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:2}}>
                  <span style={{color:'var(--teal)'}}>{t('pos.refund_to_balance')}</span>
                  <span style={{fontFamily:'var(--font-mono)', color:'var(--teal)'}}>{fmtMoney(restoredBalance)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:12}}>
                  <span style={{color:'var(--text-secondary)'}}>{t('pos.refund_cash_back')}</span>
                  <span style={{fontFamily:'var(--font-mono)'}}>{fmtMoney(cashBack)}</span>
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-primary" style={{width:'100%', padding:12, background:'var(--red)', opacity: refundItems.length === 0 || submitting ? 0.4 : 1}}
            disabled={refundItems.length === 0 || submitting}
            onClick={handleSubmit}>
            {submitting ? t('pos.processing') : t('pos.confirm_refund')}
          </button>
        </div>
    </Modal>
  )
}

const rm = {
  head:{
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'14px 18px', borderBottom:'1px solid var(--border-dim)',
  },
  itemRow:{
    display:'flex', alignItems:'center', gap:10,
    padding:'10px 0', borderBottom:'1px solid var(--border-dim)',
  },
  qtyBtn:{
    width:26, height:26, borderRadius:6, fontSize:13, fontWeight:600,
    background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
    color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center',
  },
}
