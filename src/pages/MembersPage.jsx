import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Check, Gift, TrendingUp, Phone, Wallet, RotateCcw, Cake } from 'lucide-react'
import RefundModal from '../components/RefundModal'
import { computeAllRFM } from '../utils/analytics'
import { maskPhone } from '../utils/security'
import { t, fmtMoney } from '../i18n'

// label 是 i18n key；tier 儲存值（normal/silver/gold）不變，顯示時才翻譯
// min/max 門檻需跟 utils/analytics.js 的 memberTier() 保持一致（單一事實來源在那邊算 tier，
// 這裡的 min/max 只負責畫升級進度條，數字要對得上才不會出現「已經是 silver 但進度條顯示 0%」）。
const TIER = {
  normal: { label:'members.tier_normal', color:'var(--text-secondary)', bg:'var(--bg-active)', min:0,       max:1000000 },
  silver: { label:'members.tier_silver', color:'#aab8cc',               bg:'rgba(170,184,204,0.12)', min:1000000, max:3000000 },
  gold:   { label:'members.tier_gold',   color:'var(--gold-bright)',    bg:'var(--gold-dim)',     min:3000000, max:Infinity },
}
// RFM tag 是 analytics 計算出的中文字串（同時作為篩選比對 key），只在顯示時翻譯
const RFM_TAG_KEYS = {
  'VIP': 'members.rfm_vip',
  '核心會員': 'members.rfm_core',
  '新會員': 'members.rfm_new',
  '流失預警': 'members.rfm_at_risk',
  '沉睡會員': 'members.rfm_dormant',
  '一般會員': 'members.rfm_regular',
  '未消費': 'members.rfm_none',
}
const rfmLabel = (tag) => RFM_TAG_KEYS[tag] ? t(RFM_TAG_KEYS[tag]) : tag
const EMPTY_FORM = { name:'', phone:'', note:'', birthday:'' }

