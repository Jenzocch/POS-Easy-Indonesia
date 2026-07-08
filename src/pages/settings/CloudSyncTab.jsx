import { useState } from 'react'
import { Cloud, Check, RefreshCw, Wifi, X, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { getCloudConfig, saveCloudConfig, clearCloudConfig, testConnection, isCloudEnabled } from '../../utils/supabaseClient'
import { pushAll, pullAll, SYNC_TABLES } from '../../utils/cloudSync'
import { writeAuditLog } from '../../utils/security'
import { friendlyError } from '../../utils/friendlyError'
import { t } from '../../i18n'
import { Section, FL } from './shared'
import Modal from '../../components/Modal'
import { Z } from '../../utils/zIndex'

// ── 雲端同步 ──────────────────────────────────────────────────
export default function CloudSyncTab({ session }) {
  const initial = getCloudConfig() || { url: '', anonKey: '' }
  const [url, setUrl] = useState(initial.url || '')
  const [anonKey, setAnonKey] = useState(initial.anonKey || '')
  const [enabled, setEnabled] = useState(isCloudEnabled())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [busy, setBusy] = useState(null) // 'push' | 'pull' | null
  const [progress, setProgress] = useState([])
  const [confirmPull, setConfirmPull] = useState(false)
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('pos_last_sync') || '')
  const [msg, setMsg] = useState('')

  function showMsg(m, ms = 2500) {
    setMsg(m)
    setTimeout(() => setMsg(''), ms)
  }

  function handleSave() {
    saveCloudConfig({ url, anonKey })
    setEnabled(isCloudEnabled())
    setTestResult(null)
    writeAuditLog('CLOUD_CONFIG_SAVE', session, { hasConfig: !!(url && anonKey) })
    showMsg('✓ ' + t('settings.saved_settings'))
  }

  function handleClear() {
    if (!confirm(t('settings.confirm_clear_cloud'))) return
    clearCloudConfig()
    setUrl('')
    setAnonKey('')
    setEnabled(false)
    setTestResult(null)
    showMsg(t('settings.cleared'))
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const r = await testConnection()
    setTesting(false)
    setTestResult(r)
  }

  async function handlePush() {
    setBusy('push')
    setProgress([])
    try {
      const report = await pushAll(({ table, status }) => {
        setProgress(prev => [...prev, { table, status }])
      })
      const total = report.reduce((s, r) => s + (r.count || 0), 0)
      localStorage.setItem('pos_last_sync', new Date().toISOString())
      setLastSync(new Date().toISOString())
      writeAuditLog('CLOUD_PUSH', session, { total, tables: report.length })
      showMsg('✓ ' + t('settings.push_done', { total, tables: report.length }), 5000)
    } catch (e) {
      // 給店員看得懂的訊息 + 下一步；原始例外仍寫入稽核日誌供除錯
      showMsg('✗ ' + t('settings.push_failed', { error: friendlyError(e, 'cloud') }), 8000)
      writeAuditLog('CLOUD_PUSH_FAIL', session, { error: e.message })
    }
    setBusy(null)
  }

  async function handlePull() {
    setConfirmPull(false)
    setBusy('pull')
    setProgress([])
    try {
      const report = await pullAll(({ table, status }) => {
        setProgress(prev => [...prev, { table, status }])
      })
      const total = report.reduce((s, r) => s + (r.count || 0), 0)
      localStorage.setItem('pos_last_sync', new Date().toISOString())
      setLastSync(new Date().toISOString())
      writeAuditLog('CLOUD_PULL', session, { total, tables: report.length })
      showMsg('✓ ' + t('settings.pull_done', { total }), 3000)
      setTimeout(() => location.reload(), 1500)
    } catch (e) {
      showMsg('✗ ' + t('settings.pull_failed', { error: friendlyError(e, 'cloud') }), 8000)
      writeAuditLog('CLOUD_PULL_FAIL', session, { error: e.message })
    }
    setBusy(null)
  }

  return (
    <div style={{padding:'0 4px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column', gap:18}}>
      <div className="card" style={{padding:'14px 16px', background: enabled ? 'var(--green-dim)' : 'var(--bg-overlay)', borderLeft: `3px solid ${enabled ? 'var(--green)' : 'var(--text-tertiary)'}`}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <Cloud size={18} style={{color: enabled ? 'var(--green)' : 'var(--text-tertiary)'}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:600, fontSize:14}}>
              {enabled ? t('settings.cloud_configured') : t('settings.cloud_not_configured')}
            </div>
            <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:2}}>
              {enabled
                ? t('settings.last_sync', { time: lastSync ? new Date(lastSync).toLocaleString('id-ID') : t('settings.never_synced') })
                : t('settings.cloud_setup_hint')}
            </div>
          </div>
        </div>
      </div>

      {/* 設定區 */}
      <div>
        <Section title={t('settings.supabase_conn')}>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <div>
              <FL>Project URL</FL>
              <input className="field" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" style={{fontFamily:'var(--font-mono)', fontSize:12}}/>
            </div>
            <div>
              <FL>anon / public key</FL>
              <input type="password" className="field" value={anonKey} onChange={e=>setAnonKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." style={{fontFamily:'var(--font-mono)', fontSize:12}}/>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:4}}>
                {t('settings.supabase_hint')}
              </div>
            </div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!url || !anonKey}>
                <Check size={14}/>{t('settings.save_settings')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={!enabled || testing}>
                {testing ? <RefreshCw size={14} className="spin"/> : <Wifi size={14}/>}{t('settings.test_connection')}
              </button>
              {enabled && (
                <button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={handleClear}>
                  <X size={14}/>{t('settings.clear_settings')}
                </button>
              )}
            </div>
            {testResult && (
              <div style={{
                fontSize:12, padding:'8px 12px', borderRadius:8,
                background: testResult.ok ? 'var(--green-dim)' : 'var(--red-dim)',
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
              }}>
                {testResult.ok ? '✓ ' + t('settings.conn_ok') : '✗ ' + t('settings.conn_failed', { error: testResult.error })}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* 同步操作 */}
      {enabled && (
        <div>
          <Section title={t('settings.sync_ops')}>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12}}>
              <button
                className="card"
                style={{padding:'16px', textAlign:'left', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, border:'1px solid var(--blue)'}}
                onClick={handlePush}
                disabled={!!busy}
              >
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                  <ArrowUp size={18} style={{color:'var(--blue)'}}/>
                  <span style={{fontWeight:600, fontSize:14}}>{t('settings.push_to_cloud')}</span>
                </div>
                <div style={{fontSize:12, color:'var(--text-secondary)', lineHeight:1.5}}>
                  {t('settings.push_desc_1')}<br/>
                  <span style={{color:'var(--text-tertiary)'}}>{t('settings.push_desc_2')}</span>
                </div>
              </button>

              <button
                className="card"
                style={{padding:'16px', textAlign:'left', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1, border:'1px solid var(--amber)'}}
                onClick={() => setConfirmPull(true)}
                disabled={!!busy}
              >
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                  <ArrowDown size={18} style={{color:'var(--amber)'}}/>
                  <span style={{fontWeight:600, fontSize:14}}>{t('settings.pull_from_cloud')}</span>
                </div>
                <div style={{fontSize:12, color:'var(--text-secondary)', lineHeight:1.5}}>
                  {t('settings.pull_desc_pre')}<strong style={{color:'var(--amber)'}}>{t('settings.pull_desc_strong')}</strong><br/>
                  <span style={{color:'var(--text-tertiary)'}}>{t('settings.pull_desc_2')}</span>
                </div>
              </button>
            </div>

            {progress.length > 0 && (
              <div style={{marginTop:14, padding:'12px 14px', background:'var(--bg-overlay)', borderRadius:8, maxHeight:200, overflowY:'auto'}}>
                <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:6, letterSpacing:'.05em'}}>
                  {busy === 'push' ? t('settings.push_progress') : busy === 'pull' ? t('settings.pull_progress') : t('settings.done')}
                </div>
                {progress.map((p, i) => (
                  <div key={i} style={{fontSize:12, color:'var(--text-secondary)', padding:'3px 0', fontFamily:'var(--font-mono)'}}>
                    {p.status === 'pushing' ? '↑ ' : '↓ '}{p.table}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {msg && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          padding:'10px 18px', borderRadius:'var(--r3)',
          background: msg.startsWith('✗') ? 'var(--red-dim)' : 'var(--green-dim)',
          color: msg.startsWith('✗') ? 'var(--red)' : 'var(--green)',
          border: `1px solid ${msg.startsWith('✗') ? 'var(--red)' : 'var(--green)'}`,
          fontSize:13, zIndex:Z.TOAST, boxShadow:'var(--shadow-md)',
        }}>{msg}</div>
      )}

      {confirmPull && (
        <Modal maxWidth={400}>
            <div style={{textAlign:'center', padding:'8px 0 18px'}}>
              <AlertTriangle size={36} style={{color:'var(--amber)', marginBottom:12}}/>
              <div style={{fontWeight:700, fontSize:15, marginBottom:8}}>{t('settings.confirm_pull_title')}</div>
              <div style={{fontSize:13, color:'var(--text-secondary)', lineHeight:1.6}}>
                {t('settings.pull_warn_pre')}<strong style={{color:'var(--red)'}}>{t('settings.pull_warn_strong')}</strong>{t('settings.pull_warn_post')}<br/>
                {t('settings.pull_warn_2')}
              </div>
            </div>
            <div style={{display:'flex', gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={handlePull}>{t('settings.confirm_pull_btn')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setConfirmPull(false)}>{t('common.cancel')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}
