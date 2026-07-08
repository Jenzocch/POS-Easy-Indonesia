import { useState, useEffect, useRef } from 'react'
import { Shield, Users, Database, FileText, Download, Upload, Trash2, Plus, X, Check, RefreshCw, Printer, Wifi, Sun, Moon, Settings as Cog, Gift, Cloud, ArrowUp, ArrowDown, AlertTriangle, KeyRound } from 'lucide-react'
import QRCode from 'qrcode'
import {
  ROLES, hashPassword, verifyPassword, writeAuditLog,
  createBackup, getBackupList, restoreBackup, exportBackupFile, importBackupFile,
  maskPhone, maskName,
} from '../utils/security'
import {
  isElectron, loadUsers, saveUsers as dbSaveUsers, getSetting, setSetting, loadAuditLogs,
  loadBackups, restoreBackup as dbRestoreBackup, exportData as dbExportData, importData as dbImportData,
} from '../utils/dataAccess'
import { downloadBlob } from '../utils/csv'
import { getTheme, applyTheme } from '../utils/theme'
import { getCloudConfig, saveCloudConfig, clearCloudConfig, testConnection, isCloudEnabled } from '../utils/supabaseClient'
import { pushAll, pullAll, SYNC_TABLES } from '../utils/cloudSync'
import { getWebhookConfig, saveWebhookConfig, fireWebhook, WEBHOOK_EVENTS } from '../utils/webhook'
import { t, fmtMoney, formatDateTime, LanguageSwitcher } from '../i18n'

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

const LEVEL_STYLE = {
  info:     { color:'var(--text-tertiary)',  bg:'var(--bg-active)' },
  warning:  { color:'var(--amber)',          bg:'var(--amber-dim)' },
  critical: { color:'var(--red)',            bg:'var(--red-dim)'   },
}

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

  useEffect(() => {
    getSetting('dailySalesGoal').then(v => setSalesGoal(v || ''))
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

// ===== 授權金鑰（License）=====
const LICENSE_REASON_KEY = {
  invalid_signature: 'settings.license_reason_invalid_signature',
  expired: 'settings.license_reason_expired',
  malformed: 'settings.license_reason_malformed',
  unknown_tier: 'settings.license_reason_unknown_tier',
  absent: 'settings.license_reason_absent',
}

function LicenseTab() {
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

const kbdStyle = {
  fontFamily:'var(--font-mono)', fontSize:11, padding:'2px 8px',
  background:'var(--bg-overlay)', borderRadius:4, color:'var(--text-secondary)',
  border:'1px solid var(--border-dim)', marginRight:8,
}

function Section({ title, children }) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:13, fontWeight:600, marginBottom:10, color:'var(--text-primary)'}}>{title}</div>
      {children}
    </div>
  )
}

function FieldLabel({ children }) {
  return <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em'}}>{children}</div>
}

