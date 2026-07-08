import { useState, useEffect } from 'react'
import { Shield, Users, Database, FileText, Printer, Wifi, Sun, Moon, Settings as Cog, Gift, Cloud, KeyRound, Volume2 } from 'lucide-react'
import { ROLES } from '../utils/security'
import { getSetting, setSetting } from '../utils/dataAccess'
import { getTheme, applyTheme } from '../utils/theme'
import { setSoundEnabledCache } from '../utils/sound'
import { t, fmtMoney, LanguageSwitcher } from '../i18n'
import { Section, ss } from './settings/shared'
import UsersTab from './settings/UsersTab'
import HardwareTab from './settings/HardwareTab'
import SecurityTab from './settings/SecurityTab'
import BackupTab from './settings/BackupTab'
import CloudSyncTab from './settings/CloudSyncTab'
import WebhookTab from './settings/WebhookTab'
import AuditTab from './settings/AuditTab'
import LicenseTab from './settings/LicenseTab'

const TABS = [
  { key:'general',  label:t('settings.tab_general'),  Icon:Cog      },
  { key:'business', label:t('settings.tab_business'), Icon:Gift     },
  { key:'users',    label:t('settings.tab_users'),    Icon:Users    },
  { key:'hardware', label:t('settings.tab_hardware'), Icon:Printer  },
  { key:'security', label:t('settings.tab_security'), Icon:Shield   },
  { key:'backup',   label:t('settings.tab_backup'),   Icon:Database },
  { key:'cloud',    label:t('settings.tab_cloud'),    Icon:Cloud    },
  { key:'webhook',  label:t('settings.tab_webhook'),  Icon:Wifi     },
  { key:'audit',    label:t('settings.tab_audit'),    Icon:FileText },
  { key:'license',  label:t('settings.tab_license'),  Icon:KeyRound },
]