export default function MembersPage({ store, session }) {
  const { members, addMember, updateMember, deleteMember, orders, products, topupMember, refund } = store
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [search,     setSearch]     = useState('')
  const [filterTier, setFilterTier] = useState('all')
  const [selected,   setSelected]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showTopup,  setShowTopup]  = useState(false)
  const [topupAmt,   setTopupAmt]   = useState('')
  const [topupBonus, setTopupBonus] = useState('')
  const [topupMethod,setTopupMethod] = useState('cash')
  const [refundOrder,setRefundOrder] = useState(null)

  // 重新從 list 取最新資料（避免顯示過期）
  const selectedLive = selected ? members.find(m => m.id === selected.id) || selected : null

  // 預先計算每位會員的 RFM 標籤（computeAllRFM 內部單趟 groupBy，避免每會員全量掃訂單）
  const rfmMap = useMemo(() => {
    const m = new Map()
    for (const mem of computeAllRFM(members, orders)) m.set(mem.id, mem.rfm)
    return m
  }, [members, orders])

  const filtered = members.filter(m => {
    const okSearch = !search || (m.name||'').includes(search) || (m.phone||'').includes(search)
    const okTier   = filterTier === 'all'
                  || m.tier === filterTier
                  || (filterTier.startsWith('rfm:') && rfmMap.get(m.id)?.tag === filterTier.slice(4))
    return okSearch && okTier
  })

  function startNew()  { setEditing('new');  setForm(EMPTY_FORM) }
  function startEdit(m){ setEditing(m.id);   setForm({name:m.name, phone:m.phone, note:m.note||'', birthday:m.birthday||''}) }

  function save() {
    if (!form.name || !form.phone) return
    if (editing === 'new') addMember(form)
    else updateMember(editing, form)
    setEditing(null)
  }

  async function handleTopup() {
    if (!selectedLive) return
    const amt = parseFloat(topupAmt) || 0
    const bonus = parseFloat(topupBonus) || 0
    if (amt <= 0) return
    await topupMember(selectedLive.id, amt, bonus, topupMethod, session?.username || '')
    setShowTopup(false); setTopupAmt(''); setTopupBonus(''); setTopupMethod('cash')
  }

  async function handleRefund(origOrder, refundItems, opts) {
    return await refund(origOrder, refundItems, opts)
  }

  // 生日提醒
  function isBirthdayMonth(m) {
    if (!m.birthday) return false
    return m.birthday.slice(5,7) === String(new Date().getMonth()+1).padStart(2,'0')
  }

  // Get member's order history
  const memberOrders = selected ? orders.filter(o => o.memberId === selected.id) : []
  const memberRevenue = memberOrders.reduce((s,o) => s+o.total, 0)

  // Tier progress
  function tierProgress(m) {
    const t = TIER[m.tier]
    if (m.tier === 'gold') return 100
    const pct = ((m.totalSpent - t.min) / (t.max - t.min)) * 100
    return Math.min(100, Math.max(0, pct))
  }

  return (
    <div style={ms.root}>
      <div style={ms.left}>
        <div style={ms.header}>
          <div>
            <h2 style={ms.title}>{t('members.title')}</h2>
            <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
              {t('members.count', { n: members.length })}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={startNew}>
            <Plus size={15}/>{t('members.add')}
          </button>
        </div>

        <div style={ms.toolbar}>
          <input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('members.search_ph')} style={{flex:1, maxWidth:240, padding:'8px 12px'}}/>
          <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
            {[
              ['all',t('common.all')],['normal',t('members.tier_normal')],['silver',t('members.tier_silver')],['gold',t('members.tier_gold')],
              ['rfm:VIP','★'+t('members.rfm_vip')],['rfm:核心會員',t('members.filter_core')],['rfm:流失預警',t('members.filter_at_risk')],['rfm:沉睡會員',t('members.filter_dormant')],
            ].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterTier(k)} style={{
                ...ms.filterBtn,
                background: filterTier===k?'var(--bg-active)':'transparent',
                color: filterTier===k?'var(--text-primary)':'var(--text-tertiary)',
                border: `1px solid ${filterTier===k?'var(--border-mid)':'transparent'}`,
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Member list */}
        <div style={ms.list}>
          {filtered.map(m => {
            const tr  = TIER[m.tier]
            const pct = tierProgress(m)
            const active = selected?.id === m.id
            const rfm = rfmMap.get(m.id)
            return (
              <button key={m.id} onClick={()=>setSelected(active?null:m)} style={{
                ...ms.memberCard,
                background: active ? 'var(--bg-active)' : 'var(--bg-raised)',
                border: `1px solid ${active ? 'var(--border-mid)' : 'var(--border-dim)'}`,
              }}>
                <div style={{...ms.avatar, background:tr.bg, color:tr.color}}>
                  {m.name[0]}
                </div>
                <div style={{flex:1, minWidth:0, textAlign:'left'}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap'}}>
                    <span style={{fontWeight:600, fontSize:14}}>{m.name}</span>
                    <span style={{fontSize:10, padding:'1px 7px', borderRadius:20, background:tr.bg, color:tr.color, fontWeight:500}}>
                      {t(tr.label)}
                    </span>
                    {rfm && (
                      <span style={{fontSize:10, padding:'1px 7px', borderRadius:20, background:'var(--bg-overlay)', color:rfm.tagColor, fontWeight:600, border:`1px solid ${rfm.tagColor}`}}>
                        {rfmLabel(rfm.tag)}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:6, fontFamily:'var(--font-mono)'}}>
                    {maskPhone(m.phone)}
                  </div>
                  <div style={{display:'flex', gap:14, flexWrap:'wrap'}}>
                    <span style={{fontSize:11, color:'var(--text-secondary)'}}>
                      <Gift size={10} style={{marginRight:3, verticalAlign:'middle'}}/>
                      {t('members.points_n', { n: m.points.toLocaleString() })}
                    </span>
                    <span style={{fontSize:11, color:'var(--text-secondary)'}}>
                      {t('members.spent_short')} {fmtMoney(m.totalSpent)}
                    </span>
                    {rfm && rfm.frequency > 0 && (
                      <span style={{fontSize:11, color:'var(--text-tertiary)'}}>
                        · {rfm.recencyDays === 0 ? t('common.today') : t('members.days_ago', { n: rfm.recencyDays })} · {t('members.times_n', { n: rfm.frequency })}
                      </span>
                    )}
                  </div>
                  {m.tier !== 'gold' && (
                    <div style={{marginTop:8}}>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-tertiary)', marginBottom:3}}>
                        <span>{t('members.upgrade_progress', { tier: t(m.tier==='normal'?'members.tier_silver':'members.tier_gold') })}</span>
                        <span className="mono">{Math.round(pct)}%</span>
                      </div>
                      <div style={{height:3, background:'var(--border-dim)', borderRadius:2}}>
                        <div style={{height:'100%', width:`${pct}%`, background:tr.color, borderRadius:2, transition:'width .5s'}}/>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:4}}>
                  <button className="btn-icon btn-sm" onClick={e=>{e.stopPropagation();startEdit(m)}}><Pencil size={13}/></button>
                  <button className="btn-icon btn-sm" style={{color:'var(--red)'}} onClick={e=>{e.stopPropagation();setConfirmDel(m.id)}}><Trash2 size={13}/></button>
                </div>
              </button>
            )
          })}
          {filtered.length===0 && (
            <div style={{textAlign:'center', padding:'48px', color:'var(--text-tertiary)', fontSize:13}}>{t('members.no_match')}</div>
          )}
        </div>
      </div>

      {/* Member detail panel */}
      {selectedLive && (
        <div style={ms.detail} className="animate-in">
          <div style={ms.detailHeader}>
            <div style={{...ms.avatarLg, background:TIER[selectedLive.tier].bg, color:TIER[selectedLive.tier].color}}>
              {selectedLive.name[0]}
            </div>
            <div>
              <div style={{fontWeight:700, fontSize:18, fontFamily:'var(--font-serif)', display:'flex', alignItems:'center', gap:8}}>
                {selectedLive.name}
                {isBirthdayMonth(selectedLive) && <Cake size={14} color="var(--red)" title={t('members.birthday_month')}/>}
              </div>
              <div style={{fontSize:12, color:'var(--text-tertiary)', display:'flex', alignItems:'center', gap:4, marginTop:3}}>
                <Phone size={11}/>{maskPhone(selectedLive.phone)}
              </div>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>
                {t('members.joined', { date: selectedLive.joinDate })}
                {selectedLive.birthday && ` · ${t('members.birthday')} ${selectedLive.birthday}`}
              </div>
            </div>
            <button className="btn-icon" style={{marginLeft:'auto'}} onClick={()=>setSelected(null)}><X size={16}/></button>
          </div>

          <div style={ms.statsGrid}>
            <StatCard label={t('members.stat_points')} value={t('members.points_n', { n: selectedLive.points.toLocaleString() })} color="var(--gold-bright)" />
            <StatCard label={t('members.stat_spent')} value={fmtMoney(selectedLive.totalSpent)} color="var(--blue)" />
            <StatCard label={t('members.stat_balance')} value={fmtMoney(selectedLive.balance||0)} color="var(--teal)" />
            <StatCard label={t('members.stat_orders')} value={t('members.orders_n', { n: memberOrders.length })} color="var(--text-secondary)" />
          </div>

          <div style={{display:'flex', gap:8, marginBottom:16}}>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowTopup(true)} style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
              <Wallet size={14}/> {t('members.topup')}
            </button>
          </div>

          <div style={ms.sectionTitle}>{t('members.purchase_history')}</div>
          <div style={{flex:1, overflowY:'auto'}}>
            {memberOrders.length === 0 ? (
              <div style={{color:'var(--text-tertiary)', fontSize:13, padding:'24px 0', textAlign:'center'}}>{t('members.no_history')}</div>
            ) : memberOrders.slice(0,20).map(o => {
              const isRefund = o.refundOf
              const isRefunded = o.status === 'refunded'
              return (
                <div key={o.id} style={{...ms.orderRow, opacity: isRefunded ? 0.5 : 1}}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:6}}>
                      {isRefund && <span className="badge badge-red">{t('members.refund')}</span>}
                      {isRefunded && <span className="badge badge-amber">{t('members.refunded')}</span>}
                      <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>
                        {(o.items||[]).map(i=>i.name).join('、').slice(0,28)}
                      </span>
                    </div>
                    <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>
                      {new Date(o.time).toLocaleString('id-ID', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                      {o.pointsEarned>0 && <span style={{color:'var(--gold)', marginLeft:8}}>+{t('members.points_n', { n: o.pointsEarned })}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:13, fontWeight:500, color: o.total < 0 ? 'var(--red)' : 'inherit'}}>
                      {fmtMoney(o.total)}
                    </span>
                    {!isRefund && !isRefunded && (
                      <button onClick={()=>setRefundOrder(o)} style={{padding:4, color:'var(--text-tertiary)'}} title={t('members.refund')}>
                        <RotateCcw size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {refundOrder && (
        <RefundModal order={refundOrder} session={session}
          priorRefunds={orders.filter(o => o.refundOf === refundOrder.id)}
          onClose={()=>setRefundOrder(null)}
          onRefund={handleRefund}/>
      )}

      {showTopup && selectedLive && (
        <div style={ms.overlay} onClick={()=>setShowTopup(false)}>
          <div style={ms.drawer} className="animate-scale" onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <span style={{fontWeight:600, fontSize:15, display:'flex', alignItems:'center', gap:8}}>
                <Wallet size={16}/> {t('members.topup_title')}
              </span>
              <button className="btn-icon" onClick={()=>setShowTopup(false)}><X size={16}/></button>
            </div>
            <div style={{padding:'10px 12px', background:'var(--bg-overlay)', borderRadius:8, marginBottom:14, fontSize:13}}>
              {selectedLive.name} · {t('members.current_balance')} <strong style={{fontFamily:'var(--font-mono)'}}>{fmtMoney(selectedLive.balance||0)}</strong>
            </div>
            <FieldLabel>{t('members.topup_amount')} *</FieldLabel>
            <input className="field" type="number" inputMode="numeric" value={topupAmt} onChange={e=>setTopupAmt(e.target.value)} placeholder="1000" autoFocus style={{marginBottom:12}}/>
            <FieldLabel>{t('members.bonus_amount')}</FieldLabel>
            <input className="field" type="number" inputMode="numeric" value={topupBonus} onChange={e=>setTopupBonus(e.target.value)} placeholder={t('members.bonus_ph')} style={{marginBottom:12}}/>
            <FieldLabel>{t('members.pay_method')}</FieldLabel>
            <div style={{display:'flex', gap:8, marginBottom:18}}>
              {[['cash',t('members.cash')],['card',t('members.card')]].map(([k,l]) => (
                <button key={k} onClick={()=>setTopupMethod(k)} style={{
                  flex:1, padding:10, borderRadius:8, fontSize:13,
                  background: topupMethod===k?'var(--gold)':'var(--bg-overlay)',
                  color: topupMethod===k?'#fff':'var(--text-secondary)',
                  border:`1px solid ${topupMethod===k?'var(--gold)':'var(--border-subtle)'}`,
                }}>{l}</button>
              ))}
            </div>
            {(parseFloat(topupAmt)+parseFloat(topupBonus||0)) > 0 && (
              <div style={{textAlign:'center', padding:12, background:'var(--gold-dim)', borderRadius:8, color:'var(--gold-bright)', marginBottom:14, fontSize:13}}>
                {t('members.usable', { amount: fmtMoney(parseFloat(topupAmt)+parseFloat(topupBonus||0)) })}
              </div>
            )}
            <div style={{display:'flex', gap:10}}>
              <button className="btn btn-primary" style={{flex:1}} disabled={!topupAmt} onClick={handleTopup}>{t('members.topup_confirm')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowTopup(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit drawer */}
      {editing && (
        <div style={ms.overlay}>
          <div style={ms.drawer} className="animate-scale">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <span style={{fontWeight:600, fontSize:15}}>{editing==='new'?t('members.add'):t('members.edit')}</span>
              <button className="btn-icon" onClick={()=>setEditing(null)}><X size={16}/></button>
            </div>
            <FieldLabel>{t('common.name')} *</FieldLabel>
            <input className="field" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={t('members.name_ph')} style={{marginBottom:12}}/>
            <FieldLabel>{t('members.phone')} *</FieldLabel>
            <input className="field" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="0812-3456-7890" style={{marginBottom:12, fontFamily:'var(--font-mono)'}}/>
            <FieldLabel>{t('members.birthday_opt')}</FieldLabel>
            <input className="field" type="date" value={form.birthday || ''} onChange={e=>setForm(f=>({...f,birthday:e.target.value}))} style={{marginBottom:12}}/>
            <FieldLabel>{t('common.notes')}</FieldLabel>
            <input className="field" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder={t('members.optional_ph')} style={{marginBottom:20}}/>
            <div style={{display:'flex', gap:10}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={save}><Check size={15}/>{t('common.save')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setEditing(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={ms.overlay}>
          <div style={{...ms.drawer, maxWidth:340}} className="animate-scale">
            <div style={{textAlign:'center', padding:'8px 0 20px'}}>
              <div style={{fontSize:32, marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:600, marginBottom:6}}>{t('members.delete_confirm')}</div>
              <div style={{fontSize:13, color:'var(--text-secondary)'}}>{t('members.delete_note')}</div>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={()=>{deleteMember(confirmDel);setConfirmDel(null);setSelected(null)}}>{t('members.delete_yes')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setConfirmDel(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{background:'var(--bg-overlay)', border:'1px solid var(--border-dim)', borderRadius:10, padding:'12px 14px'}}>
      <div style={{fontSize:10, color:'var(--text-tertiary)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:4}}>{label}</div>
      <div style={{fontFamily:'var(--font-mono)', fontSize:16, fontWeight:500, color}}>{value}</div>
    </div>
  )
}

function FieldLabel({ children }) {
  return <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:5, letterSpacing:'.03em'}}>{children}</div>
}

const ms = {
  root:{ display:'flex', height:'100%', background:'var(--bg-base)', overflow:'hidden' },
  left:{ flex:1, display:'flex', flexDirection:'column', padding:'16px', gap:14, overflow:'hidden', minWidth:0 },
  header:{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 },
  title:{ fontFamily:'var(--font-serif)', fontSize:20, fontWeight:600 },
  toolbar:{ display:'flex', gap:10, flexShrink:0, flexWrap:'wrap' },
  filterBtn:{ padding:'5px 10px', borderRadius:6, fontSize:12, cursor:'pointer', transition:'all 120ms' },
  list:{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 },
  memberCard:{
    display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
    borderRadius:'var(--r3)', transition:'all 150ms var(--ease)', textAlign:'left', cursor:'pointer', width:'100%',
  },
  avatar:{ width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:16, flexShrink:0 },
  avatarLg:{ width:52, height:52, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:22, flexShrink:0 },
  detail:{
    width:320, flexShrink:0, borderLeft:'1px solid var(--border-dim)',
    background:'var(--bg-raised)', display:'flex', flexDirection:'column',
    padding:'20px', gap:14, overflow:'hidden',
  },
  detailHeader:{ display:'flex', gap:14, alignItems:'flex-start', flexShrink:0 },
  statsGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, flexShrink:0 },
  sectionTitle:{ fontSize:11, color:'var(--text-tertiary)', letterSpacing:'.08em', textTransform:'uppercase', flexShrink:0 },
  orderRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border-dim)' },
  overlay:{ position:'fixed', inset:0, background:'rgba(44,42,38,0.25)',backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  // RWD-01：maxHeight + overflowY，手機上表單長於視窗時可捲動
  drawer:{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:'var(--r4)', padding:24, width:'90%', maxWidth:420, maxHeight:'88vh', overflowY:'auto' },
}