function UsersTab({ session }) {
  const [users,    setUsers]    = useState([])
  const [adding,   setAdding]   = useState(false)
  const [changePw, setChangePw] = useState(null)   // target user object
  const [addForm,  setAddForm]  = useState({ username:'', password:'', role:'staff' })
  const [pwForm,   setPwForm]   = useState({ oldPw:'', newPw:'', confirmPw:'' })
  const [saving,   setSaving]   = useState(false)
  const [addErr,   setAddErr]   = useState('')
  const [pwErr,    setPwErr]    = useState('')
  const [pwOk,     setPwOk]     = useState('')

  useEffect(()=>{
    if (isElectron) {
      loadUsers([]).then(setUsers)
    } else {
      try { setUsers(JSON.parse(localStorage.getItem('pos_users')||'[]')) } catch {}
    }
  },[])

  function saveUsers(u) {
    setUsers(u)
    if (!isElectron) localStorage.setItem('pos_users', JSON.stringify(u))
  }

  // ── 新增帳號 ─────────────────────────────────────────────
  async function handleAdd() {
    if (!addForm.username || !addForm.password) return
    if (addForm.password.length < 8) { setAddErr(t('settings.pw_min8')); return }
    if (users.find(u=>u.username===addForm.username)) { setAddErr(t('settings.username_exists')); return }
    setAddErr(''); setSaving(true)
    const hashed  = await hashPassword(addForm.password)
    const newUser = { id:'u'+Date.now(), username:addForm.username, password:hashed, role:addForm.role }
    saveUsers([...users, newUser])
    writeAuditLog('USER_CREATE', session, { username:addForm.username, role:addForm.role })
    // Electron: 同步到 SQLite
    if (isElectron) {
      window.electronAPI.db.addUser({ id: newUser.id, username: newUser.username, password: newUser.password, role: newUser.role }).catch(() => {})
    }
    setAdding(false); setAddForm({username:'',password:'',role:'staff'}); setSaving(false)
  }

  // ── 刪除帳號 ─────────────────────────────────────────────
  function handleDelete(u) {
    if (u.id === session.userId) return
    saveUsers(users.filter(x=>x.id!==u.id))
    // DEAD-06: 原本只更新 React state（saveUsers 在 Electron 模式下的 else 分支是 no-op，
    // 只有瀏覽器模式才寫 localStorage），從未呼叫 SQLite 端的 deleteUser，導致「刪帳號重啟復活」——
    // 補上與 handleAdd/handleChangePw 一致的 Electron 同步呼叫。
    if (isElectron) {
      window.electronAPI.db.deleteUser(u.id).catch(() => {})
    }
    writeAuditLog('USER_DELETE', session, { username:u.username })
  }

  // ── 變更密碼 ─────────────────────────────────────────────
  async function handleChangePw() {
    const target  = users.find(u=>u.id===changePw.id)
    const isSelf  = changePw.id === session.userId
    const isOwner = session.role === 'owner'
    setPwErr(''); setPwOk(''); setSaving(true)

    // 自己改：需驗舊密碼
    if (isSelf) {
      const ok = await verifyPassword(pwForm.oldPw, target.password)
      if (!ok) { setPwErr(t('settings.old_pw_wrong')); setSaving(false); return }
    }

    if (pwForm.newPw.length < 8) { setPwErr(t('settings.new_pw_min8')); setSaving(false); return }
    if (pwForm.newPw !== pwForm.confirmPw) { setPwErr(t('settings.pw_mismatch')); setSaving(false); return }
    if (isSelf && pwForm.newPw === pwForm.oldPw) { setPwErr(t('settings.pw_same_as_old')); setSaving(false); return }

    const hashed = await hashPassword(pwForm.newPw)
    saveUsers(users.map(u => u.id===changePw.id ? {...u, password:hashed} : u))
    if (isElectron) {
      window.electronAPI.db.updateUser(changePw.id, { password: hashed }).catch(() => {})
    }
    writeAuditLog('USER_UPDATE', session, { action:'change_password', target:changePw.username, by:session.username })
    setSaving(false); setPwOk(t('settings.pw_updated')); setPwForm({oldPw:'',newPw:'',confirmPw:''})
    setTimeout(()=>{ setChangePw(null); setPwOk('') }, 1200)
  }

  const isOwner = session.role === 'owner'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,height:'100%'}}>
      {isOwner && (
        <div style={{display:'flex',justifyContent:'flex-end',flexShrink:0}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setAdding(true)}><Plus size={14}/>{t('settings.add_staff')}</button>
        </div>
      )}

      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}}>
        {users.map(u=>{
          const role = ROLES[u.role]
          const isMe = u.id === session.userId
          // Can change password: owner can change anyone, others can only change their own
          const canChangePw = isOwner || isMe
          return (
            <div key={u.id} className="card" style={{padding:'13px 16px',display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:`${role?.color}22`,color:role?.color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:15,flexShrink:0}}>
                {u.username[0]}
              </div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontWeight:600,fontSize:14}}>{u.username}</span>
                  {isMe && <span style={{fontSize:10,color:'var(--gold)',background:'var(--gold-dim)',padding:'1px 7px',borderRadius:20}}>{t('settings.me')}</span>}
                </div>
                <div style={{fontSize:12,color:role?.color,marginTop:2}}>{t(`settings.role_${u.role}`)} · {t('settings.n_permissions', { n: role?.permissions.length ?? 0 })}</div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {canChangePw && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{fontSize:11,gap:4}}
                    onClick={()=>{ setChangePw(u); setPwForm({oldPw:'',newPw:'',confirmPw:''}); setPwErr(''); setPwOk('') }}
                  >
                    🔑 {isMe ? t('settings.change_password') : t('settings.reset_password')}
                  </button>
                )}
                {isOwner && !isMe && (
                  <button className="btn-icon btn-sm" style={{color:'var(--red)'}} onClick={()=>handleDelete(u)}>
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 新增帳號 Modal ── */}
      {adding && (
        <div style={ss.overlay}>
          <div style={ss.modal} className="animate-scale">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:18}}>
              <span style={{fontWeight:700}}>{t('settings.add_staff_account')}</span>
              <button className="btn-icon" onClick={()=>setAdding(false)}><X size={16}/></button>
            </div>
            <FL>{t('settings.username_label')}</FL>
            <input className="field" value={addForm.username} onChange={e=>setAddForm(f=>({...f,username:e.target.value}))} placeholder={t('settings.username_ph')} style={{marginBottom:12}}/>
            <FL>{t('settings.password_label_req')}</FL>
            <input type="password" className="field" value={addForm.password} onChange={e=>setAddForm(f=>({...f,password:e.target.value}))} placeholder={t('settings.password_ph')} style={{marginBottom:addErr?4:12}}/>
            {addErr && <div style={{fontSize:11,color:'var(--red)',marginBottom:12}}>{addErr}</div>}
            <FL>{t('settings.role')}</FL>
            <select className="field" value={addForm.role} onChange={e=>setAddForm(f=>({...f,role:e.target.value}))} style={{marginBottom:18,cursor:'pointer'}}>
              {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{t(`settings.role_${k}`)}</option>)}
            </select>
            <div style={{background:'var(--bg-base)',borderRadius:8,padding:'10px 12px',marginBottom:16,fontSize:11,color:'var(--text-secondary)'}}>
              {ROLES[addForm.role]?.permissions.slice(0,5).join(' · ')}{ROLES[addForm.role]?.permissions.length>5?` ${t('settings.perm_more', { n: ROLES[addForm.role].permissions.length })}`:''}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={handleAdd} disabled={saving}>{saving?t('settings.saving'):t('common.save')}</button>
              <button className="btn btn-ghost"   style={{flex:1}} onClick={()=>setAdding(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 變更密碼 Modal ── */}
      {changePw && (
        <div style={ss.overlay}>
          <div style={ss.modal} className="animate-scale">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>
                  {changePw.id===session.userId ? t('settings.change_my_password') : t('settings.reset_password_for', { name: changePw.username })}
                </div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:3}}>
                  {changePw.id===session.userId ? t('settings.need_old_pw') : t('settings.owner_reset_hint')}
                </div>
              </div>
              <button className="btn-icon" onClick={()=>setChangePw(null)}><X size={16}/></button>
            </div>

            {/* 自己改才需要舊密碼 */}
            {changePw.id === session.userId && (
              <>
                <FL>{t('settings.old_password')}</FL>
                <input
                  type="password" className="field"
                  value={pwForm.oldPw}
                  onChange={e=>setPwForm(f=>({...f,oldPw:e.target.value}))}
                  placeholder={t('settings.current_pw_ph')}
                  style={{marginBottom:14}}
                  autoComplete="current-password"
                />
              </>
            )}

            <FL>{t('settings.new_password_min8')}</FL>
            <input
              type="password" className="field"
              value={pwForm.newPw}
              onChange={e=>setPwForm(f=>({...f,newPw:e.target.value}))}
              placeholder={t('settings.new_pw_ph')}
              style={{marginBottom:12}}
              autoComplete="new-password"
            />

            {/* Strength indicator */}
            {pwForm.newPw.length > 0 && (
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',gap:4,marginBottom:4}}>
                  {[1,2,3,4].map(i=>{
                    const score = getPwScore(pwForm.newPw)
                    return <div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=score?PW_COLORS[score-1]:'var(--border-dim)',transition:'background .2s'}}/>
                  })}
                </div>
                <div style={{fontSize:11,color:PW_COLORS[getPwScore(pwForm.newPw)-1]||'var(--text-tertiary)'}}>
                  {PW_LABELS[getPwScore(pwForm.newPw)-1]||t('settings.enter_password')}
                </div>
              </div>
            )}

            <FL>{t('settings.confirm_new_password')}</FL>
            <input
              type="password" className="field"
              value={pwForm.confirmPw}
              onChange={e=>setPwForm(f=>({...f,confirmPw:e.target.value}))}
              placeholder={t('settings.confirm_pw_ph')}
              style={{marginBottom: (pwErr||pwOk) ? 8 : 18}}
              autoComplete="new-password"
            />

            {pwErr && <div style={{fontSize:12,color:'var(--red)',marginBottom:14,display:'flex',alignItems:'center',gap:6}}>⚠ {pwErr}</div>}
            {pwOk  && <div style={{fontSize:12,color:'var(--green)',marginBottom:14,display:'flex',alignItems:'center',gap:6}}>✓ {pwOk}</div>}

            <div style={{display:'flex',gap:10}}>
              <button
                className="btn btn-primary" style={{flex:1}}
                onClick={handleChangePw}
                disabled={saving || !pwForm.newPw || !pwForm.confirmPw || (changePw.id===session.userId && !pwForm.oldPw)}
              >
                {saving ? t('settings.updating') : t('settings.confirm_update')}
              </button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setChangePw(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Password strength helpers
function getPwScore(pw) {
  let s = 0
  if (pw.length >= 8)  s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) s++
  return Math.max(1, s)
}
const PW_COLORS = ['var(--red)', 'var(--amber)', 'var(--teal)', 'var(--green)']
const PW_LABELS = [t('settings.pw_weak'), t('settings.pw_fair'), t('settings.pw_good'), t('settings.pw_strong')]

