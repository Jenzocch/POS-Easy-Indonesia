import { useState } from 'react'
import { Wifi, Check, RefreshCw } from 'lucide-react'
import { getWebhookConfig, saveWebhookConfig, fireWebhook, WEBHOOK_EVENTS } from '../../utils/webhook'
import { writeAuditLog } from '../../utils/security'
import { t } from '../../i18n'
import { Section, FL } from './shared'

// ── Webhook 通知 ─────────────────────────────────────────────
export default function WebhookTab({ session }) {
  const initial = getWebhookConfig()
  const [url, setUrl] = useState(initial.url || '')
  const [events, setEvents] = useState(new Set(initial.events || []))
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  function showMsg(m, ms=3000) { setMsg(m); setTimeout(()=>setMsg(''), ms) }

  function handleSave() {
    saveWebhookConfig({ url: url.trim(), events: Array.from(events) })
    writeAuditLog('WEBHOOK_CONFIG_SAVE', session, { hasUrl: !!url, eventCount: events.size })
    showMsg('✓ ' + t('settings.saved_settings'))
  }

  function toggleEvent(key) {
    setEvents(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleTest() {
    if (!url) { showMsg('✗ ' + t('settings.fill_url_first')); return }
    setTesting(true)
    // 先暫存 + 用 checkout 事件測試
    saveWebhookConfig({ url: url.trim(), events: ['checkout'] })
    const ok = await fireWebhook('checkout', {
      _title: '🧪 ' + t('settings.test_message'),
      _description: t('settings.test_message_desc'),
      _fields: [{ name: t('common.time'), value: new Date().toLocaleString('id-ID') }],
    })
    // 還原設定
    saveWebhookConfig({ url: url.trim(), events: Array.from(events) })
    setTesting(false)
    showMsg(ok ? '✓ ' + t('settings.test_sent') : '✗ ' + t('settings.test_send_failed'), 5000)
  }

  return (
    <div style={{padding:'0 4px', overflowY:'auto', height:'100%', display:'flex', flexDirection:'column', gap:18}}>
      <div className="card" style={{padding:'14px 16px', background:'var(--bg-overlay)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <Wifi size={18} style={{color:'var(--blue)'}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:600, fontSize:14}}>{t('settings.tab_webhook')}</div>
            <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:2}}>
              {t('settings.webhook_desc')}
            </div>
          </div>
        </div>
      </div>

      <Section title={t('settings.connection_settings')}>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div>
            <FL>Webhook URL</FL>
            <input className="field" value={url} onChange={e=>setUrl(e.target.value)}
              placeholder={t('settings.webhook_url_ph')}
              style={{fontFamily:'var(--font-mono)', fontSize:12}}/>
            <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:4, lineHeight:1.5}}>
              · {t('settings.wh_for_discord')}<strong>{t('settings.wh_help_discord')}</strong><br/>
              · {t('settings.wh_for_slack')}<strong>{t('settings.wh_help_slack')}</strong><br/>
              · {t('settings.wh_backend_label')}{t('settings.wh_backend_desc')}<br/>
              · Zapier / Make：{t('settings.wh_zapier_desc')}
            </div>
          </div>
        </div>
      </Section>

      <Section title={t('settings.trigger_events')}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:8}}>
          {WEBHOOK_EVENTS.map(ev => {
            const on = events.has(ev.key)
            return (
              <label key={ev.key} style={{
                display:'flex', alignItems:'flex-start', gap:10,
                padding:'12px 14px', borderRadius:8, cursor:'pointer',
                background: on ? 'var(--green-dim)' : 'var(--bg-overlay)',
                border: `1px solid ${on ? 'var(--green)' : 'var(--border-dim)'}`,
              }}>
                <input type="checkbox" checked={on} onChange={()=>toggleEvent(ev.key)} style={{marginTop:2, accentColor:'var(--green)', cursor:'pointer'}}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600, color: on ? 'var(--text-primary)' : 'var(--text-secondary)'}}>
                    {ev.label}
                  </div>
                  <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>
                    {ev.desc}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </Section>

      <div style={{display:'flex', gap:8, flexShrink:0, flexWrap:'wrap'}}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!url}>
          <Check size={14}/>{t('settings.save_settings')}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={!url || testing}>
          {testing ? <RefreshCw size={14} className="spin"/> : <Wifi size={14}/>}{t('settings.test_send')}
        </button>
      </div>

      {msg && (
        <div style={{
          padding:'10px 14px', borderRadius:8, fontSize:13,
          background: msg.startsWith('✗') ? 'var(--red-dim)' : 'var(--green-dim)',
          color: msg.startsWith('✗') ? 'var(--red)' : 'var(--green)',
          border: `1px solid ${msg.startsWith('✗') ? 'var(--red)' : 'var(--green)'}`,
        }}>{msg}</div>
      )}
    </div>
  )
}
