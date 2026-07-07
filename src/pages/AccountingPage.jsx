import { useState, useMemo } from 'react'
import {
  buildPnL, buildBalanceSheet, groupJournalByDate,
  exportJournalCSV, exportPnLCSV,
  ACCOUNTS,
} from '../utils/accounting'
import { downloadCSV } from '../utils/csv'
import { Download, Plus, Trash2, X, Check, ChevronDown, ChevronRight, BookOpen, TrendingUp, Scale, FileText } from 'lucide-react'
import { t, fmtMoney } from '../i18n'

// 科目名稱只在顯示時翻譯：帳本資料存的是科目「代號」（如 '4101'），
// accounting.js 的 ACCOUNTS 中文名稱為資料來源，不可更動。
const accName = (code) => (ACCOUNTS[code] ? t('acct.account.' + code) : code)

const TABS = [
  { key: 'pnl',      label: 'acct.tab_pnl',     Icon: TrendingUp },
  { key: 'journal',  label: 'acct.tab_journal', Icon: BookOpen   },
  { key: 'balance',  label: 'acct.tab_balance', Icon: Scale      },
  { key: 'expense',  label: 'acct.tab_expense', Icon: Plus       },
]

const EXPENSE_ACCOUNTS = Object.entries(ACCOUNTS)
  .filter(([,v]) => v.type === 'expense')
  .map(([k,v]) => ({ code: k, name: v.name, group: v.group }))

const ASSET_ACCOUNTS = Object.entries(ACCOUNTS)
  .filter(([,v]) => v.type === 'asset')
  .map(([k,v]) => ({ code: k, name: v.name }))

