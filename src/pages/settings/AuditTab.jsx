import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadAuditLogs } from '../../utils/dataAccess'
import { t } from '../../i18n'

const LEVEL_STYLE = {
  info:     { color:'var(--text-tertiary)',  bg:'var(--bg-active)' },
  warning:  { color:'var(--amber)',          bg:'var(--amber-dim)' },
  critical: { color:'var(--red)',            bg:'var(--red-dim)'   },
}

// ── 稽核日誌 ──────────────────────────────────────────────────
export default function AuditTab({ session }) {
  const [logs,    setLogs]    = useState([])
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')

  // DEAD-06: 原本用 security.js 的 readAuditLogs()（同步函式，Electron 模式下 isElectron 為真時
  // 直接 return []，因為 SQLite 只能非同步 IPC 讀取）——導致 Electron 稽核分頁恆空白，即使 SQLite
  // 裡確實有資料（writeAuditLog 寫入端一直是正常運作的）。改用 dataAccess.js 的 loadAuditLogs()，
  // 該函式本來就正確處理兩種模式（Electron 走 IPC、瀏覽器走 localStorage），只是這裡沒接上。
  useEffect(() => { loadAuditLogs().then(setLogs) }, [])

  const filtered = logs.filter(l=>{
    const okFilter = filter==='all' || l.level===filter
    const okSearch = !search || l.username.includes(search) || l.label.includes(search)
    return okFilter && okSearch
  })

  const counts = { warning: logs.filter(l=>l.level==='warning').length, critical:logs.filter(l=>l.level==='critical').length }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,height:'100%'}}>
      <div style={{display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('settings.search_audit_ph')} style={{flex:1,maxWidth:220,background:'var(--bg-overlay)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'7px 12px',fontSize:13,color:'var(--text-primary)'}}/>
        <div style={{display:'flex',gap:4}}>
          {[['all',t('common.all'),logs.length],['info',t('settings.level_info'),null],['warning',t('settings.level_warning'),counts.warning],['critical',t('settings.level_critical'),counts.critical]].map(([k,l,n])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:'5px 10px',borderRadius:6,fontSize:12,cursor:'pointer',background:filter===k?'var(--bg-active)':'transparent',color:filter===k?'var(--text-primary)':'var(--text-tertiary)',border:`1px solid ${filter===k?'var(--border-mid)':'transparent'}`}}>
              {l}{n!==null&&<span style={{marginLeft:4,fontFamily:'var(--font-mono)',fontSize:10}}>{n}</span>}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>loadAuditLogs().then(setLogs)}><RefreshCw size={13}/></button>
      </div>

      <div style={{flex:1,overflowY:'auto',background:'var(--bg-raised)',border:'1px solid var(--border-dim)',borderRadius:'var(--r3)',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{display:'grid',gridTemplateColumns:'140px 70px 70px 1fr 1fr',gap:8,padding:'8px 14px',background:'var(--bg-overlay)',fontSize:11,color:'var(--text-tertiary)',letterSpacing:'.05em',flexShrink:0}}>
          <span>{t('common.time')}</span><span>{t('settings.audit_user')}</span><span>{t('settings.audit_level')}</span><span>{t('settings.audit_action')}</span><span>{t('settings.audit_detail')}</span>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {filtered.length===0 ? (
            <div style={{textAlign:'center',padding:'40px',color:'var(--text-tertiary)',fontSize:13}}>{t('settings.no_matching_records')}</div>
          ) : filtered.slice(0,500).map(l=>{
            const lvl = LEVEL_STYLE[l.level] || LEVEL_STYLE.info
            return (
              <div key={l.id} style={{display:'grid',gridTemplateColumns:'140px 70px 70px 1fr 1fr',gap:8,padding:'9px 14px',borderBottom:'1px solid var(--border-dim)',fontSize:12,alignItems:'center'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>
                  {new Date(l.timestamp).toLocaleString('id-ID',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </span>
                <span style={{fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.username}</span>
                <span>
                  <span style={{padding:'1px 7px',borderRadius:20,fontSize:10,background:lvl.bg,color:lvl.color}}>{l.level}</span>
                </span>
                <span style={{color:lvl.color,fontWeight:l.level!=='info'?600:400}}>{l.label}</span>
                <span style={{color:'var(--text-tertiary)',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {Object.entries(l.detail||{}).map(([k,v])=>`${k}:${v}`).join(' · ')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