export default function SettingsPage({ session, onLogout, store }) {
  const [tab, setTab] = useState('general')

  return (
    <div style={ss.root}>
      <div style={ss.header}>
        <div>
          <h2 style={ss.title}>{t('settings.title')}</h2>
          <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>
            {t('settings.logged_in_as')}<span style={{color:ROLES[session.role]?.color}}>{session.username}</span>
            <span style={{color:'var(--text-tertiary)'}}> · {t(`settings.role_${session.role}`)}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={onLogout}>{t('settings.logout')}</button>
      </div>

      <div style={ss.tabBar}>
        {TABS.map(({key,label,Icon})=>(
          <button key={key} onClick={()=>setTab(key)} style={{
            ...ss.tab,
            background: tab===key?'var(--bg-active)':'transparent',
            color: tab===key?'var(--text-primary)':'var(--text-tertiary)',
            borderBottom:`2px solid ${tab===key?'var(--gold)':'transparent'}`,
          }}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      <div style={{flex:1, overflow:'hidden', paddingTop:16}}>
        {tab==='general'  && <GeneralTab  session={session}/>}
        {tab==='business' && <BusinessTab session={session} store={store}/>}
        {tab==='users'    && <UsersTab    session={session}/>}
        {tab==='hardware' && <HardwareTab session={session}/>}
        {tab==='security' && <SecurityTab session={session}/>}
        {tab==='backup'   && <BackupTab   session={session}/>}
        {tab==='cloud'    && <CloudSyncTab session={session}/>}
        {tab==='webhook'  && <WebhookTab  session={session}/>}
        {tab==='audit'    && <AuditTab    session={session}/>}
        {tab==='license'  && <LicenseTab  session={session}/>}
      </div>
    </div>
  )
}

// ── 員工帳號管理 ──────────────────────────────────────────────
// ===== 一般偏好（主題、銷售目標）=====
function GeneralTab({ session }) {
  const [theme, setTheme] = useState(getTheme())
  const [salesGoal, setSalesGoal] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [soundEnabled, setSoundEnabledState] = useState(true)

  useEffect(() => {
    getSetting('dailySalesGoal').then(v => setSalesGoal(v || ''))
    getSetting('soundEnabled').then(v => setSoundEnabledState(v === null || v === undefined ? true : v !== 'false'))
  }, [])

  function changeTheme(t) {
    setTheme(t)
    applyTheme(t)
  }

  async function saveGoal() {
    await setSetting('dailySalesGoal', salesGoal || '0')
    setSavedMsg(t('settings.saved'))
    setTimeout(() => setSavedMsg(''), 2000)
  }

  async function toggleSound(enabled) {
    setSoundEnabledState(enabled)
    setSoundEnabledCache(enabled) // 立即更新音效模組的記憶體快取，不用等下次載入
    await setSetting('soundEnabled', String(enabled))
  }

  return (
    <div style={{padding:'0 24px', overflowY:'auto', height:'100%'}}>
      <Section title={t('settings.language')}>
        <LanguageSwitcher />
      </Section>

      <Section title={t('settings.appearance')}>
        <div style={{display:'flex', gap:12}}>
          <button onClick={()=>changeTheme('light')} style={{
            flex:1, padding:'14px 16px', borderRadius:10, display:'flex', alignItems:'center', gap:10,
            border:`2px solid ${theme==='light' ? 'var(--gold)' : 'var(--border-subtle)'}`,
            background: theme==='light' ? 'var(--gold-dim)' : 'var(--bg-raised)',
            cursor:'pointer',
          }}>
            <Sun size={18} color="var(--amber)"/>
            <div style={{textAlign:'left'}}>
              <div style={{fontWeight:600, fontSize:14}}>{t('settings.theme_light')}</div>
              <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('settings.theme_light_desc')}</div>
            </div>
          </button>
          <button onClick={()=>changeTheme('dark')} style={{
            flex:1, padding:'14px 16px', borderRadius:10, display:'flex', alignItems:'center', gap:10,
            border:`2px solid ${theme==='dark' ? 'var(--gold)' : 'var(--border-subtle)'}`,
            background: theme==='dark' ? 'var(--gold-dim)' : 'var(--bg-raised)',
            cursor:'pointer',
          }}>
            <Moon size={18} color="var(--blue)"/>
            <div style={{textAlign:'left'}}>
              <div style={{fontWeight:600, fontSize:14}}>{t('settings.theme_dark')}</div>
              <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('settings.theme_dark_desc')}</div>
            </div>
          </button>
        </div>
      </Section>

      <Section title={t('settings.sound_feedback')}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px', background:'var(--bg-overlay)', borderRadius:8}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <Volume2 size={16} color="var(--text-secondary)"/>
            <div>
              <div style={{fontSize:13, fontWeight:600}}>{t('settings.sound_feedback')}</div>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>{t('settings.sound_feedback_desc')}</div>
            </div>
          </div>
          <label style={{position:'relative', display:'inline-block', width:38, height:22, flexShrink:0}}>
            <input type="checkbox" checked={soundEnabled} style={{opacity:0, width:0, height:0}}
              onChange={(e) => toggleSound(e.target.checked)}/>
            <span style={{
              position:'absolute', inset:0, borderRadius:11, transition:'.15s',
              background: soundEnabled ? 'var(--green)' : 'var(--border-dim)',
            }}/>
            <span style={{
              position:'absolute', top:2, left: soundEnabled ? 18 : 2, width:18, height:18,
              borderRadius:'50%', background:'#fff', transition:'.15s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
            }}/>
          </label>
        </div>
      </Section>

      <Section title={t('settings.daily_sales_goal')}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{fontSize:13, color:'var(--text-secondary)', minWidth:60}}>{t('settings.goal_amount')}</span>
          <input className="field" type="number" inputMode="numeric" value={salesGoal} onChange={e=>setSalesGoal(e.target.value)} placeholder={t('settings.eg_amount')} style={{flex:1, maxWidth:200}}/>
          <span style={{fontSize:13, color:'var(--text-tertiary)'}}>Rp</span>
          <button className="btn btn-primary btn-sm" onClick={saveGoal}>{t('common.save')}</button>
          {savedMsg && <span style={{fontSize:12, color:'var(--green)'}}>{savedMsg}</span>}
        </div>
        <p style={{fontSize:12, color:'var(--text-tertiary)', marginTop:8}}>
          {t('settings.goal_hint')}
        </p>
      </Section>

      <Section title={t('settings.shortcuts')}>
        <div style={{fontSize:13, color:'var(--text-secondary)', lineHeight:2}}>
          <div><kbd style={kbdStyle}>F1</kbd> {t('settings.shortcut_price_check')}</div>
          <div><kbd style={kbdStyle}>F2</kbd> {t('settings.shortcut_hold')}</div>
          <div><kbd style={kbdStyle}>F3</kbd> {t('settings.shortcut_recall')}</div>
          <div><kbd style={kbdStyle}>Esc</kbd> {t('settings.shortcut_close_dialog')}</div>
        </div>
      </Section>
    </div>
  )
}

