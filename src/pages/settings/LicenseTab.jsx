import { useState, useEffect } from 'react'
import { isElectron, getSetting } from '../../utils/dataAccess'
import { t } from '../../i18n'
import { Section } from './shared'

// ===== 授權金鑰（License）=====
const LICENSE_REASON_KEY = {
  invalid_signature: 'settings.license_reason_invalid_signature',
  expired: 'settings.license_reason_expired',
  malformed: 'settings.license_reason_malformed',
  unknown_tier: 'settings.license_reason_unknown_tier',
  absent: 'settings.license_reason_absent',
}

export default function LicenseTab() {
  const isE = isElectron
  const [status, setStatus] = useState(null)          // 每次重新驗證的結果 { valid, tier, to, expires, reason }
  const [currentTier, setCurrentTier] = useState('free')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const [activating, setActivating] = useState(false)

  async function refresh() {
    if (!isE) return
    const [s, tier] = await Promise.all([
      window.electronAPI.license.getStatus(),
      getSetting('subscriptionTier'),
    ])
    setStatus(s)
    setCurrentTier(tier || 'free')
  }

  useEffect(() => { refresh() }, [])

  async function handleActivate() {
    if (!isE || !code.trim() || activating) return
    setActivating(true)
    setMsg('')
    const result = await window.electronAPI.license.activate(code.trim())
    setActivating(false)
    if (result.valid) {
      setCode('')
      setMsgOk(true)
      setMsg(t('settings.license_activated'))
      await refresh()
    } else {
      setMsgOk(false)
      const reasonKey = LICENSE_REASON_KEY[result.reason] || 'settings.license_reason_malformed'
      setMsg(`${t('settings.license_activation_failed')}: ${t(reasonKey)}`)
    }
    setTimeout(() => setMsg(''), 5000)
  }

  if (!isE) return (
    <div style={{padding:20, textAlign:'center', color:'var(--text-dim)'}}>
      {t('settings.hardware_desktop_only')}
    </div>
  )

  return (
    <div style={{padding:'0 24px', overflowY:'auto', height:'100%'}}>
      <Section title={t('settings.license_current_status')}>
        <div style={{fontSize:13, color:'var(--text-secondary)', lineHeight:2}}>
          <div>
            {t('settings.license_current_tier')}：
            <strong style={{color:'var(--gold)'}}>{t(`settings.tier_${currentTier}`) || currentTier}</strong>
          </div>
          {status?.valid && (
            <>
              <div>{t('settings.license_licensed_to')}：<strong>{status.to}</strong></div>
              <div>
                {t('settings.license_expires')}：
                {status.expires ? status.expires : t('settings.license_never_expires')}
              </div>
            </>
          )}
        </div>
      </Section>

      <Section title={t('settings.license_activate_section')}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <input
            className="field"
            value={code}
            onChange={e=>setCode(e.target.value)}
            placeholder={t('settings.license_code_ph')}
            style={{flex:1, fontFamily:'var(--font-mono)', fontSize:12}}
          />
          <button className="btn btn-primary btn-sm" onClick={handleActivate} disabled={activating || !code.trim()}>
            {activating ? t('settings.license_activating') : t('settings.license_activate_btn')}
          </button>
        </div>
        {msg && (
          <p style={{fontSize:12, marginTop:8, color: msgOk ? 'var(--green)' : 'var(--red)'}}>{msg}</p>
        )}
      </Section>
    </div>
  )
}