export default function AccountingPage({ store }) {
  const { allJournal, manualEntries, addManualEntry, deleteManualEntry } = store
  const [tab, setTab]   = useState('pnl')

  const now   = new Date()
  const y     = now.getFullYear()
  const m     = String(now.getMonth()+1).padStart(2,'0')
  const [from, setFrom] = useState(`${y}-${m}-01`)
  const [to,   setTo]   = useState(now.toISOString().slice(0,10))

  const pnl     = useMemo(() => buildPnL(allJournal, from, to), [allJournal, from, to])
  const balance = useMemo(() => buildBalanceSheet(allJournal, to), [allJournal, to])
  const grouped = useMemo(() => groupJournalByDate(
    allJournal.filter(j => j.date >= from && j.date <= to)
  ), [allJournal, from, to])

  function handleExport() {
    // 注意：utils/csv 的 downloadCSV 參數順序是 (filename, content)，與舊 accounting.js 版本相反
    if (tab === 'journal') downloadCSV(`${t('acct.tab_journal')}_${from}_${to}.csv`, exportJournalCSV(allJournal.filter(j=>j.date>=from&&j.date<=to)))
    else if (tab === 'pnl') downloadCSV(`${t('acct.tab_pnl')}_${from}_${to}.csv`, exportPnLCSV(pnl, from, to))
  }

  const canExport = tab === 'journal' || tab === 'pnl'

  return (
    <div style={ac.root}>
      {/* Header */}
      <div style={ac.header}>
        <div>
          <h2 style={ac.title}>{t('acct.title')}</h2>
          <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>
            {t('acct.subtitle', { n: allJournal.length })}
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <div style={ac.dateRange}>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={ac.dateInput}/>
            <span style={{color:'var(--text-tertiary)',fontSize:12}}>{t('acct.to')}</span>
            <input type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={ac.dateInput}/>
          </div>
          {canExport && (
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>
              <Download size={14}/>{t('acct.export_csv')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={ac.tabBar}>
        {TABS.map(({key,label,Icon})=>(
          <button key={key} onClick={()=>setTab(key)} style={{
            ...ac.tab,
            background: tab===key ? 'var(--bg-active)' : 'transparent',
            color: tab===key ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottom: `2px solid ${tab===key?'var(--gold)':'transparent'}`,
          }}>
            <Icon size={14}/>{t(label)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={ac.content}>
        {tab === 'pnl'     && <PnLView     pnl={pnl} from={from} to={to} />}
        {tab === 'journal' && <JournalView grouped={grouped} manualEntries={manualEntries} deleteManualEntry={deleteManualEntry}/>}
        {tab === 'balance' && <BalanceView balance={balance} asOf={to}/>}
        {tab === 'expense' && <ExpenseView addManualEntry={addManualEntry}/>}
      </div>
    </div>
  )
}

// ── 損益表 ────────────────────────────────────────────────
function PnLView({ pnl, from, to }) {
  const { revenue, cogs, grossProfit, grossMargin, opExpenses, netIncome, netMargin, expenseLines } = pnl
  const loss = netIncome < 0

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, height:'100%', overflowY:'auto'}}>
      {/* Main P&L */}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={ac.cardTitle}>{t('acct.pnl_summary')} <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:400}}>{from} ~ {to}</span></div>

        <div style={ac.pnlSection}>
          <PnLRow label={t('acct.revenue')} amount={revenue} bold highlight="blue"/>
          <PnLRow label={t('acct.cogs')} amount={-cogs} sub/>
          <div style={ac.pnlDivider}/>
          <PnLRow label={t('acct.gross_profit')} amount={grossProfit} bold highlight={grossProfit>=0?'green':'red'}/>
          <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'right',marginBottom:4}}>{t('acct.gross_margin')} {grossMargin}%</div>
          <PnLRow label={t('acct.op_expenses')} amount={-opExpenses} sub/>
          <div style={ac.pnlDivider}/>
          <PnLRow label={t('acct.net_income')} amount={netIncome} bold lg highlight={loss?'red':'gold'}/>
          <div style={{fontSize:11,color:loss?'var(--red)':'var(--text-tertiary)',textAlign:'right',marginTop:4}}>{t('acct.net_margin')} {netMargin}%</div>
        </div>

        {/* Expense breakdown */}
        {expenseLines.length > 0 && (
          <div className="card" style={{padding:'14px 16px'}}>
            <div style={{fontSize:11,color:'var(--text-tertiary)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:12}}>{t('acct.expense_detail')}</div>
            {expenseLines.map(l=>(
              <div key={l.code} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border-dim)',fontSize:13}}>
                <span style={{color:'var(--text-secondary)'}}>{accName(l.code)}</span>
                <span style={{fontFamily:'var(--font-mono)',color:'var(--red)'}}>({fmtMoney(l.amount)})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visual cards */}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={ac.cardTitle}>{t('acct.key_metrics')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[
            {label:t('acct.revenue'),      val:fmtMoney(revenue),     color:'var(--blue)'},
            {label:t('acct.gross_profit'), val:fmtMoney(grossProfit), color:'var(--teal)'},
            {label:t('acct.gross_margin'), val:`${grossMargin}%`,     color:'var(--gold)'},
            {label:t('acct.net_income'),   val:fmtMoney(netIncome),   color: loss?'var(--red)':'var(--green)'},
          ].map(({label,val,color},i)=>(
            <div key={i} className="card" style={{padding:'14px 16px',borderTop:`2px solid ${color}`}}>
              <div style={{fontSize:10,color:'var(--text-tertiary)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>{label}</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:18,fontWeight:500,color}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Margin bar */}
        <div className="card" style={{padding:'14px 16px'}}>
          <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:12,letterSpacing:'.06em',textTransform:'uppercase'}}>{t('acct.structure')}</div>
          {revenue > 0 && (
            <div>
              <div style={{display:'flex',height:24,borderRadius:4,overflow:'hidden',marginBottom:8}}>
                <div style={{width:`${cogs/revenue*100}%`,background:'var(--red)',opacity:.7}} title={`${t('acct.cogs')} ${Math.round(cogs/revenue*100)}%`}/>
                <div style={{width:`${opExpenses/revenue*100}%`,background:'var(--amber)',opacity:.7}} title={`${t('acct.expenses')} ${Math.round(opExpenses/revenue*100)}%`}/>
                <div style={{flex:1,background:'var(--green)',opacity:.7}} title={t('acct.gross_profit')}/>
              </div>
              <div style={{display:'flex',gap:14,fontSize:11}}>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:'var(--red)',opacity:.7,display:'inline-block'}}/><span style={{color:'var(--text-secondary)'}}>{t('acct.cost')} {Math.round(cogs/revenue*100)}%</span></span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:'var(--amber)',opacity:.7,display:'inline-block'}}/><span style={{color:'var(--text-secondary)'}}>{t('acct.expenses')} {Math.round(opExpenses/revenue*100)}%</span></span>
                <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:'var(--green)',opacity:.7,display:'inline-block'}}/><span style={{color:'var(--text-secondary)'}}>{t('acct.net_profit')} {netMargin}%</span></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PnLRow({ label, amount, bold, sub, lg, highlight }) {
  const colorMap = { blue:'var(--blue)', green:'var(--green)', red:'var(--red)', gold:'var(--gold-bright)', teal:'var(--teal)' }
  const color = highlight ? colorMap[highlight] : amount < 0 ? 'var(--red)' : 'var(--text-primary)'
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:`${lg?10:6}px 0`,marginLeft:sub?16:0}}>
      <span style={{fontSize:sub?12:13,color:sub?'var(--text-secondary)':'var(--text-primary)',fontWeight:bold?600:400}}>{label}</span>
      <span style={{fontFamily:'var(--font-mono)',fontSize:lg?20:sub?12:14,fontWeight:bold?600:400,color}}>
        {fmtMoney(Math.abs(amount))}
        {amount < 0 && <span style={{fontSize:10,opacity:.7}}> {t('acct.expense_marker')}</span>}
      </span>
    </div>
  )
}

// ── 日記帳 ────────────────────────────────────────────────
function JournalView({ grouped, manualEntries, deleteManualEntry }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (date) => setExpanded(p=>({...p,[date]:!p[date]}))
  const manualIds = new Set(manualEntries.map(e=>e.id))

  if (grouped.length === 0) return (
    <div style={{textAlign:'center',padding:'60px',color:'var(--text-tertiary)',fontSize:13}}>
      {t('acct.no_entries')}
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,overflowY:'auto',height:'100%'}}>
      {grouped.map(([date, entries]) => {
        const dayTotal = entries.filter(e=>e.type==='auto_sale').reduce((s,e)=>s+(e.lines.find(l=>l.account==='4101')?.credit||0),0)
        const open = expanded[date] !== false  // default open
        return (
          <div key={date} className="card" style={{overflow:'hidden'}}>
            <button onClick={()=>toggle(date)} style={{
              display:'flex',alignItems:'center',gap:10,width:'100%',
              padding:'12px 16px',textAlign:'left',transition:'background 120ms',
            }}>
              {open ? <ChevronDown size={14} style={{color:'var(--text-tertiary)',flexShrink:0}}/> : <ChevronRight size={14} style={{color:'var(--text-tertiary)',flexShrink:0}}/>}
              <span style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--text-secondary)',minWidth:90}}>{date}</span>
              <span style={{fontSize:12,color:'var(--text-tertiary)'}}>{t('acct.n_entries', { n: entries.length })}</span>
              {dayTotal > 0 && <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:13,color:'var(--gold-bright)',fontWeight:500}}>{fmtMoney(dayTotal)}</span>}
            </button>

            {open && (
              <div style={{borderTop:'1px solid var(--border-dim)'}}>
                {entries.map(j=>(
                  <div key={j.id} style={{borderBottom:'1px solid var(--border-dim)',padding:'10px 16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <span style={{...ac.typeBadge,...TYPE_STYLE[j.type]||TYPE_STYLE.manual}}>{t(TYPE_LABEL[j.type]||'acct.type_manual')}</span>
                      <span style={{fontSize:13,fontWeight:500}}>{j.description}</span>
                      {manualIds.has(j.id) && (
                        <button className="btn-icon btn-sm" style={{marginLeft:'auto',color:'var(--red)'}} onClick={()=>deleteManualEntry(j.id)}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 90px 90px',gap:4,fontSize:11}}>
                      <span style={{color:'var(--text-tertiary)',letterSpacing:'.04em'}}>{t('acct.account_col')}</span>
                      <span style={{color:'var(--text-tertiary)',textAlign:'right'}}>{t('acct.debit')}</span>
                      <span style={{color:'var(--text-tertiary)',textAlign:'right'}}>{t('acct.credit')}</span>
                      {j.lines.map((l,i)=>(
                        <>
                          <span key={i+'a'} style={{color:'var(--text-secondary)',paddingLeft:l.debit===0?16:0}}>
                            {accName(l.account)}
                            {l.note && <span style={{color:'var(--text-tertiary)',marginLeft:6}}>— {l.note}</span>}
                          </span>
                          <span key={i+'d'} style={{fontFamily:'var(--font-mono)',textAlign:'right',color:l.debit?'var(--blue)':'var(--text-disabled)'}}>
                            {l.debit?l.debit.toLocaleString():'—'}
                          </span>
                          <span key={i+'c'} style={{fontFamily:'var(--font-mono)',textAlign:'right',color:l.credit?'var(--teal)':'var(--text-disabled)'}}>
                            {l.credit?l.credit.toLocaleString():'—'}
                          </span>
                        </>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const TYPE_LABEL = { auto_sale:'acct.type_sale', auto_cogs:'acct.type_cogs', auto_discount:'acct.type_discount', auto_balance:'acct.type_balance', auto_topup:'acct.type_topup', manual:'acct.type_manual' }
const TYPE_STYLE = {
  auto_sale:     { background:'var(--teal-dim)',   color:'var(--teal)'  },
  auto_cogs:     { background:'var(--amber-dim)',  color:'var(--amber)' },
  auto_discount: { background:'var(--gold-dim)',   color:'var(--gold-bright)' },
  auto_balance:  { background:'var(--gold-dim)',   color:'var(--gold-bright)' },
  auto_topup:    { background:'var(--green-dim)',  color:'var(--green)' },
  manual:        { background:'var(--blue-dim)',   color:'var(--blue)'  },
}

// ── 資產負債表 ────────────────────────────────────────────
function BalanceView({ balance, asOf }) {
  const { sections, totalAssets, totalLiabilities, totalEquity } = balance
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,height:'100%',overflowY:'auto'}}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={ac.cardTitle}>{t('acct.assets')} <span style={{fontFamily:'var(--font-mono)',color:'var(--blue)',fontSize:14,fontWeight:500}}>{fmtMoney(totalAssets)}</span></div>
        <BSSection items={sections.asset.items} color="var(--blue)"/>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={ac.cardTitle}>{t('acct.liab_equity')}</div>
        <div style={{...ac.cardTitle,fontSize:12,color:'var(--text-tertiary)'}}>{t('acct.liabilities')} <span style={{fontFamily:'var(--font-mono)',color:'var(--red)',fontSize:14}}> {fmtMoney(totalLiabilities)}</span></div>
        <BSSection items={sections.liability.items} color="var(--red)"/>
        <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{t('acct.equity')} <span style={{fontFamily:'var(--font-mono)',color:'var(--green)',fontSize:14}}> {fmtMoney(totalEquity)}</span></div>
        <BSSection items={sections.equity.items} color="var(--green)"/>
        <div className="card" style={{padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`3px solid ${balanced?'var(--green)':'var(--red)'}`}}>
          <span style={{fontSize:12,color:balanced?'var(--green)':'var(--red)'}}>
            {balanced ? t('acct.balanced') : t('acct.unbalanced')}
          </span>
          <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{t('acct.as_of', { date: asOf })}</span>
        </div>
      </div>
    </div>
  )
}

function BSSection({ items, color }) {
  if (!items.length) return <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'8px 0'}}>{t('common.no_data')}</div>
  return (
    <div className="card" style={{overflow:'hidden'}}>
      {items.map((item,i)=>(
        <div key={item.code} style={{display:'flex',justifyContent:'space-between',padding:'9px 14px',borderBottom:i<items.length-1?'1px solid var(--border-dim)':'none',fontSize:13,alignItems:'center'}}>
          <div>
            <span style={{color:'var(--text-primary)'}}>{accName(item.code)}</span>
            <span style={{fontSize:10,color:'var(--text-tertiary)',marginLeft:6,fontFamily:'var(--font-mono)'}}>{item.code}</span>
          </div>
          <span style={{fontFamily:'var(--font-mono)',fontWeight:500,color}}>{item.amount.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── 記錄費用 ──────────────────────────────────────────────
const EXPENSE_PRESETS = [
  { labelKey:'acct.preset_rent',      account:'5202', payAccount:'1101' },
  { labelKey:'acct.preset_utilities', account:'5203', payAccount:'1101' },
  { labelKey:'acct.preset_salary',    account:'5201', payAccount:'1101' },
  { labelKey:'acct.preset_purchase',  account:'1211', payAccount:'1101' },
  { labelKey:'acct.preset_ads',       account:'5205', payAccount:'1103' },
  { labelKey:'acct.preset_misc',      account:'5206', payAccount:'1101' },
]

function ExpenseView({ addManualEntry }) {
  const today = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({ date:today, description:'', amount:'', expenseAccount:'5202', payAccount:'1101', note:'' })
  const [saved, setSaved] = useState(false)

  function applyPreset(preset) {
    setForm(f=>({...f,expenseAccount:preset.account,payAccount:preset.payAccount,description:t(preset.labelKey)}))
  }

  function handleSave() {
    if (!form.amount || !form.description || isNaN(parseFloat(form.amount))) return
    const amount  = parseFloat(form.amount)
    const expAcc  = form.expenseAccount
    const payAcc  = form.payAccount
    const isInventory = expAcc === '1211' // 進貨記庫存，不記費用科目

    addManualEntry({
      date: form.date,
      description: form.description,
      lines: isInventory
        ? [
            { account:'1211',    debit:amount,  credit:0,      note:form.note||t('acct.note_stock_in') },
            { account:payAcc,    debit:0,        credit:amount, note:t('acct.note_payment') },
          ]
        : [
            { account:expAcc,    debit:amount,  credit:0,      note:form.note||form.description },
            { account:payAcc,    debit:0,        credit:amount, note:t('acct.note_payment') },
          ],
    })

    setSaved(true)
    setForm(f=>({...f,description:'',amount:'',note:''}))
    setTimeout(()=>setSaved(false), 2000)
  }

  const EXPENSE_ACC = Object.entries(ACCOUNTS)
    .filter(([,v])=>v.type==='expense'||v.code==='1211')
    .filter(([k])=>k!=='5301')

  return (
    <div style={{maxWidth:560,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
      <div style={ac.cardTitle}>{t('acct.expense_title')}</div>

      {/* Presets */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {EXPENSE_PRESETS.map(p=>(
          <button key={p.labelKey} className="btn btn-ghost btn-sm" onClick={()=>applyPreset(p)} style={{fontSize:12}}>
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      <div className="card" style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <FieldLabel>{t('common.date')}</FieldLabel>
            <input type="date" className="field" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
          </div>
          <div>
            <FieldLabel>{t('acct.amount_label')} *</FieldLabel>
            <input type="number" className="field" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" style={{fontFamily:'var(--font-mono)'}}/>
          </div>
        </div>

        <div>
          <FieldLabel>{t('acct.desc_label')} *</FieldLabel>
          <input className="field" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder={t('acct.desc_placeholder')}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <FieldLabel>{t('acct.expense_account')}</FieldLabel>
            <select className="field" value={form.expenseAccount} onChange={e=>setForm(f=>({...f,expenseAccount:e.target.value}))} style={{cursor:'pointer'}}>
              {Object.entries(ACCOUNTS).filter(([,v])=>v.type==='expense'||v.code==='1211').map(([k,v])=>(
                <option key={k} value={k}>{k} {accName(k)}</option>
              ))}
              <option value="1211">1211 {t('acct.inventory_purchase')}</option>
            </select>
          </div>
          <div>
            <FieldLabel>{t('acct.pay_method')}</FieldLabel>
            <select className="field" value={form.payAccount} onChange={e=>setForm(f=>({...f,payAccount:e.target.value}))} style={{cursor:'pointer'}}>
              <option value="1101">1101 {accName('1101')}</option>
              <option value="1103">1103 {accName('1103')}</option>
              <option value="2101">2101 {t('acct.payable_credit')}</option>
            </select>
          </div>
        </div>

        <div>
          <FieldLabel>{t('common.notes')}</FieldLabel>
          <input className="field" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder={`(${t('common.optional')})`}/>
        </div>

        <button className="btn btn-primary" onClick={handleSave} style={{width:'100%',padding:13}}>
          {saved ? <><Check size={16}/>{t('acct.saved')}</> : t('acct.record')}
        </button>
      </div>

      <div className="card" style={{padding:'14px 16px'}}>
        <div style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.8}}>
          <div>{t('acct.info1_a')} <strong style={{color:'var(--text-secondary)'}}>{accName('4101')}</strong> + <strong style={{color:'var(--text-secondary)'}}>{accName('5101')}</strong> + <strong style={{color:'var(--text-secondary)'}}>{accName('2111')}</strong> {t('acct.info1_b')}</div>
          <div>{t('acct.info2_a')} <strong style={{color:'var(--text-secondary)'}}>{t('acct.info2_items')}</strong> {t('acct.info2_b')}</div>
          <div>{t('acct.info3')}</div>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:5,letterSpacing:'.03em'}}>{children}</div>
}

const ac = {
  root:{ display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:14,overflow:'hidden' },
  header:{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,flexShrink:0 },
  title:{ fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600 },
  dateRange:{ display:'flex',alignItems:'center',gap:8,background:'var(--bg-overlay)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'6px 12px' },
  dateInput:{ background:'none',color:'var(--text-primary)',fontSize:12,fontFamily:'var(--font-mono)',cursor:'pointer',border:'none',outline:'none' },
  tabBar:{ display:'flex',gap:0,borderBottom:'1px solid var(--border-dim)',flexShrink:0 },
  tab:{ display:'flex',alignItems:'center',gap:7,padding:'10px 16px',fontSize:13,fontWeight:500,transition:'all 150ms',borderRadius:0,letterSpacing:'.01em' },
  content:{ flex:1,overflow:'hidden',paddingTop:16 },
  cardTitle:{ fontSize:12,fontWeight:600,color:'var(--text-secondary)',letterSpacing:'.05em',textTransform:'uppercase',marginBottom:2,display:'flex',alignItems:'center',gap:10 },
  pnlSection:{ background:'var(--bg-raised)',border:'1px solid var(--border-dim)',borderRadius:12,padding:'16px 18px' },
  pnlDivider:{ borderTop:'1px solid var(--border-mid)',margin:'6px 0' },
  typeBadge:{ fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:500,flexShrink:0 },
}
