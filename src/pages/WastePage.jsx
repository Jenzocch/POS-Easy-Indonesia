import { useState, useMemo } from 'react'
import { Trash2, Plus, AlertTriangle, Calendar, Package } from 'lucide-react'
import { exportXLS } from '../utils/exportXLS'
import { getExpiringProducts } from '../utils/analytics'
import { t, fmtMoney } from '../i18n'

// REASONS 是「儲存值」（wasteLog.reason 存進資料層）— 不可翻譯，維持中文原值。
// 顯示時透過 REASON_KEYS 對應翻譯；查不到的（舊自訂資料）原樣顯示。
const REASONS = ['過期', '破損', '腐壞', '自用', '試吃樣品', '盤虧', '其他']
const REASON_KEYS = {
  '過期': 'waste.reason_expired',
  '破損': 'waste.reason_damaged',
  '腐壞': 'waste.reason_spoiled',
  '自用': 'waste.reason_personal',
  '試吃樣品': 'waste.reason_sample',
  '盤虧': 'waste.reason_shrinkage',
  '其他': 'waste.reason_other',
}
const reasonLabel = (r) => (REASON_KEYS[r] ? t(REASON_KEYS[r]) : r)

export default function WastePage({ store, session }) {
  const { products, wasteLog, recordWaste, removeWaste } = store
  const [showAdd, setShowAdd] = useState(false)
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0,7))

  const filtered = useMemo(() => {
    return wasteLog.filter(w => {
      const okMonth = !filterMonth || w.time.startsWith(filterMonth)
      const okSearch = !search || w.productName?.includes(search) || w.reason?.includes(search)
      return okMonth && okSearch
    })
  }, [wasteLog, filterMonth, search])

  const totalLoss = filtered.reduce((s,w) => s + (w.cost || 0) * Math.abs(w.qty), 0)
  const totalQty = filtered.reduce((s,w) => s + Math.abs(w.qty), 0)

  // 即期商品（已過期 + 7 天內到期）— 統一走 analytics 的安全日期解析，daysLeft 由 util 算好（<=0 代表已過期/今天）
  const expiringSoon = useMemo(() => {
    const { expired, soon } = getExpiringProducts(products, 7)
    return [...expired, ...soon].sort((a, b) => a.daysLeft - b.daysLeft)
  }, [products])

  async function handleAdd() {
    const p = products.find(x => x.id === productId)
    if (!p || !qty) return
    await recordWaste({
      productId: p.id,
      productName: p.name,
      qty: parseInt(qty) || 0,
      cost: p.cost || 0,
      reason,
      cashier: session?.username || '',
    })
    setShowAdd(false); setProductId(''); setQty(''); setReason(REASONS[0])
  }

  async function handleQuickAdd(p) {
    if (!confirm(t('waste.confirm_quick', { name: p.name }))) return
    await recordWaste({
      productId: p.id, productName: p.name, qty: 1,
      cost: p.cost || 0, reason: '過期',
      cashier: session?.username || '',
    })
  }

  function exportExcel() {
    const rows = [[t('common.date'), t('common.time'), t('inv.product'), t('common.qty'), t('inv.col_cost'), t('waste.loss'), t('waste.reason'), t('waste.recorded_by')]]
    filtered.forEach(w => {
      const tm = new Date(w.time)
      rows.push([
        tm.toLocaleDateString('zh-TW'),
        tm.toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}),
        w.productName,
        Math.abs(w.qty),
        w.cost || 0,
        (w.cost || 0) * Math.abs(w.qty),
        reasonLabel(w.reason),
        w.cashier || '',
      ])
    })
    rows.push(['','',t('common.total'), totalQty, '', totalLoss, '', ''])
    exportXLS(rows, `${t('waste.file_records')}_${filterMonth}.xls`)
  }

  return (
    <div style={ws.root}>
      <div style={ws.header}>
        <div>
          <h2 style={{fontSize:20, fontWeight:600}}>{t('waste.title')}</h2>
          <div style={{fontSize:13, color:'var(--text-tertiary)', marginTop:4}}>
            {t('waste.subtitle')}
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)} style={{display:'flex',alignItems:'center',gap:6}}>
          <Plus size={16}/> {t('waste.add')}
        </button>
      </div>

      {expiringSoon.length > 0 && (
        <div style={ws.card}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
            <AlertTriangle size={16} color="var(--amber)"/>
            <span style={{fontWeight:600}}>{t('waste.expiring_7d', { n: expiringSoon.length })}</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:8}}>
            {expiringSoon.map(p => (
              <div key={p.id} style={{
                padding:'10px 12px', borderRadius:8,
                background: p.daysLeft <= 0 ? 'var(--red-dim)' : p.daysLeft <= 3 ? 'var(--amber-dim)' : 'var(--bg-overlay)',
                border:`1px solid ${p.daysLeft <= 0 ? 'rgba(194,85,80,0.2)' : 'transparent'}`,
              }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4}}>
                  <div style={{fontSize:13, fontWeight:500, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
                  <button onClick={()=>handleQuickAdd(p)} style={{padding:'2px 8px', fontSize:10, color:'var(--red)', background:'none', border:'1px solid var(--red)', borderRadius:4}}>{t('waste.discard')}</button>
                </div>
                <div style={{fontSize:11, color:'var(--text-secondary)'}}>
                  {t('waste.stock_expiry', { stock: p.stock, date: p.expiryDate })}
                </div>
                <div style={{fontSize:11, color: p.daysLeft <= 0 ? 'var(--red)' : 'var(--amber)', fontWeight:600, marginTop:2}}>
                  {p.daysLeft <= 0 ? t('waste.expired_days', { n: -p.daysLeft }) : t('waste.days_left', { n: p.daysLeft })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={ws.card}>
        <div style={{display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
          <input className="field" type="month" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{width:160}}/>
          <input className="field" placeholder={t('waste.search_ph')} value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1, minWidth:200}}/>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel}>{t('waste.export_excel')}</button>
        </div>

        <div style={{display:'flex', gap:12, marginBottom:14}}>
          <div style={ws.statBox}>
            <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('waste.total_records')}</div>
            <div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)'}}>{filtered.length}</div>
          </div>
          <div style={ws.statBox}>
            <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('waste.total_items')}</div>
            <div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)'}}>{totalQty}</div>
          </div>
          <div style={ws.statBox}>
            <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('waste.total_loss')}</div>
            <div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)', color:'var(--red)'}}>{fmtMoney(totalLoss)}</div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{textAlign:'center', color:'var(--text-tertiary)', padding:'40px 0', fontSize:13}}>
            <Package size={32} color="var(--text-tertiary)" style={{margin:'0 auto 12px', opacity:0.5}}/>
            <div>{t('waste.empty')}</div>
          </div>
        ) : (
          <table style={{width:'100%', fontSize:13, borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={ws.th}>{t('common.time')}</th>
                <th style={ws.th}>{t('inv.product')}</th>
                <th style={{...ws.th, textAlign:'right'}}>{t('common.qty')}</th>
                <th style={{...ws.th, textAlign:'right'}}>{t('waste.unit_cost')}</th>
                <th style={{...ws.th, textAlign:'right'}}>{t('waste.loss')}</th>
                <th style={ws.th}>{t('waste.reason')}</th>
                <th style={ws.th}>{t('waste.recorded_by')}</th>
                <th style={ws.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.id} style={{borderBottom:'1px solid var(--border-dim)'}}>
                  <td style={ws.td}>{new Date(w.time).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={ws.td}>{w.productName}</td>
                  <td style={{...ws.td, textAlign:'right', fontFamily:'var(--font-mono)'}}>{Math.abs(w.qty)}</td>
                  <td style={{...ws.td, textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-secondary)'}}>{(w.cost||0).toLocaleString()}</td>
                  <td style={{...ws.td, textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--red)', fontWeight:500}}>{((w.cost||0)*Math.abs(w.qty)).toLocaleString()}</td>
                  <td style={ws.td}><span className="badge badge-amber">{reasonLabel(w.reason)}</span></td>
                  <td style={ws.td}>{w.cashier}</td>
                  <td style={ws.td}>
                    <button onClick={()=>{ if(confirm(t('waste.confirm_delete'))) removeWaste(w.id) }} style={{color:'var(--red)', padding:4}}>
                      <Trash2 size={13}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:998}} onClick={()=>setShowAdd(false)}/>
          {/* RWD-01：maxHeight + overflowY，手機上表單長於視窗時可捲動 */}
          <div style={{position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'var(--bg-raised)', borderRadius:12, width:420, maxWidth:'90vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'var(--shadow-lg)', zIndex:999}}>
            <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border-dim)', fontSize:15, fontWeight:600}}>{t('waste.record_title')}</div>
            <div style={{padding:18}}>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4}}>{t('inv.product')}</div>
                <select className="field" value={productId} onChange={e=>setProductId(e.target.value)} autoFocus>
                  <option value="">{t('waste.select_ph')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({t('inv.col_stock')} {p.stock})</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4}}>{t('common.qty')}</div>
                <input className="field" type="number" inputMode="numeric" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4}}>{t('waste.reason')}</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6}}>
                  {REASONS.map(r => (
                    <button key={r} onClick={()=>setReason(r)} style={{
                      padding:'8px 4px', fontSize:12, borderRadius:6,
                      background: reason===r?'var(--gold)':'var(--bg-overlay)',
                      color: reason===r?'#fff':'var(--text-secondary)',
                      border:`1px solid ${reason===r?'var(--gold)':'var(--border-subtle)'}`,
                    }}>{reasonLabel(r)}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" style={{width:'100%', padding:12, marginTop:8}} disabled={!productId || !qty} onClick={handleAdd}>{t('waste.record_btn')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const ws = {
  root: { flex:1, overflowY:'auto', padding:'20px 24px', background:'var(--bg-base)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  card: {
    background:'var(--bg-raised)', border:'1px solid var(--border-dim)',
    borderRadius:12, padding:'18px 20px', boxShadow:'var(--shadow-sm)',
    marginBottom:12,
  },
  statBox: {
    flex:1, padding:'12px 14px', background:'var(--bg-overlay)', borderRadius:8,
  },
  th: { padding:'8px 10px', textAlign:'left', fontSize:11, color:'var(--text-tertiary)', fontWeight:500, borderBottom:'1px solid var(--border-dim)' },
  td: { padding:'10px', verticalAlign:'middle' },
}
