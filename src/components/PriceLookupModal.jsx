import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, Tag } from 'lucide-react'
import Modal from './Modal'
import { t, fmtMoney } from '../i18n'

export default function PriceLookupModal({ products, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    if (!q) return products.slice(0, 30)
    return products.filter(p =>
      p.name.includes(q) || p.barcode?.includes(q) || p.category?.includes(q)
    ).slice(0, 50)
  }, [q, products])

  return (
    <Modal
      onClose={onClose}
      maxWidth={600}
      overlayStyle={{ background:'rgba(0,0,0,0.5)', backdropFilter:'none', alignItems:'flex-start' }}
      panelStyle={{ padding:0, display:'flex', flexDirection:'column', marginTop:'10vh', maxHeight:'80vh', overflowY:'hidden' }}
    >
        <div style={pl.head}>
          <Search size={16} color="var(--text-tertiary)"/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder={t('pos.lookup_placeholder')}
            style={{flex:1, fontSize:16, color:'var(--text-primary)'}}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}/>
          <button onClick={onClose} style={{padding:6}}><X size={18}/></button>
        </div>
        <div style={pl.list}>
          {results.length === 0 ? (
            <div style={{textAlign:'center', padding:40, color:'var(--text-tertiary)', fontSize:13}}>
              {t('pos.no_products_found')}
            </div>
          ) : results.map(p => (
            <div key={p.id} style={pl.row}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" style={{width:32, height:32, borderRadius:6, objectFit:'cover', flexShrink:0}}/>
                  )}
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {p.noBarcode && <Tag size={10} style={{verticalAlign:'middle', marginRight:4, opacity:0.5}}/>}
                      {p.name}
                    </div>
                    <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>
                      {p.category} · {t('pos.stock')} {p.stock} {p.unit}
                      {p.barcode && ` · ${p.barcode}`}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{textAlign:'right', flexShrink:0, marginLeft:12}}>
                <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:'var(--gold)'}}>
                  {fmtMoney(p.price)}
                </div>
                <div style={{fontSize:10, color:'var(--text-tertiary)'}}>/ {p.unit}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={pl.foot}>
          <span style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('pos.lookup_footer', { n: results.length })}</span>
        </div>
    </Modal>
  )
}

const pl = {
  head:{
    display:'flex', alignItems:'center', gap:10,
    padding:'14px 18px', borderBottom:'1px solid var(--border-dim)',
  },
  list:{
    flex:1, overflowY:'auto', padding:'8px 0',
  },
  row:{
    display:'flex', alignItems:'center', padding:'10px 18px',
    borderBottom:'1px solid var(--border-dim)',
  },
  foot:{
    padding:'8px 18px', borderTop:'1px solid var(--border-dim)',
    background:'var(--bg-overlay)',
  },
}
