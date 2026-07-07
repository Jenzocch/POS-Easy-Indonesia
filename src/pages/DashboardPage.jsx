import { useMemo, useEffect, useState } from 'react'
import {
  TrendingUp, ShoppingBag, Users, Package, AlertTriangle,
  DollarSign, Target, Award, Calendar, Clock, ArrowUpRight, ArrowDownRight,
  Truck, BarChart2, Percent, Sparkles,
} from 'lucide-react'
import { getSetting, setSetting } from '../utils/dataAccess'
import { averageTicket, profitAnalysis, getExpiringProducts, getReorderList, customerSegmentation, computeAllRFM } from '../utils/analytics'
import { isLowStock, isOutOfStock } from '../utils/stock'
import { t, fmtMoney, formatTime, getCurrentLanguage } from '../i18n'

const DATE_LOCALES = { zh: 'zh-TW', en: 'en-US', id: 'id-ID' }

export default function DashboardPage({ store, session }) {
  const { products, members, orders, todayRevenue, todayOrders, todayProfit, lowStockCount, openShift } = store
  const [salesGoal, setSalesGoal] = useState(0)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')

  useEffect(() => {
    getSetting('dailySalesGoal').then(v => {
      const n = parseFloat(v) || 0
      setSalesGoal(n)
      setGoalInput(String(n))
    })
  }, [])

  const handleSaveGoal = async () => {
    const n = parseFloat(goalInput) || 0
    setSalesGoal(n)
    await setSetting('dailySalesGoal', String(n))
    setEditingGoal(false)
  }

  // 統計
  const stats = useMemo(() => {
    // 排除完整退貨配對（原訂單 status='refunded' + 對應的全退負數訂單）；
    // 部分退貨保留：原訂單 (status='completed') 與負數退貨訂單兩邊都計入，總和會正確
    const validOrders = orders.filter(o => o.status !== 'refunded' && !(o.refundOf && o.fullRefund))
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    const ordersToday    = validOrders.filter(o => new Date(o.time).toDateString() === today)
    const ordersYesterday = validOrders.filter(o => new Date(o.time).toDateString() === yesterday)
    const revYesterday    = ordersYesterday.reduce((s,o) => s + o.total, 0)
    const revDelta = revYesterday > 0 ? ((todayRevenue - revYesterday) / revYesterday * 100) : 0

    // 最近 7 天
    const last7 = Array.from({length:7}, (_,i) => {
      const d = new Date(); d.setDate(d.getDate() - (6-i))
      const ds = d.toDateString()
      const dayOrders = validOrders.filter(o => new Date(o.time).toDateString() === ds)
      return { date: d, label: t('dash.day_label', { d: d.getDate() }), revenue: dayOrders.reduce((s,o)=>s+o.total,0), count: dayOrders.length }
    })
    const max7 = Math.max(...last7.map(d => d.revenue), 1)

    // 暢銷 Top 5
    const itemMap = {}
    ordersToday.forEach(o => {
      (o.items||[]).forEach(i => {
        if (!itemMap[i.id]) itemMap[i.id] = { name: i.name, qty: 0, revenue: 0 }
        itemMap[i.id].qty += i.qty
        itemMap[i.id].revenue += i.price * i.qty
      })
    })
    const topItems = Object.values(itemMap).sort((a,b)=>b.qty-a.qty).slice(0,5)

    // 低庫存 / 缺貨（統一走 utils/stock 判定）
    const lowStock = products.filter(isLowStock).slice(0, 5)
    const outOfStock = products.filter(isOutOfStock).length

    // 即期商品（7 天內到期、未過期）— 統一走 analytics 的安全日期解析，避免手刻 new Date(p.expiryDate) 的時區 off-by-one
    const expiringSoon = getExpiringProducts(products, 7).soon.slice(0, 5)

    return { ordersToday, revDelta, last7, max7, topItems, lowStock, outOfStock, expiringSoon }
  }, [orders, products, todayRevenue])

  // 30 天指標（analytics utils）
  const analytics30d = useMemo(() => {
    const avgTicket = averageTicket(orders, 30)
    const profit = profitAnalysis(orders, products, 30)
    const segmentation = customerSegmentation(orders, members)
    const reorderList = getReorderList(products)
    const { expired, soon } = getExpiringProducts(products, 7)
    const rfmList = computeAllRFM(members, orders)
    const tagCounts = rfmList.reduce((acc, m) => {
      const tag = m.rfm?.tag || '未消費' // 資料值：analytics.js 產生的 tag，不可翻譯
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {})
    return { avgTicket, profit, segmentation, reorderList, expired, soon, tagCounts, rfmList }
  }, [orders, products, members])

  const goalPct = salesGoal > 0 ? Math.min(100, todayRevenue / salesGoal * 100) : 0

  return (
    <div style={ds.root}>
      {/* Hero — 漸層問候卡 */}
      <div style={ds.hero} className="animate-up">
        <div style={ds.heroBlob1}/>
        <div style={ds.heroBlob2}/>
        <div style={{position:'relative', zIndex:1}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:12.5, color:'var(--text-tertiary)', fontWeight:500}}>
            <Calendar size={13}/>
            {new Date().toLocaleDateString(DATE_LOCALES[getCurrentLanguage()] || 'id-ID', { year:'numeric', month:'long', day:'numeric', weekday:'long' })}
          </div>
          <h1 style={{fontSize:32, fontWeight:800, letterSpacing:'-.02em', color:'var(--text-primary)'}}>
            {greet()}，<span style={{background:'var(--accent-grad)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>{session?.username || t('dash.user')}</span>
          </h1>
          <div style={{fontSize:14, color:'var(--text-secondary)', marginTop:6}}>
            {t('dash.hero_a')} <strong style={{color:'var(--accent-deep)'}}>{stats.ordersToday.length}</strong> {t('dash.hero_b')} <strong style={{color:'var(--accent-deep)', fontFamily:'var(--font-mono)'}}>{fmtMoney(todayRevenue)}</strong>
          </div>
        </div>
        {openShift && (
          <div style={ds.shiftBadge}>
            <span style={ds.liveDot}/>
            {t('dash.shift_open', { time: formatTime(openShift.openTime) })}
          </div>
        )}
      </div>

      {/* KPI cards — 今日 */}
      <div style={ds.kpiGrid}>
        <KpiCard icon={DollarSign} color="gold" label={t('dash.today_revenue')} value={fmtMoney(todayRevenue)}
          delta={stats.revDelta} subtitle={t('dash.vs_yesterday', { pct: `${stats.revDelta >= 0 ? '+' : ''}${stats.revDelta.toFixed(1)}` })} idx={0}/>
        <KpiCard icon={ShoppingBag} color="blue" label={t('dash.today_orders')}
          value={stats.ordersToday.length} subtitle={t('dash.avg_per_order', { amt: fmtMoney(stats.ordersToday.length ? Math.round(todayRevenue / stats.ordersToday.length) : 0) })} idx={1}/>
        <KpiCard icon={TrendingUp} color="green" label={t('dash.today_profit')}
          value={fmtMoney(todayProfit)} subtitle={t('dash.margin_rate', { pct: todayRevenue > 0 ? (todayProfit/todayRevenue*100).toFixed(1) : 0 })} idx={2}/>
        <KpiCard icon={Users} color="teal" label={t('dash.members_products')} value={`${members.length} / ${products.length}`} subtitle={t('dash.members_products_sub')} idx={3}/>
      </div>

      {/* 30 天指標 row */}
      <div style={ds.kpiGrid}>
        <KpiCard icon={BarChart2} color="purple" label={t('dash.avg_ticket_30d')}
          value={fmtMoney(Math.round(analytics30d.avgTicket.avg))}
          subtitle={t('dash.orders_count', { n: analytics30d.avgTicket.count })} idx={0}/>
        <KpiCard icon={Percent} color="green" label={t('dash.margin_30d')}
          value={`${analytics30d.profit.marginRate.toFixed(1)}%`}
          subtitle={t('dash.profit_amount', { amt: fmtMoney(Math.round(analytics30d.profit.profit)) })} idx={1}/>
        <KpiCard icon={Truck} color="amber" label={t('dash.reorder')}
          value={analytics30d.reorderList.length}
          subtitle={analytics30d.reorderList.length > 0 ? t('dash.goto_purchase') : t('dash.stock_ok')} idx={2}/>
        <KpiCard icon={Clock} color="red" label={t('dash.expiring_label')}
          value={`${analytics30d.soon.length} / ${analytics30d.expired.length}`}
          subtitle={t('dash.expiring_sub')} idx={3}/>
      </div>

      {/* 會員結構 */}
      <div style={ds.card}>
        <div style={ds.cardHead}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Sparkles size={16} color="var(--purple)"/>
            <span style={{fontWeight:600}}>{t('dash.member_structure')}</span>
          </div>
          <span style={{fontSize:11, color:'var(--text-tertiary)'}}>
            {t('dash.member_revenue_share', { pct: analytics30d.segmentation.memberRevenue + analytics30d.segmentation.anonRevenue > 0
              ? ((analytics30d.segmentation.memberRevenue / (analytics30d.segmentation.memberRevenue + analytics30d.segmentation.anonRevenue)) * 100).toFixed(0)
              : 0 })}
          </span>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:8, marginTop:8}}>
          {/* 中文字串為 analytics.js 產生的資料值（tag），只翻譯顯示標籤 */}
          {[
            [t('dash.tag_vip'), analytics30d.tagCounts['VIP'] || 0, 'var(--gold)'],
            [t('dash.tag_core'), analytics30d.tagCounts['核心會員'] || 0, 'var(--green)'],
            [t('dash.tag_new'), analytics30d.tagCounts['新會員'] || 0, 'var(--blue)'],
            [t('dash.tag_churn'), analytics30d.tagCounts['流失預警'] || 0, 'var(--amber)'],
            [t('dash.tag_dormant'), analytics30d.tagCounts['沉睡會員'] || 0, 'var(--red)'],
          ].map(([tag, n, color]) => (
            <div key={tag} style={{padding:'10px 12px', background:'var(--bg-overlay)', borderRadius:8, borderTop:`2px solid ${color}`}}>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:3}}>{tag}</div>
              <div style={{fontSize:20, fontWeight:600, fontFamily:'var(--font-mono)', color}}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 銷售目標 */}
      <div style={ds.card}>
        <div style={ds.cardHead}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Target size={16} color="var(--gold)"/>
            <span style={{fontWeight:600}}>{t('dash.sales_goal')}</span>
          </div>
          {!editingGoal ? (
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditingGoal(true)}>{t('dash.set_goal')}</button>
          ) : (
            <div style={{display:'flex', gap:6}}>
              <input className="field" type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)}
                style={{width:120, padding:'4px 8px', fontSize:13}}/>
              <button className="btn btn-primary btn-sm" onClick={handleSaveGoal}>{t('common.save')}</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>{setEditingGoal(false);setGoalInput(String(salesGoal))}}>{t('common.cancel')}</button>
            </div>
          )}
        </div>
        {salesGoal > 0 ? (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
              <span style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600}}>
                {fmtMoney(todayRevenue)} <span style={{fontSize:12, color:'var(--text-tertiary)', fontWeight:400}}>/ {fmtMoney(salesGoal)}</span>
              </span>
              <span style={{fontSize:14, fontWeight:600, color: goalPct >= 100 ? 'var(--green)' : 'var(--gold)'}}>
                {goalPct.toFixed(0)}%
              </span>
            </div>
            <div style={ds.progressBar}>
              <div style={{...ds.progressFill, width: `${goalPct}%`, background: goalPct >= 100 ? 'var(--green)' : 'var(--gold)'}}/>
            </div>
            <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:6}}>
              {goalPct >= 100 ? t('dash.goal_reached') : t('dash.goal_remaining', { amt: fmtMoney(Math.max(0, salesGoal - todayRevenue)) })}
            </div>
          </>
        ) : (
          <div style={{color:'var(--text-tertiary)', fontSize:13, textAlign:'center', padding:'12px 0'}}>{t('dash.no_goal')}</div>
        )}
      </div>

      <div style={ds.row2}>
        {/* 7 天趨勢 */}
        <div style={ds.card}>
          <div style={ds.cardHead}>
            <span style={{fontWeight:600}}>{t('dash.revenue_7d')}</span>
          </div>
          <div style={{display:'flex', alignItems:'flex-end', gap:8, height:140, padding:'8px 0'}}>
            {stats.last7.map((d,i) => {
              const h = d.revenue / stats.max7 * 100
              const isToday = i === stats.last7.length - 1
              return (
                <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4}}>
                  <div style={{fontSize:10, color:'var(--text-tertiary)', fontFamily:'var(--font-mono)'}}>
                    {d.revenue > 0 ? Math.round(d.revenue/1000)+'k' : ''}
                  </div>
                  <div style={{flex:1, width:'100%', display:'flex', alignItems:'flex-end'}}>
                    <div style={{
                      width:'100%', height:`${Math.max(2, h)}%`,
                      background: isToday ? 'var(--gold)' : 'var(--accent-dim)',
                      borderRadius:'4px 4px 0 0',
                    }}/>
                  </div>
                  <div style={{fontSize:11, color: isToday ? 'var(--gold)' : 'var(--text-tertiary)', fontWeight: isToday ? 600 : 400}}>
                    {d.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 暢銷 Top 5 */}
        <div style={ds.card}>
          <div style={ds.cardHead}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <Award size={16} color="var(--gold)"/>
              <span style={{fontWeight:600}}>{t('dash.top_today')}</span>
            </div>
          </div>
          {stats.topItems.length === 0 ? (
            <div style={ds.empty}>{t('dash.no_sales_today')}</div>
          ) : stats.topItems.map((item, i) => (
            <div key={i} style={ds.topRow}>
              <div style={{...ds.rank, background: i===0?'var(--gold)':i===1?'var(--accent-dim)':'var(--bg-overlay)', color: i===0?'#fff':'var(--text-secondary)'}}>{i+1}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</div>
                <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('dash.sold_qty', { qty: item.qty })}</div>
              </div>
              <div style={{fontFamily:'var(--font-mono)', fontWeight:500, fontSize:13}}>{fmtMoney(item.revenue)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={ds.row2}>
        {/* 低庫存警示 */}
        <div style={ds.card}>
          <div style={ds.cardHead}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <Package size={16} color="var(--amber)"/>
              <span style={{fontWeight:600}}>{t('dash.stock_alert')}</span>
              {lowStockCount > 0 && <span className="badge badge-amber">{lowStockCount}</span>}
            </div>
          </div>
          {stats.lowStock.length === 0 && stats.outOfStock === 0 ? (
            <div style={ds.empty}>{t('dash.stock_ok')}</div>
          ) : (
            <>
              {stats.outOfStock > 0 && (
                <div style={{padding:'8px 0', borderBottom:'1px solid var(--border-dim)', display:'flex', alignItems:'center', gap:8}}>
                  <AlertTriangle size={14} color="var(--red)"/>
                  <span style={{fontSize:13, color:'var(--red)'}}>{t('dash.out_of_stock', { n: stats.outOfStock })}</span>
                </div>
              )}
              {stats.lowStock.map(p => (
                <div key={p.id} style={ds.topRow}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
                    <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{p.category}</div>
                  </div>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--amber)', fontWeight:600}}>{p.stock} {p.unit}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 即期商品 */}
        <div style={ds.card}>
          <div style={ds.cardHead}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <Clock size={16} color="var(--red)"/>
              <span style={{fontWeight:600}}>{t('dash.expiring_7d')}</span>
            </div>
          </div>
          {stats.expiringSoon.length === 0 ? (
            <div style={ds.empty}>{t('dash.no_expiring')}</div>
          ) : stats.expiringSoon.map(p => {
            const days = p.daysLeft // getExpiringProducts 已算好（安全解析、距今天午夜的天數）
            return (
              <div key={p.id} style={ds.topRow}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
                  <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('dash.expires_on', { date: p.expiryDate })}</div>
                </div>
                <span style={{fontFamily:'var(--font-mono)', fontSize:13, color: days <= 1 ? 'var(--red)' : 'var(--amber)', fontWeight:600}}>
                  {days <= 0 ? t('common.today') : t('dash.days', { d: days })}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, color, label, value, subtitle, delta, idx = 0 }) {
  return (
    <div className="card card-hover animate-up" style={{...ds.kpi, animationDelay:`${idx*60}ms`}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14}}>
        <span className="section-title" style={{margin:0}}>{label}</span>
        <div style={{...ds.kpiIcon, background: `var(--${color}-dim)`, color: `var(--${color})`}}>
          <Icon size={18}/>
        </div>
      </div>
      <div style={{fontSize:28, fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--text-primary)', letterSpacing:'-.02em', lineHeight:1}}>
        {value}
      </div>
      {subtitle && (
        <div style={{fontSize:11.5, color: delta != null && delta >= 0 ? 'var(--green)' : delta != null && delta < 0 ? 'var(--red)' : 'var(--text-tertiary)', marginTop:8, display:'flex', alignItems:'center', gap:4, fontWeight:600}}>
          {delta != null && (delta >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>)}
          {subtitle}
        </div>
      )}
    </div>
  )
}

function greet() {
  const h = new Date().getHours()
  if (h < 5) return t('dash.greet_night')
  if (h < 12) return t('dash.greet_morning')
  if (h < 18) return t('dash.greet_afternoon')
  return t('dash.greet_evening')
}

const ds = {
  root: { flex:1, overflowY:'auto', padding:'24px 28px', background:'var(--bg-base)' },
  hero: {
    position:'relative',
    padding:'28px 32px',
    marginBottom:20,
    borderRadius:'var(--r4)',
    background:'linear-gradient(135deg, var(--bg-raised) 0%, var(--bg-overlay) 100%)',
    border:'1px solid var(--border-dim)',
    boxShadow:'var(--shadow-sm)',
    overflow:'hidden',
    display:'flex', justifyContent:'space-between', alignItems:'center', gap:16,
    flexWrap:'wrap',
  },
  heroBlob1: {
    position:'absolute', top:-40, right:80,
    width:200, height:200, borderRadius:'50%',
    background:'radial-gradient(circle, var(--accent-glow), transparent 70%)',
    pointerEvents:'none',
  },
  heroBlob2: {
    position:'absolute', bottom:-60, right:-40,
    width:240, height:240, borderRadius:'50%',
    background:'radial-gradient(circle, var(--gold-glow), transparent 70%)',
    pointerEvents:'none',
  },
  shiftBadge: {
    position:'relative', zIndex:1,
    display:'flex', alignItems:'center', gap:8,
    padding:'10px 16px',
    background:'var(--green-dim)',
    color:'var(--green)',
    borderRadius:'var(--r-pill)',
    fontSize:13, fontWeight:600,
    border:'1px solid rgba(63,178,122,0.18)',
  },
  liveDot:{
    width:8, height:8, borderRadius:'50%',
    background:'var(--green)',
    boxShadow:'0 0 0 0 var(--green)',
    animation:'pulseGlow 1.6s var(--ease) infinite',
  },
  kpiGrid: {
    display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',
    gap:14, marginBottom:18,
  },
  kpi: {
    padding:'18px 20px', borderRadius:'var(--r3)',
  },
  kpiIcon: {
    width:38, height:38, borderRadius:'var(--r2)',
    display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0,
  },
  card: {
    background:'var(--bg-raised)',
    border:'1px solid var(--border-dim)',
    borderRadius:'var(--r3)',
    padding:'18px 20px', boxShadow:'var(--shadow-sm)',
    marginBottom:14,
  },
  cardHead: {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    marginBottom:14, fontSize:13,
  },
  row2: {
    display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',
    gap:14,
  },
  topRow: {
    display:'flex', alignItems:'center', gap:12,
    padding:'10px 0', borderBottom:'1px solid var(--border-dim)',
  },
  rank: {
    width:26, height:26, borderRadius:'50%',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:11, fontWeight:700, flexShrink:0,
    fontFamily:'var(--font-mono)',
  },
  empty: { textAlign:'center', color:'var(--text-tertiary)', fontSize:13, padding:'24px 0', fontWeight:500 },
  progressBar: {
    height:10, background:'var(--bg-overlay)',
    borderRadius:'var(--r-pill)', overflow:'hidden',
    boxShadow:'inset 0 1px 2px rgba(0,0,0,0.04)',
  },
  progressFill: {
    height:'100%', borderRadius:'var(--r-pill)',
    transition:'width 800ms var(--ease)',
    boxShadow:'inset 0 1px 0 rgba(255,255,255,0.2)',
  },
}
