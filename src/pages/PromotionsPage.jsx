import { useState } from 'react'
import { Plus, X, Check, Tag, Clock, Percent, Gift } from 'lucide-react'
import { writeAuditLog, sanitizeObject } from '../utils/security'
import Modal from '../components/Modal'
import { t, fmtMoney } from '../i18n'
import FieldLabel from '../components/FieldLabel'

// 型別鍵值（threshold/percent/...）為儲存值，勿改；label/desc 僅供顯示
export const PROMO_TYPES = {
  threshold:  { label:t('promo.type_threshold'), icon:'💰', desc:t('promo.desc_threshold') },
  percent:    { label:t('promo.type_percent'),   icon:'%',  desc:t('promo.desc_percent') },
  buyget:     { label:t('promo.type_buyget'),    icon:'🎁', desc:t('promo.desc_buyget') },
  fixed:      { label:t('promo.type_fixed'),     icon:'🏷', desc:t('promo.desc_fixed') },
}

export default function PromotionsPage({ store, session }) {
  const { promotions, addPromotion, updatePromotion, deletePromotion } = store
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(null)

  function toggle(id) {
    const target = promotions.find(p => p.id === id)
    if (!target) return
    updatePromotion(id, { enabled: !target.enabled })
  }

  function startNew(type) {
    const defaults = {
      threshold: { threshold:500, discount:50 },
      percent:   { rate:0.9 },
      buyget:    { buy:3, get:1 },
      fixed:     { productIds:[], discount:30 },
    }
    setEditing('new')
    setForm({
      name:'', type, enabled:true, note:'',
      startAt: new Date().toISOString().slice(0,16),
      endAt:   new Date(Date.now()+30*864e5).toISOString().slice(0,16),
      condition: defaults[type],
    })
  }

  function startEdit(p) {
    setEditing(p.id)
    setForm({...p, startAt:p.startAt.slice(0,16), endAt:p.endAt.slice(0,16)})
  }

  function saveForm() {
    if (!form.name) return
    const clean = { ...sanitizeObject(form), startAt:form.startAt+':00', endAt:form.endAt+':00' }
    if (editing==='new') {
      const n = addPromotion(clean)
      writeAuditLog('PROMO_CREATE', session, { promoName:n.name, type:n.type })
    } else {
      updatePromotion(editing, clean)
    }
    setEditing(null); setForm(null)
  }

  const now    = new Date().toISOString()
  const active = promotions.filter(p=>p.enabled && p.startAt<=now && p.endAt>=now)

  return (
    <div style={pm.root}>
      <div style={pm.header}>
        <div>
          <h2 style={pm.title}>{t('promo.title')}</h2>
          <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
            {t('promo.summary', {active: active.length, total: promotions.length})}
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', flexShrink:0}}>
        {Object.entries(PROMO_TYPES).map(([type,info])=>(
          <button key={type} className="btn btn-ghost btn-sm" onClick={()=>startNew(type)} style={{gap:6}}>
            <span>{info.icon}</span>{info.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:10}}>
        {promotions.length===0 && (
          <div style={{textAlign:'center', padding:'48px', color:'var(--text-tertiary)', fontSize:13}}>{t('promo.none_yet')}</div>
        )}
        {promotions.map(p => {
          const isActive = p.enabled && p.startAt<=now && p.endAt>=now
          const isExpired = p.endAt < now
          const info = PROMO_TYPES[p.type]
          return (
            <div key={p.id} className="card" style={{padding:'14px 16px', borderLeft:`3px solid ${isActive?'var(--gold)':isExpired?'var(--border-dim)':'var(--border-subtle)'}`, opacity:isExpired?0.5:1}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <div style={{fontSize:22, flexShrink:0}}>{info.icon}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                    <span style={{fontWeight:600, fontSize:14}}>{p.name}</span>
                    <span style={{fontSize:10, padding:'1px 8px', borderRadius:20, background:isActive?'var(--gold-dim)':isExpired?'var(--bg-active)':'var(--border-dim)', color:isActive?'var(--gold-bright)':'var(--text-tertiary)'}}>
                      {isActive?t('promo.active'):isExpired?t('promo.ended'):t('promo.inactive')}
                    </span>
                    <span style={{fontSize:10, color:'var(--text-tertiary)'}}>{info.label}</span>
                  </div>
                  <div style={{fontSize:12, color:'var(--text-secondary)'}}>
                    {describeCondition(p)}
                  </div>
                  <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:3, fontFamily:'var(--font-mono)'}}>
                    {p.startAt.slice(0,10)} ~ {p.endAt.slice(0,10)}
                  </div>
                </div>
                <div style={{display:'flex', gap:6, alignItems:'center', flexShrink:0}}>
                  {/* Toggle */}
                  <button
                    onClick={()=>toggle(p.id)}
                    style={{
                      width:44, height:24, borderRadius:12, position:'relative', cursor:'pointer',
                      background:p.enabled?'var(--gold)':'var(--border-mid)', transition:'background 200ms',
                      border:'none',
                    }}
                  >
                    <span style={{
                      position:'absolute', top:3, left:p.enabled?22:3,
                      width:18, height:18, borderRadius:'50%', background:'#fff',
                      transition:'left 200ms', display:'block',
                    }}/>
                  </button>
                  <button className="btn-icon btn-sm" onClick={()=>startEdit(p)}>✏️</button>
                  <button className="btn-icon btn-sm" style={{color:'var(--red)'}} onClick={()=>deletePromotion(p.id)}>
                    <X size={14}/>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal */}
      {editing && form && (
        <Modal maxWidth={480}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
              <span style={{fontWeight:700, fontSize:15}}>{editing==='new'?t('promo.new_titled', {type: PROMO_TYPES[form.type].label}):t('promo.edit_title')}</span>
              <button className="btn-icon" onClick={()=>{setEditing(null);setForm(null)}}><X size={16}/></button>
            </div>

            <FieldLabel>{t('promo.name_label')} *</FieldLabel>
            <input className="field" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={t('promo.name_ph')} style={{marginBottom:14}}/>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14}}>
              <div><FieldLabel>{t('promo.start_at')}</FieldLabel><input type="datetime-local" className="field" value={form.startAt} onChange={e=>setForm(f=>({...f,startAt:e.target.value}))}/></div>
              <div><FieldLabel>{t('promo.end_at')}</FieldLabel><input type="datetime-local" className="field" value={form.endAt}   onChange={e=>setForm(f=>({...f,endAt:e.target.value}))}/></div>
            </div>

            {/* Condition fields by type */}
            <div style={{background:'var(--bg-overlay)', borderRadius:10, padding:'14px', marginBottom:14}}>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:10}}>{t('promo.condition')}</div>
              {form.type === 'threshold' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                  <div><FieldLabel>{t('promo.min_spend')}</FieldLabel><input type="number" inputMode="numeric" className="field" value={form.condition.threshold} onChange={e=>setForm(f=>({...f,condition:{...f.condition,threshold:parseFloat(e.target.value)||0}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                  <div><FieldLabel>{t('promo.discount_amt')}</FieldLabel><input type="number" inputMode="numeric" className="field" value={form.condition.discount} onChange={e=>setForm(f=>({...f,condition:{...f.condition,discount:parseFloat(e.target.value)||0}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                </div>
              )}
              {form.type === 'percent' && (
                <div><FieldLabel>{t('promo.rate_label')}</FieldLabel><input type="number" inputMode="decimal" min={0.1} max={1} step={0.05} className="field" value={form.condition.rate} onChange={e=>setForm(f=>({...f,condition:{...f.condition,rate:parseFloat(e.target.value)||0.9}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
              )}
              {form.type === 'buyget' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                  <div><FieldLabel>{t('promo.buy_qty')}</FieldLabel><input type="number" inputMode="numeric" className="field" value={form.condition.buy} onChange={e=>setForm(f=>({...f,condition:{...f.condition,buy:parseInt(e.target.value)||2}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                  <div><FieldLabel>{t('promo.get_qty')}</FieldLabel><input type="number" inputMode="numeric" className="field" value={form.condition.get} onChange={e=>setForm(f=>({...f,condition:{...f.condition,get:parseInt(e.target.value)||1}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                </div>
              )}
              {form.type === 'fixed' && (
                <div><FieldLabel>{t('promo.fixed_amt')}</FieldLabel><input type="number" inputMode="numeric" className="field" value={form.condition.discount} onChange={e=>setForm(f=>({...f,condition:{...f.condition,discount:parseFloat(e.target.value)||0}}))} style={{fontFamily:'var(--font-mono)'}}/></div>
              )}
            </div>

            <FieldLabel>{t('promo.note_label')}</FieldLabel>
            <input className="field" value={form.note||''} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder={t('common.optional')} style={{marginBottom:16}}/>

            <div style={{display:'flex', gap:10}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveForm}><Check size={15}/>{t('common.save')}</button>
              <button className="btn btn-ghost"   style={{flex:1}} onClick={()=>{setEditing(null);setForm(null)}}>{t('common.cancel')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}

// DEAD-05: 原本硬編中文 + NT$ 字面字串（describeCondition，非 promoDesc），
// 對應的 promo.desc_cond_* key 早已存在（purchase.js:122-132）卻沒接上。改用 t() + fmtMoney。
function describeCondition(p) {
  if (p.type==='threshold') return t('promo.desc_cond_threshold', { min: fmtMoney(p.condition.threshold), amt: fmtMoney(p.condition.discount) })
  if (p.type==='percent')   return t('promo.desc_cond_percent', { tenth: Math.round(p.condition.rate*10), pct: Math.round((1-p.condition.rate)*100) })
  if (p.type==='buyget')    return t('promo.desc_cond_buyget', { buy: p.condition.buy, get: p.condition.get })
  if (p.type==='fixed')     return t('promo.desc_cond_fixed', { amt: fmtMoney(p.condition.discount) })
  return ''
}

const pm = {
  root:{display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:14,overflow:'hidden'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0,flexWrap:'wrap',gap:10},
  title:{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600},
}
