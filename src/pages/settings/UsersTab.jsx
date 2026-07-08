import { useState, useEffect } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ROLES, hashPassword, verifyPassword, writeAuditLog } from '../../utils/security'
import { isElectron, loadUsers } from '../../utils/dataAccess'
import { t } from '../../i18n'
import { FL } from './shared'
import Modal from '../../components/Modal'

export default function UsersTab({ session }) {
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
        <Modal maxWidth={420}>
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
        </Modal>
      )}

      {/* ── 變更密碼 Modal ── */}
      {changePw && (
        <Modal maxWidth={420}>
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
        </Modal>
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
