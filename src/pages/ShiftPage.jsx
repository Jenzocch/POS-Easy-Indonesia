import { useState, useMemo } from 'react'
import { Clock, Plus, Minus, LogIn, LogOut, FileText, AlertCircle } from 'lucide-react'
import { t, fmtMoney } from '../i18n'

export default function ShiftPage({ store, session }) {
  const { openShift, startShift, endShift, logCash, orders, shifts = [], cashLog: allCashLog = [] } = store
  // PERF-06：shifts/cashLog 現在集中在 store（開班/關班/記現金時才整包重讀，見 useStore.js 的
  // refreshShiftData），這裡只保留「只看這班的現金流水」這個 page-local 篩選，跟舊版行為一致。
  const cashLog = useMemo(
    () => allCashLog.filter(x => !openShift || x.shiftId === openShift.id),
    [allCashLog, openShift]
  )
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [showCash, setShowCash] = useState(false)
  const [openCash, setOpenCash] = useState('')
  const [closeCash, setCloseCash] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashType, setCashType] = useState('in')
  const [cashReason, setCashReason] = useState('')

  // 即時統計這班
  const shiftStats = (() => {
    if (!openShift) return null
    const shiftOrders = orders.filter(o => o.shiftId === openShift.id)
    // 排除完整退貨配對（兩邊都不算進現金流）
    const valid = shiftOrders.filter(o => o.status !== 'refunded' && !(o.refundOf && o.fullRefund))
    const refunds = shiftOrders.filter(o => o.refundOf)
    let cash = 0, card = 0
    for (const o of valid) {
      if (o.payMethod === 'mixed' && Array.isArray(o.payments)) {
        for (const p of o.payments) {
          if (p.method === 'cash') cash += p.amount
          else card += p.amount
        }
      } else if (o.payMethod === 'cash') cash += o.total
      else card += o.total
    }
    const cashIn = cashLog.filter(c => c.type==='in').reduce((s,c)=>s+c.amount, 0)
    const cashOut = cashLog.filter(c => c.type==='out').reduce((s,c)=>s+c.amount, 0)
    const expected = (openShift.openCash || 0) + cash + cashIn - cashOut
    return {
      orderCount: valid.filter(o => !o.refundOf).length,
      cash, card,
      refundCount: refunds.length,
      refundAmt: refunds.reduce((s,o)=>s+Math.abs(o.total),0),
      cashIn, cashOut, expected,
    }
  })()

  async function handleOpen() {
    const cash = parseFloat(openCash) || 0
    await startShift(session?.username || '', cash, session?.id || '')
    setShowOpen(false)
    setOpenCash('')
  }

  async function handleClose() {
    const cash = parseFloat(closeCash) || 0
    const r = await endShift(cash, closeNote)
    setShowClose(false); setCloseCash(''); setCloseNote('')
    if (r) {
      const diff = (r.diff != null ? r.diff : (cash - shiftStats.expected))
      alert(t('shift.close_summary', {
        expected: fmtMoney(shiftStats.expected),
        actual: fmtMoney(cash),
        diff: `${diff >= 0 ? '+' : ''}${fmtMoney(diff)}`,
      }))
    }
  }

  async function handleCash() {
    const amt = parseFloat(cashAmount) || 0
    if (!amt || !cashReason) return
    await logCash(cashType, amt, cashReason, session?.username || '')
    setShowCash(false); setCashAmount(''); setCashReason(''); setCashType('in')
  }

  return (
    <div style={sh.root}>
      <div style={sh.header}>
        <div>
          <h2 style={{fontSize:20, fontWeight:600}}>{t('shift.title')}</h2>
          <div style={{fontSize:13, color:'var(--text-tertiary)', marginTop:4}}>
            {t('shift.subtitle')}
          </div>
        </div>
        {!openShift ? (
          <button className="btn btn-primary" onClick={()=>setShowOpen(true)} style={{display:'flex',alignItems:'center',gap:6}}>
            <LogIn size={16}/> {t('shift.open')}
          </button>
        ) : (
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-ghost" onClick={()=>setShowCash(true)} style={{display:'flex',alignItems:'center',gap:6}}>
              <Plus size={16}/> {t('shift.cash_log')}
            </button>
            <button className="btn btn-primary" onClick={()=>{setShowClose(true);setCloseCash(String(shiftStats?.expected||0))}} style={{display:'flex',alignItems:'center',gap:6}}>
              <LogOut size={16}/> {t('shift.close')}
            </button>
          </div>
        )}
      </div>

      {openShift ? (
        <div style={sh.card}>
          <div style={{display:'flex',justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
            <div>
              <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('shift.on_duty')}</div>
              <div style={{fontSize:18, fontWeight:600}}>{openShift.cashier}</div>
              <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:2}}>
                <Clock size={11} style={{verticalAlign:'middle', marginRight:4}}/>
                {t('shift.open')} {new Date(openShift.openTime).toLocaleString('zh-TW')}
              </div>
            </div>
            <span className="badge badge-green">{t('shift.status_open')}</span>
          </div>

          <div style={sh.kpiGrid}>
            <KPI label={t('shift.open_cash')} value={fmtMoney(openShift.openCash||0)}/>
            <KPI label={t('shift.cash_sales')} value={fmtMoney(shiftStats?.cash||0)} accent="green"/>
            <KPI label={t('shift.card_sales')} value={fmtMoney(shiftStats?.card||0)} accent="blue"/>
            <KPI label={t('shift.cash_in')} value={`+${fmtMoney(shiftStats?.cashIn||0)}`}/>
            <KPI label={t('shift.cash_out')} value={`-${fmtMoney(shiftStats?.cashOut||0)}`}/>
            <KPI label={t('shift.refunds')} value={t('shift.refund_val', { n: shiftStats?.refundCount||0, amount: fmtMoney(shiftStats?.refundAmt||0) })} accent="red"/>
            <KPI label={t('shift.orders')} value={t('shift.orders_n', { n: shiftStats?.orderCount||0 })}/>
            <KPI label={t('shift.expected_cash')} value={fmtMoney(shiftStats?.expected||0)} accent="gold"/>
          </div>

          {cashLog.length > 0 && (
            <>
              <div style={{fontWeight:600, fontSize:14, margin:'20px 0 10px'}}>{t('shift.cash_log')}</div>
              <table style={sh.table}>
                <thead>
                  <tr>
                    <th>{t('common.time')}</th><th>{t('shift.type')}</th><th style={{textAlign:'right'}}>{t('shift.amount')}</th><th>{t('shift.reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cashLog.map(c => (
                    <tr key={c.id}>
                      <td>{new Date(c.time).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</td>
                      <td>
                        <span className={`badge badge-${c.type==='in'?'green':'red'}`}>{c.type==='in'?t('shift.in'):t('shift.out')}</span>
                      </td>
                      <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color: c.type==='in'?'var(--green)':'var(--red)', fontWeight:500}}>
                        {c.type==='in'?'+':'-'} {fmtMoney(c.amount)}
                      </td>
                      <td style={{color:'var(--text-secondary)'}}>{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
        <div style={{...sh.card, textAlign:'center', padding:'40px 20px'}}>
          <AlertCircle size={32} color="var(--text-tertiary)" style={{margin:'0 auto 12px'}}/>
          <div style={{fontSize:15, fontWeight:500, marginBottom:6}}>{t('shift.none_open')}</div>
          <div style={{fontSize:13, color:'var(--text-tertiary)'}}>{t('shift.none_open_note')}</div>
        </div>
      )}

      <div style={{...sh.card, marginTop:12}}>
        <div style={{fontWeight:600, fontSize:14, marginBottom:12}}>{t('shift.history')}</div>
        {shifts.length === 0 ? (
          <div style={{textAlign:'center', color:'var(--text-tertiary)', padding:'20px 0', fontSize:13}}>{t('shift.no_records')}</div>
        ) : (
          <table style={sh.table}>
            <thead>
              <tr>
                <th>{t('shift.cashier')}</th><th>{t('shift.open')}</th><th>{t('shift.close')}</th>
                <th style={{textAlign:'right'}}>{t('shift.cash')}</th><th style={{textAlign:'right'}}>{t('shift.card')}</th>
                <th style={{textAlign:'right'}}>{t('shift.diff')}</th><th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id}>
                  <td>{s.cashier}</td>
                  <td>{new Date(s.openTime).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                  <td>{s.closeTime ? new Date(s.closeTime).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{fmtMoney(s.cashSales || 0)}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{fmtMoney(s.cardSales || 0)}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color: s.diff > 0 ? 'var(--green)' : s.diff < 0 ? 'var(--red)' : 'inherit'}}>
                    {s.status === 'closed' ? (s.diff > 0 ? '+' : '') + fmtMoney(s.diff||0) : '-'}
                  </td>
                  <td>
                    <span className={`badge badge-${s.status==='open' ? 'green' : 'blue'}`}>
                      {s.status === 'open' ? t('shift.status_open') : t('shift.status_closed')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showOpen && (
        <Modal title={t('shift.open')} onClose={()=>setShowOpen(false)}>
          <Field label={t('shift.cashier')}><div style={{padding:'10px 14px', fontSize:14}}>{session?.username}</div></Field>
          <Field label={t('shift.opening_float')}>
            <input className="field" type="number" inputMode="numeric" value={openCash} onChange={e=>setOpenCash(e.target.value)} placeholder="0" autoFocus/>
          </Field>
          <button className="btn btn-primary" style={{width:'100%', padding:12, marginTop:12}} onClick={handleOpen}>{t('shift.open_confirm')}</button>
        </Modal>
      )}

      {showClose && (
        <Modal title={t('shift.close')} onClose={()=>setShowClose(false)}>
          <div style={{background:'var(--bg-overlay)', padding:'12px 14px', borderRadius:8, marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4}}>
              <span style={{color:'var(--text-secondary)'}}>{t('shift.expected_cash')}</span>
              <span style={{fontFamily:'var(--font-mono)', fontWeight:600}}>{fmtMoney(shiftStats?.expected||0)}</span>
            </div>
          </div>
          <Field label={t('shift.actual_cash')}>
            <input className="field" type="number" inputMode="numeric" value={closeCash} onChange={e=>setCloseCash(e.target.value)} autoFocus/>
          </Field>
          {closeCash !== '' && (
            <div style={{padding:'8px 14px', borderRadius:8,
              background: parseFloat(closeCash) - (shiftStats?.expected||0) >= 0 ? 'var(--green-dim)' : 'var(--red-dim)',
              color: parseFloat(closeCash) - (shiftStats?.expected||0) >= 0 ? 'var(--green)' : 'var(--red)',
              fontSize:13, marginBottom:12}}>
              {t('shift.diff_line', { amount:
                (parseFloat(closeCash) - (shiftStats?.expected||0) >= 0 ? '+' : '')
                + fmtMoney(parseFloat(closeCash) - (shiftStats?.expected||0)) })}
            </div>
          )}
          <Field label={t('common.notes')}>
            <input className="field" value={closeNote} onChange={e=>setCloseNote(e.target.value)} placeholder={t('shift.diff_reason_ph')}/>
          </Field>
          <button className="btn btn-primary" style={{width:'100%', padding:12, marginTop:12}} onClick={handleClose}>{t('shift.close_confirm')}</button>
        </Modal>
      )}

      {showCash && (
        <Modal title={t('shift.cash_in_out')} onClose={()=>setShowCash(false)}>
          <Field label={t('shift.type')}>
            <div style={{display:'flex', gap:8}}>
              {[['in',t('shift.cash_in')],['out',t('shift.cash_out')]].map(([k,l]) => (
                <button key={k} onClick={()=>setCashType(k)} style={{
                  flex:1, padding:10, borderRadius:8, fontSize:13,
                  background: cashType===k?'var(--gold)':'var(--bg-overlay)',
                  color: cashType===k?'#fff':'var(--text-secondary)',
                  border:`1px solid ${cashType===k?'var(--gold)':'var(--border-subtle)'}`,
                }}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label={t('shift.amount')}>
            <input className="field" type="number" inputMode="numeric" value={cashAmount} onChange={e=>setCashAmount(e.target.value)} autoFocus/>
          </Field>
          <Field label={t('shift.reason')}>
            <input className="field" value={cashReason} onChange={e=>setCashReason(e.target.value)} placeholder={t('shift.reason_ph')}/>
          </Field>
          <button className="btn btn-primary" style={{width:'100%', padding:12, marginTop:12}} onClick={handleCash}>{t('shift.record')}</button>
        </Modal>
      )}
    </div>
  )
}

function KPI({ label, value, accent }) {
  return (
    <div style={{padding:'12px 14px', background:'var(--bg-overlay)', borderRadius:8}}>
      <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4}}>{label}</div>
      <div style={{fontFamily:'var(--font-mono)', fontWeight:600, fontSize:15, color: accent ? `var(--${accent})` : 'var(--text-primary)'}}>{value}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4}}>{label}</div>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <>
      <div style={mod.overlay} onClick={onClose}/>
      <div style={mod.box}>
        <div style={mod.head}>
          <span style={{fontSize:15, fontWeight:600}}>{title}</span>
          <button onClick={onClose} style={{padding:4}}>✕</button>
        </div>
        <div style={{padding:'16px 18px'}}>{children}</div>
      </div>
    </>
  )
}

const sh = {
  root: { flex:1, overflowY:'auto', padding:'20px 24px', background:'var(--bg-base)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  card: {
    background:'var(--bg-raised)', border:'1px solid var(--border-dim)',
    borderRadius:12, padding:'18px 20px', boxShadow:'var(--shadow-sm)',
  },
  kpiGrid: {
    display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:8,
  },
  table: {
    width:'100%', fontSize:13, borderCollapse:'collapse',
  },
}
const mod = {
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:998},
  box:{
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    background:'var(--bg-raised)', borderRadius:12, width:380, maxWidth:'90vw',
    boxShadow:'var(--shadow-lg)', zIndex:999, overflow:'hidden',
  },
  head:{
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'14px 18px', borderBottom:'1px solid var(--border-dim)',
  },
}

const css = `
table th, table td { padding: 8px 10px; text-align: left; }
table th { font-size: 11px; color: var(--text-tertiary); font-weight: 500; border-bottom: 1px solid var(--border-dim); }
table tbody tr { border-bottom: 1px solid var(--border-dim); }
`
if (typeof document !== 'undefined' && !document.getElementById('shift-page-css')) {
  const s = document.createElement('style'); s.id = 'shift-page-css'; s.textContent = css; document.head.appendChild(s)
}