// ── 硬體設定 ────────────────────────────────────────────────
function HardwareTab({ session }) {
  const [printerType, setPrinterType] = useState('network')
  const [printerIP, setPrinterIP] = useState('192.168.1.100')
  const [printerPort, setPrinterPort] = useState('9100')
  const [printerName, setPrinterName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [receiptFooter, setReceiptFooter] = useState('')
  const [printerStatus, setPrinterStatus] = useState(null)
  const [serverInfo, setServerInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [tunnelQr, setTunnelQr] = useState(null)
  const [lanQr, setLanQr] = useState(null)

  const isE = !!window.electronAPI

  useEffect(() => {
    if (serverInfo?.tunnelUrl) {
      QRCode.toDataURL(serverInfo.tunnelUrl + '/menu', { width: 220, margin: 2 }).then(setTunnelQr).catch(() => {})
    } else {
      setTunnelQr(null)
    }
    if (serverInfo?.ip && serverInfo?.port) {
      QRCode.toDataURL(`http://${serverInfo.ip}:${serverInfo.port}/menu`, { width: 180, margin: 2 }).then(setLanQr).catch(() => {})
    }
  }, [serverInfo])

  useEffect(() => {
    if (!isE) return
    // 載入設定
    window.electronAPI.settings.getAll().then(s => {
      if (s.printerType) setPrinterType(s.printerType)
      if (s.printerIP) setPrinterIP(s.printerIP)
      if (s.printerPort) setPrinterPort(s.printerPort)
      if (s.printerName) setPrinterName(s.printerName)
      if (s.storeName) setStoreName(s.storeName)
      if (s.storeAddress) setStoreAddress(s.storeAddress)
      if (s.storePhone) setStorePhone(s.storePhone)
      if (s.receiptFooter) setReceiptFooter(s.receiptFooter)
    })
    window.electronAPI.printer.getStatus().then(setPrinterStatus)
    window.electronAPI.server.getStatus().then(setServerInfo)
  }, [isE])

  async function handleSave() {
    if (!isE) return
    setSaving(true)
    const settings = { printerType, printerIP, printerPort, printerName, storeName, storeAddress, storePhone, receiptFooter }
    for (const [k, v] of Object.entries(settings)) {
      await window.electronAPI.settings.set(k, v)
    }
    setSaving(false)
    setTestMsg(t('settings.saved_settings'))
    setTimeout(() => setTestMsg(''), 2000)
  }

  async function handleTestPrint() {
    if (!isE) return
    setTestMsg(t('settings.printing'))
    const result = await window.electronAPI.printer.testPrint()
    setTestMsg(result.success ? t('settings.test_print_ok') : t('settings.print_failed') + ': ' + (result.error || t('settings.unknown_error')))
    setTimeout(() => setTestMsg(''), 4000)
  }

  async function handleTestDrawer() {
    if (!isE) return
    setTestMsg(t('settings.opening'))
    const result = await window.electronAPI.printer.openCashDrawer()
    setTestMsg(result.success ? t('settings.drawer_opened') : t('settings.open_failed') + ': ' + (result.error || ''))
    setTimeout(() => setTestMsg(''), 3000)
  }

  if (!isE) return (
    <div style={{padding:20, textAlign:'center', color:'var(--text-dim)'}}>
      {t('settings.hardware_desktop_only')}
    </div>
  )

  const fieldStyle = { width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid var(--border-dim)', fontSize:13, fontFamily:'inherit' }
  const labelStyle = { fontSize:11, color:'var(--text-tertiary)', marginBottom:4, display:'block' }

  return (
    <div style={{overflow:'auto', height:'100%', padding:'0 4px'}}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:800}}>
        {/* 印表機設定 */}
        <div className="card" style={{padding:16}}>
          <h3 style={{fontSize:14, fontWeight:600, marginBottom:12, display:'flex', alignItems:'center', gap:6}}>
            <Printer size={15}/> {t('settings.printer_settings')}
          </h3>

          <label style={labelStyle}>{t('settings.connection_type')}</label>
          <div style={{display:'flex', gap:8, marginBottom:12}}>
            <button className={`btn btn-sm ${printerType==='network' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPrinterType('network')}>{t('settings.network_printer')}</button>
            <button className={`btn btn-sm ${printerType==='windows' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPrinterType('windows')}>{t('settings.windows_shared')}</button>
          </div>

          {printerType === 'network' ? (
            <>
              <label style={labelStyle}>{t('settings.printer_ip')}</label>
              <input style={{...fieldStyle, marginBottom:8}} value={printerIP} onChange={e=>setPrinterIP(e.target.value)} placeholder="192.168.1.100"/>
              <label style={labelStyle}>Port</label>
              <input style={{...fieldStyle, marginBottom:8}} value={printerPort} onChange={e=>setPrinterPort(e.target.value)} placeholder="9100"/>
            </>
          ) : (
            <>
              <label style={labelStyle}>{t('settings.printer_share_path')}</label>
              <input style={{...fieldStyle, marginBottom:8}} value={printerName} onChange={e=>setPrinterName(e.target.value)} placeholder="\\\\server\\printer"/>
            </>
          )}

          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button className="btn btn-ghost btn-sm" onClick={handleTestPrint}>{t('settings.test_print')}</button>
            <button className="btn btn-ghost btn-sm" onClick={handleTestDrawer}>{t('settings.test_drawer')}</button>
          </div>
          {printerStatus && (
            <div style={{marginTop:8, fontSize:12, color: printerStatus.connected ? 'var(--green)' : 'var(--red)'}}>
              {printerStatus.connected ? t('settings.printer_connected') : t('settings.printer_disconnected')}
            </div>
          )}
        </div>

        {/* 收據設定 */}
        <div className="card" style={{padding:16}}>
          <h3 style={{fontSize:14, fontWeight:600, marginBottom:12}}>{t('settings.receipt_settings')}</h3>

          <label style={labelStyle}>{t('settings.store_name')}</label>
          <input style={{...fieldStyle, marginBottom:8}} value={storeName} onChange={e=>setStoreName(e.target.value)} placeholder={t('settings.store_name_ph')}/>

          <label style={labelStyle}>{t('settings.address')}</label>
          <input style={{...fieldStyle, marginBottom:8}} value={storeAddress} onChange={e=>setStoreAddress(e.target.value)} placeholder={t('settings.address_ph')}/>

          <label style={labelStyle}>{t('settings.phone')}</label>
          {/* DEAD-15: 原本是台灣市話格式（02-1234-5678），改印尼格式（021 市話 / 08xx 手機） */}
          <input style={{...fieldStyle, marginBottom:8}} value={storePhone} onChange={e=>setStorePhone(e.target.value)} placeholder="021-1234-5678"/>

          <label style={labelStyle}>{t('settings.receipt_footer')}</label>
          <input style={{...fieldStyle, marginBottom:8}} value={receiptFooter} onChange={e=>setReceiptFooter(e.target.value)} placeholder={t('settings.receipt_footer_ph')}/>
        </div>

        {/* 點餐系統 */}
        <div className="card" style={{padding:16}}>
          <h3 style={{fontSize:14, fontWeight:600, marginBottom:12, display:'flex', alignItems:'center', gap:6}}>
            <Wifi size={15}/> 點餐系統
          </h3>
          {serverInfo && (
            <>
              <div style={{fontSize:13, marginBottom:8}}>
                狀態: <span style={{color: serverInfo.running ? 'var(--green)' : 'var(--red)', fontWeight:600}}>
                  {serverInfo.running ? '運行中' : '未啟動'}
                </span>
              </div>

              {/* 外網穿透開關：預設關閉，店家需明確開啟才會對外曝露點餐伺服器 */}
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:12, padding:'8px 10px', background:'var(--bg-overlay)', borderRadius:6}}>
                <div>
                  <div style={{fontSize:12, fontWeight:600}}>外網穿透（公開網址）</div>
                  <div style={{fontSize:10, color:'var(--text-tertiary)', marginTop:2}}>開啟後任何知道網址的人都能點餐，請謹慎使用</div>
                </div>
                <label style={{position:'relative', display:'inline-block', width:38, height:22, flexShrink:0}}>
                  <input type="checkbox" checked={!!serverInfo.tunnelEnabled} style={{opacity:0, width:0, height:0}}
                    onChange={async (e) => {
                      const enabled = e.target.checked
                      setServerInfo(s => ({ ...s, tunnelEnabled: enabled }))
                      await window.electronAPI.server.setTunnelEnabled(enabled)
                      window.electronAPI.server.getStatus().then(setServerInfo)
                    }}/>
                  <span style={{
                    position:'absolute', inset:0, borderRadius:11, transition:'.15s',
                    background: serverInfo.tunnelEnabled ? 'var(--green)' : 'var(--border-dim)',
                  }}/>
                  <span style={{
                    position:'absolute', top:2, left: serverInfo.tunnelEnabled ? 18 : 2, width:18, height:18,
                    borderRadius:'50%', background:'#fff', transition:'.15s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                  }}/>
                </label>
              </div>

              {serverInfo.running && (
                <>
                  {/* 外網 QR Code */}
                  {!serverInfo.tunnelEnabled ? null : serverInfo.tunnelUrl ? (
                    <div style={{marginBottom:12, padding:'12px', background:'var(--green-dim)', borderRadius:8, border:'1px solid rgba(90,158,111,0.2)', textAlign:'center'}}>
                      <div style={{fontSize:11, color:'var(--green)', fontWeight:600, marginBottom:8}}>外網點餐 QR Code（任何網路皆可掃）</div>
                      {tunnelQr && (
                        <img src={tunnelQr} alt="外網點餐QR Code"
                          style={{width:180, height:180, borderRadius:8, border:'4px solid #fff', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', display:'block', margin:'0 auto 8px'}}/>
                      )}
                      <code style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-secondary)', wordBreak:'break-all', display:'block'}}>
                        {serverInfo.tunnelUrl}/menu
                      </code>
                    </div>
                  ) : (
                    <div style={{marginBottom:12, padding:'10px 12px', background:'var(--amber-dim)', borderRadius:8, fontSize:11, color:'var(--amber)'}}>
                      外網穿透連線中...（如果一直無法連線，請檢查網路）
                    </div>
                  )}

                  {/* 區域網路 QR Code */}
                  <div style={{padding:'12px', background:'var(--bg-overlay)', borderRadius:8, border:'1px solid var(--border-dim)', textAlign:'center'}}>
                    <div style={{fontSize:11, color:'var(--text-secondary)', fontWeight:600, marginBottom:8}}>區域網路 QR Code（同一 WiFi）</div>
                    {lanQr && (
                      <img src={lanQr} alt="區域網路QR Code"
                        style={{width:140, height:140, borderRadius:6, border:'3px solid #fff', boxShadow:'0 2px 6px rgba(0,0,0,0.1)', display:'block', margin:'0 auto 8px'}}/>
                    )}
                    <code style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-tertiary)'}}>
                      http://{serverInfo.ip}:{serverInfo.port}/menu
                    </code>
                  </div>
                </>
              )}
            </>
          )}
          <button className="btn btn-ghost btn-sm" style={{marginTop:10}} onClick={() => {
            window.electronAPI.server.getStatus().then(setServerInfo)
          }}>重新整理狀態</button>
        </div>

        {/* 儲存 */}
        <div className="card" style={{padding:16, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:10}}>
          <button className="btn btn-primary" style={{width:'100%', padding:12}} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '儲存所有設定'}
          </button>
          {testMsg && (
            <div style={{fontSize:12, color:'var(--accent)', textAlign:'center'}}>{testMsg}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 資安設定說明 ──────────────────────────────────────────────
function SecurityTab({ session }) {
  const items = [
    { icon:'🔐', title:'PBKDF2 密碼加密', desc:'密碼以 PBKDF2（200,000次迭代 + 隨機 salt）儲存，即使資料庫外洩也無法破解', status:'已啟用', ok:true },
    { icon:'⏱', title:'閒置自動鎖定', desc:'30 分鐘無操作自動回到登入畫面，防止員工離開後他人存取', status:'30分鐘', ok:true },
    { icon:'🚫', title:'暴力破解防護', desc:'同一帳號連續 5 次輸入錯誤密碼，鎖定 30 分鐘', status:'已啟用', ok:true },
    { icon:'📋', title:'稽核日誌', desc:'所有登入、結帳、刪除、匯出操作均記錄時間戳、操作人，最多保留 2000 筆', status:'已啟用', ok:true },
    // DEAD-14：原文案宣稱「所有輸入資料」都清洗，但 sanitizeObject 實際只接在促銷/進貨兩個表單，
    // 商品/會員/結帳輸入未套用——降級文案為「部分套用」，不再誇大涵蓋範圍。
    { icon:'🧹', title:'XSS / Injection 防護', desc:'促銷、進貨等表單輸入在儲存前清洗，過濾 script 標籤等惡意字串；尚未涵蓋商品/會員/結帳輸入', status:'部分套用', ok:false },
    // DEAD-14：maskPhone/maskName 函數已寫好但從未在會員列表等畫面實際呼叫，顧客電話目前是明碼顯示——
    // 降級為「尚未套用」，避免使用者誤以為已有遮罩保護。
    { icon:'👁', title:'個資遮罩', desc:'遮罩函數已備妥（09xx****xxx），但目前尚未接到會員列表等顯示畫面，顧客資料仍為明碼顯示', status:'尚未套用', ok:false },
    // DEAD-14：自動備份實際觸發時機是登出時 + 每日第一次登入時，並非「每次重要操作前」，修正描述避免誇大。
    { icon:'💾', title:'自動備份', desc:'登出時與每日首次登入時自動快照，最多保留 10 份，可匯出 JSON 檔案離線保存', status:'已啟用', ok:true },
    { icon:'🔒', title:'Session 管理', desc:'登入 Token 存於 sessionStorage（關閉分頁即失效），包含到期時間，不存密碼', status:'8小時', ok:true },
  ]

  return (
    <div style={{overflowY:'auto',height:'100%',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'4px 0',flexShrink:0}}>
        以下為系統內建的資安防護，所有措施均在瀏覽器端實作，無需額外設定。
      </div>
      {items.map(item=>(
        <div key={item.title} className="card" style={{padding:'13px 16px',display:'flex',gap:14,alignItems:'flex-start'}}>
          <div style={{fontSize:22,flexShrink:0,marginTop:2}}>{item.icon}</div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontWeight:600,fontSize:13}}>{item.title}</span>
              <span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:item.ok?'var(--green-dim)':'var(--red-dim)',color:item.ok?'var(--green)':'var(--red)'}}>
                {item.status}
              </span>
            </div>
            <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{item.desc}</div>
          </div>
        </div>
      ))}
      <div style={{background:'var(--gold-dim)',border:'1px solid var(--gold-dim)',borderRadius:10,padding:'12px 16px',fontSize:12,color:'var(--gold-bright)',lineHeight:1.7,flexShrink:0}}>
        <strong>升級至雲端版後額外獲得：</strong> HTTPS 加密傳輸 · Row Level Security（每店資料隔離）· 異地備份 · WAF 防火牆 · DDoS 防護
      </div>
    </div>
  )
}

// ── 備份還原 ──────────────────────────────────────────────────
// Electron：清單 / 還原 / 匯入 / 匯出全走 IPC（SQLite backups 表 + backups/ JSON 檔）。
// 以前這頁接的是 security.js 的 localStorage 快照函式，在 Electron 上是「按了沒事」的
// 死路 — 損毀復原後店家在 App 內完全沒有可執行的還原途徑。
// 瀏覽器：維持原本 localStorage 行為不變。
function BackupTab({ session }) {
  const [backups,  setBackups]  = useState(() => (isElectron ? [] : getBackupList()))
  const [restoring,setRestoring]= useState(null)
  const [importing,setImporting]= useState(null) // Electron：已解析、待確認的匯入資料
  const [msg,      setMsg]      = useState('')

  useEffect(() => {
    if (isElectron) loadBackups().then(list => setBackups(list || []))
  }, [])

  function flash(text, ms = 3000) { setMsg(text); setTimeout(()=>setMsg(''), ms) }

  async function doBackup() {
    const r = createBackup(session, `${t('settings.manual_backup')} ${new Date().toLocaleString('id-ID')}`)
    if (isElectron) {
      if (r?.promise) await r.promise
      setBackups(await loadBackups() || [])
    } else {
      setBackups(getBackupList())
    }
    flash(t('settings.backup_created'), 2500)
  }

  async function doRestore(id) {
    setRestoring(null)
    if (isElectron) {
      try {
        const res = await dbRestoreBackup(id)
        if (res?.success) {
          writeAuditLog('BACKUP_RESTORE', session, { backupId: id })
          flash(t('settings.restore_success'))
          setTimeout(() => location.reload(), 900)
        } else {
          flash(t('settings.restore_failed'), 4000)
        }
      } catch { flash(t('settings.restore_failed'), 4000) }
      return
    }
    const ok = restoreBackup(id, session)
    flash(ok ? `✓ ${t('settings.restore_success')}` : t('settings.restore_failed'), 4000)
  }

  async function doExport() {
    if (isElectron) {
      try {
        const data = await dbExportData()
        const filename = `POSEasy_backup_${new Date().toISOString().slice(0,10)}.json`
        downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json')
        writeAuditLog('DATA_EXPORT', session, { filename })
      } catch { flash(t('settings.import_failed'), 3000); return }
    } else {
      exportBackupFile(session)
    }
    flash(t('settings.export_done'), 2000)
  }

  function handleImport(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 允許重選同一個檔案
    if (!file) return
    if (!isElectron) {
      importBackupFile(file, session)
        .then(() => flash(t('settings.import_success'), 4000))
        .catch(() => flash(t('settings.import_failed'), 4000))
      return
    }
    // Electron：解析扁平 bk*.json 形狀（{products, members, orders, kasbonRecords, ...}），
    // 驗證像備份檔（至少有 products 或 orders 陣列）才進確認框 —
    // importData 會「整庫取代」，不可沒警告就執行
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        const looksLikeBackup = data && typeof data === 'object' && !Array.isArray(data) &&
          (Array.isArray(data.products) || Array.isArray(data.orders))
        if (!looksLikeBackup) { flash(t('settings.import_invalid'), 4000); return }
        setImporting(data)
      } catch { flash(t('settings.import_failed'), 4000) }
    }
    reader.onerror = () => flash(t('settings.import_failed'), 4000)
    reader.readAsText(file)
  }

  async function doImport() {
    const data = importing
    setImporting(null)
    try {
      await dbImportData(data)
      writeAuditLog('BACKUP_RESTORE', session, { source: 'file' })
      flash(t('settings.import_success'))
      setTimeout(() => location.reload(), 900)
    } catch { flash(t('settings.import_failed'), 4000) }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,height:'100%'}}>
      <div style={{display:'flex',gap:10,flexShrink:0,flexWrap:'wrap'}}>
        <button className="btn btn-primary btn-sm" onClick={doBackup}><Database size={14}/>{t('settings.backup_now')}</button>
        <button className="btn btn-ghost btn-sm"  onClick={doExport}><Download size={14}/>{t('settings.export_json')}</button>
        <label className="btn btn-ghost btn-sm" style={{cursor:'pointer'}}>
          <Upload size={14}/>{t('settings.import_backup')}
          <input type="file" accept=".json,application/json" style={{display:'none'}} onChange={handleImport}/>
        </label>
      </div>
      {msg && <div style={{background:'var(--green-dim)',border:'1px solid rgba(52,201,122,.2)',color:'var(--green)',borderRadius:8,padding:'8px 14px',fontSize:13,flexShrink:0}}>{msg}</div>}

      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}}>
        {backups.length===0 ? (
          <div style={{textAlign:'center',padding:'40px',color:'var(--text-tertiary)',fontSize:13}}>{t('settings.no_backups')}</div>
        ) : backups.map(b=>(
          <div key={b.id} className="card" style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:14}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:500,fontSize:13}}>{b.label}</div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:3,fontFamily:'var(--font-mono)'}}>
                {new Date(b.createdAt).toLocaleString('id-ID')} · {b.createdBy}
                {b.size ? ` · ${Math.round(b.size/1024)}KB` : ''}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{color:'var(--amber)'}} onClick={()=>setRestoring(b.id)}>
              <RefreshCw size={13}/>{t('settings.restore')}
            </button>
          </div>
        ))}
      </div>

      {restoring && (
        <div style={ss.overlay}>
          <div style={{...ss.modal,maxWidth:360}} className="animate-scale">
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{t('settings.confirm_restore')}</div>
              <div style={{fontSize:13,color:'var(--text-secondary)'}}>{t('settings.restore_warning')}</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={()=>doRestore(restoring)}>{t('settings.confirm_restore_btn')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setRestoring(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {importing && (
        <div style={ss.overlay}>
          <div style={{...ss.modal,maxWidth:360}} className="animate-scale">
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{t('settings.confirm_import')}</div>
              <div style={{fontSize:13,color:'var(--text-secondary)'}}>{t('settings.import_warning')}</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={doImport}>{t('settings.confirm_import_btn')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setImporting(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 稽核日誌 ──────────────────────────────────────────────────
function AuditTab({ session }) {
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

function FL({children}){return <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:5,letterSpacing:'.03em'}}>{children}</div>}

// ── Webhook 通知 ─────────────────────────────────────────────
function WebhookTab({ session }) {
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

// ── 雲端同步 ──────────────────────────────────────────────────
function CloudSyncTab({ session }) {
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
      showMsg('✗ ' + t('settings.push_failed', { error: e.message }), 8000)
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
      showMsg('✗ ' + t('settings.pull_failed', { error: e.message }), 8000)
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
          fontSize:13, zIndex:300, boxShadow:'var(--shadow-md)',
        }}>{msg}</div>
      )}

      {confirmPull && (
        <div style={ss.overlay}>
          <div style={{...ss.modal, maxWidth:400}} className="animate-scale">
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
          </div>
        </div>
      )}
    </div>
  )
}

const ss = {
  root:{display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:12,overflow:'hidden'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0},
  title:{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600},
  // RWD-02：overflowX auto（照 POSPage ps.catWrap 模式）——9 個分頁籤在手機上可橫捲，不再被硬裁 6 個進不去
  tabBar:{display:'flex',borderBottom:'1px solid var(--border-dim)',flexShrink:0,overflowX:'auto'},
  tab:{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',fontSize:13,fontWeight:500,transition:'all 150ms',borderRadius:0,letterSpacing:'.01em',whiteSpace:'nowrap',flexShrink:0},
  overlay:{position:'fixed',inset:0,background:'rgba(44,42,38,0.25)',backdropFilter:'blur(2px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200},
  // RWD-01：maxHeight + overflowY，手機上表單長於視窗時可捲動
  modal:{background:'var(--bg-raised)',border:'1px solid var(--border-dim)',borderRadius:'var(--r4)',padding:24,width:'90%',maxWidth:420,maxHeight:'88vh',overflowY:'auto'},
}