// ===== 營運設定（點數規則、生日贈點）=====
function BusinessTab({ session, store }) {
  const [earn, setEarn] = useState(10)
  const [redeem, setRedeem] = useState(1)
  const [birthdayBonus, setBirthdayBonus] = useState(100)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    getSetting('pointsEarnRate').then(v => setEarn(parseInt(v) || 10))
    getSetting('pointsRedeemRate').then(v => setRedeem(parseFloat(v) || 1))
    getSetting('birthdayBonus').then(v => setBirthdayBonus(parseInt(v) || 100))
  }, [])

  async function save() {
    if (store?.updatePointsRule) {
      await store.updatePointsRule(parseInt(earn) || 10, parseFloat(redeem) || 1)
    } else {
      await setSetting('pointsEarnRate', String(earn))
      await setSetting('pointsRedeemRate', String(redeem))
    }
    if (store?.updateBirthdayBonus) {
      await store.updateBirthdayBonus(birthdayBonus)
    } else {
      await setSetting('birthdayBonus', String(birthdayBonus))
    }
    setSavedMsg(t('settings.saved'))
    setTimeout(() => setSavedMsg(''), 2000)
  }

  return (
    <div style={{padding:'0 24px', overflowY:'auto', height:'100%'}}>
      <Section title={t('settings.points_rule')}>
        <div style={{padding:'16px 18px', background:'var(--gold-glow)', border:'1px solid var(--gold-dim)', borderRadius:8, marginBottom:14}}>
          <div style={{fontSize:13, fontWeight:600, marginBottom:10, color:'var(--gold-bright)'}}>
            <Gift size={14} style={{verticalAlign:'middle', marginRight:6}}/>
            {t('settings.current_rule')}
          </div>
          <div style={{fontSize:13, color:'var(--text-secondary)', lineHeight:1.8}}>
            <div>• {t('settings.points_rule_earn_pre')} <strong style={{color:'var(--gold)'}}>{fmtMoney(Number(earn) || 0)}</strong> {t('settings.points_rule_earn_post')}</div>
            <div>• {t('settings.points_rule_redeem_pre')} <strong style={{color:'var(--gold)'}}>{fmtMoney(Number(redeem) || 0)}</strong></div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          <div>
            <FieldLabel>{t('settings.field_earn_rate')}</FieldLabel>
            <input className="field" type="number" inputMode="numeric" value={earn} onChange={e=>setEarn(e.target.value)}/>
          </div>
          <div>
            <FieldLabel>{t('settings.field_redeem_value')}</FieldLabel>
            <input className="field" type="number" inputMode="decimal" step="0.5" value={redeem} onChange={e=>setRedeem(e.target.value)}/>
          </div>
        </div>
      </Section>

      <Section title={t('settings.birthday_bonus')}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{fontSize:13, color:'var(--text-secondary)', minWidth:140}}>{t('settings.birthday_bonus_label')}</span>
          <input className="field" type="number" inputMode="numeric" value={birthdayBonus} onChange={e=>setBirthdayBonus(e.target.value)} style={{width:120}}/>
          <span style={{fontSize:13, color:'var(--text-tertiary)'}}>{t('settings.points_unit')}</span>
        </div>
        <p style={{fontSize:12, color:'var(--text-tertiary)', marginTop:8}}>
          {t('settings.birthday_bonus_hint')}
        </p>
      </Section>

      <button className="btn btn-primary" onClick={save} style={{padding:'10px 24px'}}>
        {t('settings.save_settings')}
      </button>
      {savedMsg && <span style={{marginLeft:12, fontSize:13, color:'var(--green)'}}>{savedMsg}</span>}
    </div>
  )
}

const kbdStyle = {
  fontFamily:'var(--font-mono)', fontSize:11, padding:'2px 8px',
  background:'var(--bg-overlay)', borderRadius:4, color:'var(--text-secondary)',
  border:'1px solid var(--border-dim)', marginRight:8,
}

function FieldLabel({ children }) {
  return <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em'}}>{children}</div>
}
