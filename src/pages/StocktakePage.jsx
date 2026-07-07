import { useState, useRef, lazy, Suspense } from 'react'
import { Check, X, AlertTriangle, Search, ChevronDown, ChevronUp, Download, Camera } from 'lucide-react'
import { writeAuditLog } from '../utils/security'
import { stringifyCSV, downloadCSV } from '../utils/csv'
import { needsRestock } from '../utils/stock'
import { t } from '../i18n'
const BarcodeScannerModal = lazy(() => import('../components/BarcodeScannerModal'))

// '全部' 是內部 sentinel 值（category state 比較用），顯示時用 t('common.all') 翻譯
const ALL_CATEGORY = '全部'

export default function StocktakePage({ store, session }) {
  const { products, updateProduct } = store
  const [counts,    setCounts]    = useState({})   // productId -> counted qty
  const [search,    setSearch]    = useState('')
  const [category,  setCategory]  = useState(ALL_CATEGORY)
  const [stage,     setStage]     = useState('count')  // count | review | done
  const [showOnly,  setShowOnly]  = useState('all')    // all | diff | missing
  const [showCamera, setShowCamera] = useState(false)
  const [scanFeedback, setScanFeedback] = useState('')
  const inputRefs = useRef({})
  const countsRef = useRef({})   // counts 的同步鏡像（source of truth）：掃描連加時讀最新值，避免在 setState updater 內製造副作用

  function handleScannedCode(code) {
    const p = products.find(x => x.barcode === code)
    if (!p) {
      setScanFeedback(t('stocktake.scan_not_found', { code }))
      setTimeout(() => setScanFeedback(''), 2500)
      return 'keep'
    }
    // 每掃一次 +1。用 countsRef 讀最新值、setCounts 傳「新物件」而非 updater，
    // 避免在 state updater 內呼叫 setScanFeedback（updater 必須是 pure，StrictMode 會重跑兩次）
    const next = (typeof countsRef.current[p.id] === 'number' ? countsRef.current[p.id] : 0) + 1
    countsRef.current = { ...countsRef.current, [p.id]: next }
    setCounts(countsRef.current)
    setScanFeedback(t('stocktake.scan_added', { name: p.name, n: next }))
    setTimeout(() => setScanFeedback(''), 1500)
    // focus 對應的 input（方便手動修正）
    setTimeout(() => inputRefs.current[p.id]?.focus(), 50)
    return 'keep' // 連續掃描
  }

  const categories = [ALL_CATEGORY, ...new Set(products.map(p=>p.category))]

  const filtered = products.filter(p => {
    const okSearch = !search || p.name.includes(search)
    const okCat    = category === ALL_CATEGORY || p.category === category
    if (showOnly === 'diff')    return okSearch && okCat && counts[p.id] !== undefined && counts[p.id] !== p.stock
    if (showOnly === 'missing') return okSearch && okCat && counts[p.id] === undefined
    return okSearch && okCat
  })

  const counted   = Object.keys(counts).length
  const total     = products.length
  const pct       = Math.round(counted / total * 100)
  const diffs     = products.filter(p => counts[p.id] !== undefined && counts[p.id] !== p.stock)
  const shortages = diffs.filter(p => (counts[p.id] ?? p.stock) < p.stock)
  const surpluses = diffs.filter(p => (counts[p.id] ?? p.stock) > p.stock)

  function setCount(id, val) {
    const n = parseInt(val)
    countsRef.current = { ...countsRef.current, [id]: isNaN(n) ? undefined : Math.max(0, n) }
    setCounts(countsRef.current)
  }

  function handleKeyDown(e, idx) {
    if (e.key === 'Enter') {
      const nextRef = inputRefs.current[filtered[idx+1]?.id]
      if (nextRef) nextRef.focus()
    }
  }

  function applyAdjustments() {
    diffs.forEach(p => {
      updateProduct(p.id, { stock: counts[p.id] })
    })
    writeAuditLog('STOCKTAKE_DONE', session, {
      total, counted, diffs: diffs.length,
      shortages: shortages.length, surpluses: surpluses.length,
    })
    setStage('done')
  }

  function exportReport() {
    // 用共用 stringifyCSV 處理逗號/引號跳脫，避免各頁手刻 CSV 規則不一致
    const hName = t('inv.col_name')
    const hCat  = t('common.category')
    const hSys  = t('stocktake.system_stock')
    const hCnt  = t('stocktake.counted_qty')
    const hDiff = t('stocktake.diff')
    const header = [hName, hCat, hSys, hCnt, hDiff]
    const records = products.map(p => ({
      [hName]: p.name,
      [hCat]: p.category,
      [hSys]: p.stock,
      [hCnt]: counts[p.id] ?? t('stocktake.filter_missing'),
      [hDiff]: counts[p.id] !== undefined ? counts[p.id] - p.stock : '—',
    }))
    const content = `${t('stocktake.csv_date')},${new Date().toLocaleDateString('zh-TW')}\n` + stringifyCSV(records, header)
    // downloadCSV 內建 BOM + 100ms 延遲 revoke，不再手刻 Blob 儀式
    downloadCSV(`${t('stocktake.file_report')}_${new Date().toISOString().slice(0,10)}.csv`, content)
    writeAuditLog('DATA_EXPORT', session, { type: '盤點報告' })
  }

  if (stage === 'done') return (
    <div style={st.root}>
      <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16}}>
        <div style={{fontSize:48}}>✅</div>
        <div style={{fontFamily:'var(--font-serif)', fontSize:22, fontWeight:700}}>{t('stocktake.done')}</div>
        <div style={{display:'flex', gap:24, fontSize:13, color:'var(--text-secondary)'}}>
          <span>{t('stocktake.done_total_pre')} <strong style={{color:'var(--text-primary)'}}>{counted}</strong> {t('stocktake.items')}</span>
          <span>{t('stocktake.diff')} <strong style={{color: diffs.length?'var(--amber)':'var(--green)'}}>{diffs.length}</strong> {t('stocktake.items')}</span>
          <span>{t('stocktake.done_fixed_pre')} <strong style={{color:'var(--green)'}}>{diffs.length}</strong> {t('stocktake.done_fixed_post')}</span>
        </div>
        <div style={{display:'flex', gap:10}}>
          <button className="btn btn-ghost" onClick={exportReport}><Download size={14}/>{t('stocktake.export_report')}</button>
          <button className="btn btn-primary" onClick={()=>{setCounts({});setStage('count')}}>{t('stocktake.restart')}</button>
        </div>
      </div>
    </div>
  )

  if (stage === 'review') return (
    <div style={st.root}>
      <div style={st.header}>
        <div>
          <h2 style={st.title}>{t('stocktake.review_title')}</h2>
          <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
            {t('stocktake.review_sub', { n: diffs.length })}
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setStage('count')}>{t('stocktake.back_edit')}</button>
          <button className="btn btn-primary btn-sm" onClick={applyAdjustments}>
            <Check size={14}/>{t('stocktake.confirm_update', { n: diffs.length })}
          </button>
        </div>
      </div>

      {diffs.length === 0 ? (
        <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12}}>
          <div style={{fontSize:36}}>🎉</div>
          <div style={{color:'var(--green)', fontSize:16, fontWeight:600}}>{t('stocktake.all_match')}</div>
          <button className="btn btn-primary" onClick={applyAdjustments}>{t('stocktake.finish')}</button>
        </div>
      ) : (
        <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8}}>
          {shortages.length > 0 && (
            <SummaryBanner color="var(--red)" bg="var(--red-dim)" icon="📉" label={t('stocktake.short_n', { n: shortages.length })} detail={shortages.map(p=>`${p.name}（${p.stock}→${counts[p.id]}）`).join('、')}/>
          )}
          {surpluses.length > 0 && (
            <SummaryBanner color="var(--teal)" bg="var(--teal-dim)" icon="📈" label={t('stocktake.over_n', { n: surpluses.length })} detail={surpluses.map(p=>`${p.name}（${p.stock}→${counts[p.id]}）`).join('、')}/>
          )}

          <div className="card" style={{overflow:'hidden'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', gap:8, padding:'9px 14px', background:'var(--bg-overlay)', fontSize:11, color:'var(--text-tertiary)', letterSpacing:'.05em'}}>
              <span>{t('inv.product')}</span><span style={{textAlign:'right'}}>{t('stocktake.sys')}</span><span style={{textAlign:'right'}}>{t('stocktake.actual')}</span><span style={{textAlign:'right'}}>{t('stocktake.diff')}</span><span style={{textAlign:'right'}}>{t('common.status')}</span>
            </div>
            {diffs.map(p => {
              const diff = (counts[p.id]??p.stock) - p.stock
              return (
                <div key={p.id} style={{display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', gap:8, padding:'10px 14px', borderTop:'1px solid var(--border-dim)', alignItems:'center', fontSize:13}}>
                  <span style={{fontWeight:500}}>{p.name}</span>
                  <span style={{textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-secondary)'}}>{p.stock}</span>
                  <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:600}}>{counts[p.id]}</span>
                  <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:600, color:diff<0?'var(--red)':'var(--teal)'}}>
                    {diff > 0 ? '+' : ''}{diff}
                  </span>
                  <span style={{textAlign:'right', fontSize:11}}>
                    <span style={{padding:'2px 8px', borderRadius:20, background:diff<0?'var(--red-dim)':'var(--teal-dim)', color:diff<0?'var(--red)':'var(--teal)'}}>
                      {diff<0?t('stocktake.short'):t('stocktake.over')}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={st.root}>
      <div style={st.header}>
        <div>
          <h2 style={st.title}>{t('stocktake.title')}</h2>
          <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
            {new Date().toLocaleDateString('zh-TW', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <div style={{fontSize:12, color:'var(--text-secondary)'}}>
            {t('stocktake.counted_label')} <span style={{fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--text-primary)'}}>{counted}/{total}</span>
          </div>
          <div style={st.progressWrap}>
            <div style={{...st.progressBar, width:`${pct}%`}}/>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowCamera(true)}>
            <Camera size={14}/>{t('inv.scan_barcode')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setCounts({})}>{t('stocktake.clear')}</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setStage('review')}>
            {t('stocktake.review_btn')}
          </button>
        </div>
      </div>

      {scanFeedback && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background: scanFeedback.startsWith('✗') ? 'var(--red-dim)' : 'var(--green-dim)',
          color: scanFeedback.startsWith('✗') ? 'var(--red)' : 'var(--green)',
          border: `1px solid ${scanFeedback.startsWith('✗') ? 'var(--red)' : 'var(--green)'}`,
          padding:'10px 16px', borderRadius:8, fontSize:13, zIndex:600,
          boxShadow:'var(--shadow-md)',
        }}>{scanFeedback}</div>
      )}

      {showCamera && (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            title={t('stocktake.scanner_title')}
            mode="continuous"
            onScan={handleScannedCode}
            onClose={()=>setShowCamera(false)}
          />
        </Suspense>
      )}

      <div style={{display:'flex', gap:10, flexShrink:0, flexWrap:'wrap'}}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'7px 12px', minWidth:160}}>
          <Search size={13} color="var(--text-tertiary)"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('stocktake.search_ph')} style={{background:'none', flex:1, fontSize:13, color:'var(--text-primary)'}}/>
        </div>
        <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
          {categories.map(c=>(
            <button key={c} onClick={()=>setCategory(c)} style={{padding:'5px 12px', borderRadius:20, fontSize:11, cursor:'pointer', background:category===c?'var(--gold)':'var(--bg-overlay)', color:category===c?'#fff':'var(--text-secondary)', border:'none'}}>
              {c === ALL_CATEGORY ? t('common.all') : c}
            </button>
          ))}
        </div>
        <div style={{display:'flex', gap:4}}>
          {[['all',t('common.all')],['diff',t('stocktake.filter_diff')],['missing',t('stocktake.filter_missing')]].map(([k,l])=>(
            <button key={k} onClick={()=>setShowOnly(k)} style={{padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer', background:showOnly===k?'var(--bg-active)':'transparent', color:showOnly===k?'var(--text-primary)':'var(--text-tertiary)', border:`1px solid ${showOnly===k?'var(--border-mid)':'transparent'}`}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={st.table}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 80px 90px 100px', gap:8, padding:'9px 14px', background:'var(--bg-overlay)', fontSize:11, color:'var(--text-tertiary)', letterSpacing:'.05em', flexShrink:0}}>
          <span>{t('inv.col_name')}</span><span style={{textAlign:'right'}}>{t('stocktake.system_stock')}</span><span style={{textAlign:'right'}}>{t('stocktake.counted_qty')}</span><span style={{textAlign:'right'}}>{t('stocktake.diff')}</span>
        </div>
        <div style={{flex:1, overflowY:'auto'}}>
          {filtered.map((p, idx) => {
            const cnt  = counts[p.id]
            const diff = cnt !== undefined ? cnt - p.stock : null
            const hasDiff = diff !== null && diff !== 0
            return (
              <div key={p.id} className="cv-row" style={{display:'grid', gridTemplateColumns:'1fr 80px 90px 100px', gap:8, padding:'9px 14px', borderBottom:'1px solid var(--border-dim)', alignItems:'center', background:hasDiff?'rgba(229,160,48,0.03)':'transparent'}}>
                <div style={{minWidth:0}}>
                  <span style={{fontSize:13, fontWeight:500}}>{p.name}</span>
                  <span style={{fontSize:11, color:'var(--text-tertiary)', marginLeft:8}}>{p.category}</span>
                </div>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13, color:needsRestock(p)?'var(--amber)':'var(--text-secondary)'}}>{p.stock}</span>
                <div style={{display:'flex', justifyContent:'flex-end'}}>
                  <input
                    ref={el=>{ if (el) inputRefs.current[p.id]=el; else delete inputRefs.current[p.id] }}
                    type="number" min={0}
                    value={cnt ?? ''}
                    onChange={e=>setCount(p.id, e.target.value)}
                    onKeyDown={e=>handleKeyDown(e,idx)}
                    placeholder="—"
                    style={{
                      width:70, background:'var(--bg-overlay)',
                      border:`1px solid ${hasDiff?'var(--amber)':cnt!==undefined?'var(--green)':'var(--border-subtle)'}`,
                      borderRadius:6, color:'var(--text-primary)', padding:'5px 8px',
                      textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13,
                    }}
                  />
                </div>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:600, fontSize:13, color:diff===null?'var(--text-disabled)':diff<0?'var(--red)':diff>0?'var(--teal)':'var(--green)'}}>
                  {diff===null ? '—' : diff===0 ? '✓' : `${diff>0?'+':''}${diff}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SummaryBanner({ color, bg, icon, label, detail }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{background:bg, border:`1px solid ${color}22`, borderRadius:10, padding:'10px 14px'}}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:'flex', alignItems:'center', gap:8, width:'100%', background:'none', color}}>
        <span>{icon}</span><span style={{fontWeight:600, fontSize:13}}>{label}</span>
        {open?<ChevronUp size={13} style={{marginLeft:'auto'}}/>:<ChevronDown size={13} style={{marginLeft:'auto'}}/>}
      </button>
      {open && <div style={{fontSize:12, color, marginTop:6, opacity:.8}}>{detail}</div>}
    </div>
  )
}

const st = {
  root:{display:'flex', flexDirection:'column', height:'100%', padding:'16px', gap:14, overflow:'hidden'},
  header:{display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, flexWrap:'wrap', gap:10},
  title:{fontFamily:'var(--font-serif)', fontSize:20, fontWeight:600},
  progressWrap:{width:80, height:6, background:'var(--border-dim)', borderRadius:3, overflow:'hidden'},
  progressBar:{height:'100%', background:'var(--gold)', borderRadius:3, transition:'width .4s'},
  table:{flex:1, display:'flex', flexDirection:'column', background:'var(--bg-raised)', border:'1px solid var(--border-dim)', borderRadius:'var(--r3)', overflow:'hidden'},
}
