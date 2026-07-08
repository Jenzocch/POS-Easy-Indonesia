import { useState, useMemo, lazy, Suspense } from 'react'
import { Plus, Check, X, Truck, Package, ChevronRight, ChevronLeft, ChevronDown, Clock, CheckCircle, Zap, AlertTriangle, Pencil, Camera } from 'lucide-react'
import { writeAuditLog, sanitizeObject } from '../utils/security'
import { DEFAULT_CATEGORIES, CATEGORY_META, groupByCategory } from '../utils/categories'
import { computeSalesVelocity, suggestReorderQty } from '../utils/analytics'
import useIsMobile from '../hooks/useIsMobile'
import Modal from '../components/Modal'
import { Z } from '../utils/zIndex'
import { t, fmtMoney } from '../i18n'
const BarcodeScannerModal = lazy(() => import('../components/BarcodeScannerModal'))

// 狀態值（draft/ordered/...）為儲存值，勿改；label 僅供顯示
const STATUS = {
  draft:    { label:t('purchase.status_draft'),    color:'var(--text-tertiary)', bg:'var(--bg-active)' },
  ordered:  { label:t('purchase.status_ordered'),  color:'var(--blue)',           bg:'var(--blue-dim)' },
  received: { label:t('purchase.status_received'), color:'var(--green)',          bg:'var(--green-dim)' },
  partial:  { label:t('purchase.status_partial'),  color:'var(--amber)',          bg:'var(--amber-dim)' },
}

export default function PurchasePage({ store, session }) {
  const { products, updateProduct, orders = [], suppliers = [], purchases = [], addSupplier, updateSupplier, addPurchase, updatePurchase } = store
  const [tab,        setTab]        = useState('list')
  const [selected,   setSelected]   = useState(null)
  const [receiving,  setReceiving]  = useState(null)

  function handleReceive(po, receivedQtys) {
    // Update stock for each item
    po.items.forEach(item => {
      const qty = receivedQtys[item.productId] || 0
      if (qty > 0) {
        updateProduct(item.productId, {
          stock: (products.find(p=>p.id===item.productId)?.stock || 0) + qty
        })
      }
    })
    const updatedItems = po.items.map(item => ({
      ...item, received: (receivedQtys[item.productId] || 0),
    }))
    const allReceived = updatedItems.every(i => i.received >= i.qty)
    const anyReceived = updatedItems.some(i => i.received > 0)

    const updated = {
      ...po,
      items: updatedItems,
      status: allReceived ? 'received' : anyReceived ? 'partial' : 'ordered',
      receivedDate: new Date().toISOString().slice(0,10),
    }
    updatePurchase(po.id, updated)
    writeAuditLog('PURCHASE_APPROVE', session, { poId: po.id, supplier: po.supplierName })
    setReceiving(null)
    setSelected(updated)
  }

  const pending  = purchases.filter(p => p.status !== 'received')
  const done     = purchases.filter(p => p.status === 'received')
  const totalOwed = pending.filter(p=>p.status==='ordered').reduce((s,p)=>s+p.total,0)

  return (
    <div style={ps.root}>
      <div style={ps.header}>
        <div>
          <h2 style={ps.title}>{t('purchase.title')}</h2>
          <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
            {t('purchase.pending_summary', {count: pending.length, amt: fmtMoney(totalOwed)})}
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
          {[['list',t('purchase.tab_list')],['new',t('purchase.tab_new')],['suppliers',t('purchase.tab_suppliers')],['payable',t('purchase.tab_payable')]].map(([k,l])=>(
            <button key={k} onClick={()=>{setTab(k);setSelected(null)}} className={`btn btn-sm ${tab===k?'btn-primary':'btn-ghost'}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'list'      && <PurchaseList purchases={purchases} selected={selected} onSelect={setSelected} onReceive={setReceiving}/>}
      {tab === 'new'       && <NewPurchase  products={products} suppliers={suppliers} purchases={purchases} orders={orders} onSave={po=>{addPurchase(po);setTab('list');writeAuditLog('PURCHASE_CREATE',session,{id:po.id})}}/>}
      {tab === 'suppliers' && <SupplierList suppliers={suppliers} products={products} onAdd={addSupplier} onUpdate={updateSupplier} onGoInventory={()=>store.setView?.('inventory')}/>}
      {tab === 'payable'   && <PayableTab   purchases={purchases} suppliers={suppliers} onMarkPaid={(id)=>{
        const target = purchases.find(p => p.id === id)
        if (!target) return
        // 只寫 paidDate、不改 status：付款與收貨是兩個維度（PayableTab 以 paidDate 區分已付/未付）；
        // 寫入 STATUS map 查無的 status 會讓 PurchaseList 渲染 crash
        const updatedPo = { ...target, paidDate: new Date().toISOString().slice(0,10) }
        updatePurchase(id, updatedPo)
        writeAuditLog('PURCHASE_PAY', session, { poId:id })
      }}/>}

      {receiving && (
        <ReceiveModal po={receiving} products={products} onConfirm={q=>handleReceive(receiving,q)} onClose={()=>setReceiving(null)}/>
      )}
    </div>
  )
}

// ── 進貨單列表 ──────────────────────────────────────────────
function PurchaseList({ purchases, selected, onSelect, onReceive }) {
  const isMobile = useIsMobile()
  // mobile：選中就只看詳情，未選看列表
  const showList   = !isMobile || !selected
  const showDetail = !isMobile || !!selected

  return (
    <div style={{display:'flex', flex:1, gap:14, overflow:'hidden', flexDirection: isMobile ? 'column' : 'row'}}>
      {showList && (
      <div style={{width: isMobile ? '100%' : 300, flexShrink:0, display:'flex', flexDirection:'column', gap:8, overflowY:'auto'}}>
        {purchases.length === 0 && (
          <div style={{textAlign:'center', padding:'40px', color:'var(--text-tertiary)', fontSize:13}}>{t('purchase.no_pos')}</div>
        )}
        {purchases.map(po => {
          const st = STATUS[po.status] || STATUS.draft // fallback：未知 status（舊壞資料）不再炸整頁
          return (
            <button key={po.id} onClick={()=>onSelect(po)} style={{
              ...ps.poCard,
              border: `1px solid ${selected?.id===po.id?'var(--border-mid)':'var(--border-dim)'}`,
              background: selected?.id===po.id?'var(--bg-active)':'var(--bg-raised)',
            }}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)'}}>{po.id}</span>
                <span style={{...ps.statusBadge, background:st.bg, color:st.color}}>{st.label}</span>
              </div>
              <div style={{fontWeight:600, fontSize:14, marginBottom:4}}>{po.supplierName}</div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-tertiary)'}}>
                <span>{po.date}</span>
                <span style={{fontFamily:'var(--font-mono)', color:'var(--text-primary)'}}>{fmtMoney(po.total)}</span>
              </div>
            </button>
          )
        })}
      </div>
      )}

      {showDetail && (selected ? (
        <div style={ps.detail} className="animate-in">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:10, flexWrap:'wrap'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0}}>
              {isMobile && (
                <button className="btn-icon btn-sm" onClick={()=>onSelect(null)} aria-label={t('common.back')}>
                  <ChevronLeft size={16}/>
                </button>
              )}
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)'}}>{selected.supplierName}</div>
                <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>
                  {t('purchase.po_meta', {id: selected.id, date: selected.date})}
                </div>
              </div>
            </div>
            {selected.status === 'ordered' && (
              <button className="btn btn-primary btn-sm" onClick={()=>onReceive(selected)}>
                <Truck size={14}/>{t('purchase.confirm_receive')}
              </button>
            )}
          </div>
          <div className="card" style={{overflow:'hidden', marginBottom:14}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 70px', gap:8, padding:'9px 14px', background:'var(--bg-overlay)', fontSize:11, color:'var(--text-tertiary)', letterSpacing:'.05em'}}>
              <span>{t('purchase.col_product')}</span><span style={{textAlign:'right'}}>{t('purchase.col_ordered_qty')}</span><span style={{textAlign:'right'}}>{t('purchase.col_unit_price')}</span><span style={{textAlign:'right'}}>{t('purchase.col_received_qty')}</span><span style={{textAlign:'right'}}>{t('common.subtotal')}</span>
            </div>
            {selected.items.map((item,i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 70px', gap:8, padding:'10px 14px', borderTop:'1px solid var(--border-dim)', fontSize:13, alignItems:'center'}}>
                <span style={{fontWeight:500}}>{item.name}</span>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{item.qty}</span>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-secondary)'}}>{item.unitCost}</span>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)', color: item.received===item.qty?'var(--green)':item.received>0?'var(--amber)':'var(--text-tertiary)'}}>{item.received ?? '—'}</span>
                <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:500}}>{fmtMoney(item.qty*item.unitCost)}</span>
              </div>
            ))}
            <div style={{display:'flex', justifyContent:'space-between', padding:'12px 14px', borderTop:'1px solid var(--border-mid)', fontWeight:600}}>
              <span>{t('common.total')}</span>
              <span style={{fontFamily:'var(--font-mono)', color:'var(--gold-bright)'}}>{fmtMoney(selected.total)}</span>
            </div>
          </div>
          {selected.note && <div style={{fontSize:13, color:'var(--text-secondary)', padding:'10px 14px', background:'var(--bg-overlay)', borderRadius:8}}>{t('purchase.note_line', {note: selected.note})}</div>}
        </div>
      ) : !isMobile && (
        <div style={ps.emptyDetail}>
          <Package size={32} style={{opacity:.2, marginBottom:12}}/>
          <span style={{color:'var(--text-tertiary)', fontSize:13}}>{t('purchase.select_po_hint')}</span>
        </div>
      ))}
    </div>
  )
}

// ── 新增進貨單 ──────────────────────────────────────────────
function NewPurchase({ products, suppliers, purchases, orders = [], onSave }) {
  // AI: 近 30 天每日銷售速度
  const salesVelocity = useMemo(() => computeSalesVelocity(orders, 30), [orders])
  const [supplierId, setSupplierId] = useState('')
  const [date,       setDate]       = useState(new Date().toISOString().slice(0,10))
  const [items,      setItems]      = useState([])
  const [note,       setNote]       = useState('')
  const [addProdId,  setAddProdId]  = useState('')
  const [catFilter,  setCatFilter]  = useState('all')
  const [showCamera, setShowCamera] = useState(false)
  const [camMsg,     setCamMsg]     = useState('')

  const supplier = suppliers.find(s=>s.id===supplierId)

  // 從歷史進貨單找該廠商該商品的最近單價
  function historicalPrice(productId, sid) {
    if (!sid) return null
    const sorted = (purchases || [])
      .filter(po => po.supplierId === sid)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    for (const po of sorted) {
      const found = (po.items || []).find(i => i.productId === productId)
      if (found && found.unitCost > 0) return found.unitCost
    }
    return null
  }

  // 依供應商過濾商品：選了 → 該供應商的 + 未指定供應商的；沒選 → 全部
  const filteredProducts = useMemo(() => {
    let arr = !supplierId ? products : products.filter(p => !p.supplierId || p.supplierId === supplierId)
    if (catFilter !== 'all') arr = arr.filter(p => (p.category || '未分類') === catFilter)
    return arr
  }, [products, supplierId, catFilter])

  // 該供應商有的分類清單（給 chips）
  const availableCategories = useMemo(() => {
    if (!supplierId) return []
    const supplierProds = products.filter(p => p.supplierId === supplierId)
    const set = new Set(supplierProds.map(p => p.category || '未分類'))
    // 依 DEFAULT_CATEGORIES 順序排序
    const ordered = DEFAULT_CATEGORIES.filter(c => set.has(c))
    const extra = [...set].filter(c => !DEFAULT_CATEGORIES.includes(c))
    return [...ordered, ...extra]
  }, [products, supplierId])

  // 該供應商的低庫存商品（stock <= reorderLevel，預設 reorderLevel=0 不算）
  // audit #13: 強制 Number 轉型，避免字串 reorderLevel 造成 NaN
  const lowStockForSupplier = useMemo(() => {
    if (!supplierId) return []
    return products.filter(p => p.supplierId === supplierId
      && (Number(p.reorderLevel) || 0) > 0
      && (Number(p.stock) || 0) <= (Number(p.reorderLevel) || 0)
      && (catFilter === 'all' || (p.category || '未分類') === catFilter))
  }, [products, supplierId, catFilter])

  function addItem(prodId) {
    const id = prodId || addProdId
    const p = products.find(x => x.id === id)
    if (!p || items.find(i => i.productId === p.id)) return
    const histPrice = historicalPrice(p.id, supplierId)
    const dailyAvg = salesVelocity.get(p.id) || 0
    // AI 建議：基於近 30 天日均 + 14 天供貨週期；若無銷售資料則回退到 reorderLevel × 2
    let suggestedQty, aiUsed = false
    if (dailyAvg > 0) {
      suggestedQty = suggestReorderQty(p, dailyAvg, 14).suggested
      aiUsed = true
    } else {
      const reorder = Number(p.reorderLevel) || 0
      const stock = Number(p.stock) || 0
      suggestedQty = reorder > 0 ? Math.max(1, reorder * 2 - stock) : 1
    }
    setItems(prev => [...prev, {
      productId: p.id,
      name: p.name,
      qty: suggestedQty,
      unitCost: histPrice || Number(p.cost) || 0,
      received: 0,
      _fromHistory: !!histPrice,
      _aiSuggested: aiUsed,
      _dailyAvg: dailyAvg,
    }])
    setAddProdId('')
  }

  function fillLowStock() {
    if (!supplierId) return
    const toAdd = lowStockForSupplier.filter(p => !items.find(i => i.productId === p.id))
    if (toAdd.length === 0) return
    const newItems = toAdd.map(p => {
      const histPrice = historicalPrice(p.id, supplierId)
      const dailyAvg = salesVelocity.get(p.id) || 0
      let suggestedQty, aiUsed = false
      if (dailyAvg > 0) {
        suggestedQty = suggestReorderQty(p, dailyAvg, 14).suggested
        aiUsed = true
      } else {
        const reorder = Number(p.reorderLevel) || 0
        const stock = Number(p.stock) || 0
        suggestedQty = Math.max(1, reorder * 2 - stock)
      }
      return {
        productId: p.id,
        name: p.name,
        qty: suggestedQty,
        unitCost: histPrice || Number(p.cost) || 0,
        received: 0,
        _fromHistory: !!histPrice,
        _autoFilled: true,
        _aiSuggested: aiUsed,
        _dailyAvg: dailyAvg,
      }
    })
    setItems(prev => [...prev, ...newItems])
  }

  function updateItem(i, key, val) {
    // audit #12: qty 至少 1，避免 qty=0 通過驗證造成空進貨單
    const num = parseFloat(val) || 0
    const safe = key === 'qty' ? Math.max(1, num) : num
    setItems(prev=>prev.map((it,idx)=>idx===i?{...it,[key]:safe}:it))
  }

  const total = items.reduce((s,i)=>s+i.qty*i.unitCost,0)
  const unaddedLow = lowStockForSupplier.filter(p => !items.find(i => i.productId === p.id)).length

  function handleSave() {
    if (!supplierId || items.length===0) return
    // audit #11: 防 supplier 同步被改造成 undefined（race condition）
    if (!supplier) return
    // audit #12: 過濾掉 qty<=0 的品項
    const validItems = items.filter(i => i.qty > 0 && i.unitCost >= 0)
    if (validItems.length === 0) return
    const po = {
      id: 'PO' + Date.now(), supplierId, supplierName: supplier.name || '',
      status:'ordered', date, receivedDate:null,
      items: validItems.map(({_fromHistory, _autoFilled, _aiSuggested, _dailyAvg, ...rest}) => rest),
      note, total: validItems.reduce((s,i)=>s+i.qty*i.unitCost,0),
    }
    onSave(po)
  }

  return (
    <div style={{maxWidth:780, display:'flex', flexDirection:'column', gap:16, overflowY:'auto', height:'100%'}}>
      <div style={np.topGrid}>
        <div>
          <FL>{t('purchase.supplier')} *</FL>
          <select className="field" value={supplierId} onChange={e=>{setSupplierId(e.target.value);setAddProdId('')}} style={{cursor:'pointer'}}>
            <option value="">{t('purchase.choose_supplier')}</option>
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <FL>{t('purchase.order_date')}</FL>
          <input type="date" className="field" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
      </div>

      {supplier && (
        <div style={{fontSize:12, color:'var(--text-secondary)', background:'var(--bg-overlay)', borderRadius:8, padding:'10px 14px'}}>
          📞 {supplier.contact} · {supplier.payTerms}{supplier.note ? ` · ${supplier.note}` : ''}
          <div style={{marginTop:4, color:'var(--text-tertiary)', fontSize:11}}>
            {t('purchase.supplier_products_count', {count: products.filter(p=>p.supplierId===supplierId).length})}
            {lowStockForSupplier.length > 0 && (
              <span style={{color:'var(--amber)', marginLeft:8}}>
                {t('purchase.low_stock_count', {count: lowStockForSupplier.length})}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 分類篩選 chips（只在選了供應商且有多個分類時顯示）*/}
      {supplierId && availableCategories.length > 0 && (
        <div>
          <FL>{t('purchase.category_filter')}</FL>
          <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
            <button
              onClick={()=>setCatFilter('all')}
              style={{
                fontSize:12, padding:'5px 11px', borderRadius:14,
                background: catFilter==='all' ? 'var(--gold-dim)' : 'var(--bg-overlay)',
                color: catFilter==='all' ? 'var(--gold)' : 'var(--text-secondary)',
                border:`1px solid ${catFilter==='all' ? 'var(--gold)' : 'var(--border-dim)'}`,
                fontWeight: catFilter==='all' ? 600 : 400,
              }}
            >
              {t('common.all')}
            </button>
            {availableCategories.map(c => (
              <button
                key={c}
                onClick={()=>setCatFilter(c)}
                style={{
                  fontSize:12, padding:'5px 11px', borderRadius:14,
                  background: catFilter===c ? 'var(--gold-dim)' : 'var(--bg-overlay)',
                  color: catFilter===c ? 'var(--gold)' : 'var(--text-secondary)',
                  border:`1px solid ${catFilter===c ? 'var(--gold)' : 'var(--border-dim)'}`,
                  fontWeight: catFilter===c ? 600 : 400,
                }}
              >
                {CATEGORY_META[c]?.icon || '📦'} {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 一鍵補貨 */}
      {supplierId && unaddedLow > 0 && (
        <button
          onClick={fillLowStock}
          style={{
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
            padding:'14px 16px', borderRadius:'var(--r3)',
            background:'linear-gradient(135deg, var(--amber-dim), var(--gold-dim))',
            border:'1px solid var(--amber)', cursor:'pointer', textAlign:'left',
            width:'100%',
          }}
        >
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <Zap size={18} style={{color:'var(--amber)'}}/>
            <div>
              <div style={{fontWeight:600, fontSize:14, color:'var(--text-primary)'}}>
                {t('purchase.fill_low_title')}{catFilter !== 'all' && `（${catFilter}）`}
              </div>
              <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:2}}>{t('purchase.fill_low_desc', {count: unaddedLow})}</div>
            </div>
          </div>
          <ChevronRight size={18} style={{color:'var(--amber)'}}/>
        </button>
      )}

      <div>
        <FL>{t('purchase.add_product')} {supplierId && t('purchase.limited_to', {name: supplier?.name})}</FL>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={()=>setShowCamera(true)}
            disabled={!supplierId}
            title={t('purchase.scan_tooltip')}
          >
            <Camera size={14}/>{t('purchase.scan_barcode')}
          </button>
          <select
            className="field"
            value={addProdId}
            onChange={e=>setAddProdId(e.target.value)}
            disabled={!supplierId}
            style={{cursor:'pointer', flex:1, minWidth:200}}
          >
            <option value="">— {supplierId ? t('purchase.select_product') : t('purchase.select_supplier_first')} —</option>
            {/* 依分類分組，用 optgroup */}
            {groupByCategory(filteredProducts.filter(p=>!items.find(i=>i.productId===p.id))).map(g => (
              <optgroup key={g.category} label={`${CATEGORY_META[g.category]?.icon || '📦'} ${g.category}（${g.products.length}）`}>
                {g.products.map(p => {
                  const low = (Number(p.reorderLevel) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.reorderLevel) || 0)
                  return (
                    <option key={p.id} value={p.id}>
                      {low ? '⚠ ' : ''}{p.reorderLevel
                        ? t('purchase.opt_stock_safe', {name: p.name, stock: p.stock, safe: p.reorderLevel})
                        : t('purchase.opt_stock', {name: p.name, stock: p.stock})}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={()=>addItem()} disabled={!addProdId}>
            <Plus size={14}/>{t('purchase.add_btn')}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="card" style={{overflow:'auto'}}>
          <div style={np.itemsHead}>
            <span>{t('purchase.col_product')}</span><span style={{textAlign:'right'}}>{t('common.qty')}</span><span style={{textAlign:'right'}}>{t('purchase.col_unit_price')}</span><span style={{textAlign:'right'}}>{t('common.subtotal')}</span><span/>
          </div>
          {items.map((item,i)=>{
            const daysOfStock = item._dailyAvg > 0 ? (item.qty / item._dailyAvg).toFixed(0) : null
            return (
            <div key={i} style={np.itemRow}>
              <div>
                <div style={{fontSize:13, fontWeight:500}}>{item.name}</div>
                <div style={{display:'flex', gap:6, marginTop:2, flexWrap:'wrap'}}>
                  {item._fromHistory && <span style={{fontSize:10, color:'var(--blue)', background:'var(--blue-dim)', padding:'1px 6px', borderRadius:4}}>{t('purchase.badge_hist_price')}</span>}
                  {item._autoFilled && <span style={{fontSize:10, color:'var(--amber)', background:'var(--amber-dim)', padding:'1px 6px', borderRadius:4}}>{t('purchase.badge_auto')}</span>}
                  {item._aiSuggested && <span style={{fontSize:10, color:'var(--purple)', background:'var(--purple-dim)', padding:'1px 6px', borderRadius:4}}>{t('purchase.badge_ai')}</span>}
                  {daysOfStock && <span style={{fontSize:10, color:'var(--text-tertiary)'}}>{t('purchase.days_of_stock', {days: daysOfStock})}</span>}
                </div>
              </div>
              <input type="number" inputMode="numeric" className="field" value={item.qty} min={1} onChange={e=>updateItem(i,'qty',e.target.value)} style={{textAlign:'right', padding:'6px 8px', fontFamily:'var(--font-mono)', fontSize:13}}/>
              <input type="number" inputMode="numeric" className="field" value={item.unitCost} min={0} onChange={e=>updateItem(i,'unitCost',e.target.value)} style={{textAlign:'right', padding:'6px 8px', fontFamily:'var(--font-mono)', fontSize:13}}/>
              <span style={{textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13}}>{fmtMoney(item.qty*item.unitCost)}</span>
              <button className="btn-icon btn-sm" style={{color:'var(--red)'}} onClick={()=>setItems(prev=>prev.filter((_,idx)=>idx!==i))}><X size={13}/></button>
            </div>
          )})}
          <div style={{display:'flex', justifyContent:'space-between', padding:'12px 14px', borderTop:'1px solid var(--border-mid)', fontWeight:600}}>
            <span>{t('common.total')}</span>
            <span style={{fontFamily:'var(--font-mono)', color:'var(--gold-bright)'}}>{fmtMoney(total)}</span>
          </div>
        </div>
      )}

      <div>
        <FL>{t('common.notes')}</FL>
        <input className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder={t('purchase.optional_ph')}/>
      </div>

      <button className="btn btn-primary" style={{width:'100%', padding:13}} disabled={!supplierId||items.length===0} onClick={handleSave}>
        <Check size={16}/>{t('purchase.create_po')}
      </button>

      {camMsg && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background: camMsg.startsWith('✗') ? 'var(--red-dim)' : 'var(--green-dim)',
          color: camMsg.startsWith('✗') ? 'var(--red)' : 'var(--green)',
          border:`1px solid ${camMsg.startsWith('✗') ? 'var(--red)' : 'var(--green)'}`,
          padding:'8px 14px', borderRadius:8, fontSize:13, zIndex:Z.TOAST,
        }}>{camMsg}</div>
      )}

      {showCamera && (
        <Suspense fallback={null}>
        <BarcodeScannerModal
          title={t('purchase.scan_modal_title')}
          mode="continuous"
          onScan={(code) => {
            const p = products.find(x => x.barcode === code)
            if (!p) {
              setCamMsg(t('purchase.cam_not_found', {code}))
              setTimeout(()=>setCamMsg(''), 2500)
              return 'keep'
            }
            if (p.supplierId && p.supplierId !== supplierId) {
              setCamMsg(t('purchase.cam_other_supplier', {name: p.name}))
              setTimeout(()=>setCamMsg(''), 2500)
              return 'keep'
            }
            if (items.find(i => i.productId === p.id)) {
              setCamMsg(t('purchase.cam_already', {name: p.name}))
              setTimeout(()=>setCamMsg(''), 1500)
              return 'keep'
            }
            addItem(p.id)
            setCamMsg(t('purchase.cam_added', {name: p.name}))
            setTimeout(()=>setCamMsg(''), 1500)
            return 'keep'
          }}
          onClose={()=>setShowCamera(false)}
        />
        </Suspense>
      )}
    </div>
  )
}

const np = {
  topGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 },
  itemsHead: { display:'grid', gridTemplateColumns:'minmax(140px,1fr) 80px 90px 80px 36px', gap:8, padding:'9px 14px', background:'var(--bg-overlay)', fontSize:11, color:'var(--text-tertiary)', letterSpacing:'.05em', minWidth:480 },
  itemRow: { display:'grid', gridTemplateColumns:'minmax(140px,1fr) 80px 90px 80px 36px', gap:8, padding:'9px 14px', borderTop:'1px solid var(--border-dim)', alignItems:'center', minWidth:480 },
}

// ── 確認到貨 Modal ──────────────────────────────────────────
function ReceiveModal({ po, products, onConfirm, onClose }) {
  const [qtys, setQtys] = useState(() => {
    const m = {}
    po.items.forEach(i => { m[i.productId] = i.qty })
    return m
  })

  return (
    <Modal maxWidth={560}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
          <div>
            <div style={{fontWeight:700, fontSize:15, fontFamily:'var(--font-serif)'}}>{t('purchase.confirm_receive')}</div>
            <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:2}}>{po.supplierName} · {po.id}</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <p style={{fontSize:13, color:'var(--text-secondary)', marginBottom:16}}>{t('purchase.receive_hint')}</p>
        {po.items.map(item => {
          const current = products.find(p=>p.id===item.productId)?.stock || 0
          return (
            <div key={item.productId} style={{display:'grid', gridTemplateColumns:'1fr 70px 80px', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border-dim)', alignItems:'center'}}>
              <div>
                <div style={{fontSize:13, fontWeight:500}}>{item.name}</div>
                <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{t('purchase.current_stock', {stock: current})}</div>
              </div>
              <div style={{textAlign:'right', fontSize:12, color:'var(--text-secondary)'}}>{t('purchase.ordered_qty_short', {qty: item.qty})}</div>
              <input
                type="number" inputMode="numeric" min={0} max={item.qty * 2}
                className="field"
                value={qtys[item.productId] ?? item.qty}
                onChange={e=>setQtys(q=>({...q,[item.productId]:parseInt(e.target.value)||0}))}
                style={{textAlign:'right', fontFamily:'var(--font-mono)', padding:'8px 10px'}}
              />
            </div>
          )
        })}
        <div style={{marginTop:16, padding:'10px 12px', background:'var(--green-dim)', borderRadius:8, fontSize:12, color:'var(--green)'}}>
          {t('purchase.receive_note')}
        </div>
        <div style={{display:'flex', gap:10, marginTop:16}}>
          <button className="btn btn-primary" style={{flex:1, padding:12}} onClick={()=>onConfirm(qtys)}>
            <CheckCircle size={15}/>{t('purchase.confirm_receive')}
          </button>
          <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t('common.cancel')}</button>
        </div>
    </Modal>
  )
}

// ── 供應商管理（含商品清單展開）──────────────────────────────
function SupplierList({ suppliers, products = [], onAdd, onUpdate, onGoInventory }) {
  const [editing, setEditing] = useState(null)
  const [form,    setForm]    = useState({ name:'', contact:'', payTerms:'', note:'' })
  const [expanded, setExpanded] = useState(null) // 展開哪一家看商品

  function save() {
    if (!form.name) return
    const clean = sanitizeObject(form)
    if (editing === 'new') onAdd(clean)
    else onUpdate(editing, clean)
    setEditing(null)
  }

  function productsOf(supplierId) {
    return products.filter(p => p.supplierId === supplierId)
  }

  return (
    <div style={{maxWidth:760, width:'100%', overflowY:'auto'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <div style={{fontSize:12, color:'var(--text-tertiary)'}}>
          {t('purchase.suppliers_summary', {count: suppliers.length, assigned: products.filter(p=>p.supplierId).length})}
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>{setEditing('new');setForm({name:'',contact:'',payTerms:'',note:''})}}>
          <Plus size={14}/>{t('purchase.add_supplier')}
        </button>
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {suppliers.length === 0 && (
          <div className="card" style={{textAlign:'center', padding:'40px', color:'var(--text-tertiary)', fontSize:13}}>
            {t('purchase.no_suppliers')}
          </div>
        )}
        {suppliers.map(s => {
          const supplierProducts = productsOf(s.id)
          const isOpen = expanded === s.id
          const groups = isOpen ? groupByCategory(supplierProducts) : []

          return (
            <div key={s.id} className="card" style={{overflow:'hidden'}}>
              {/* 卡片頭：供應商基本資料 */}
              <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                <div style={{flex:1, minWidth:200}}>
                  <div style={{fontWeight:600, fontSize:14}}>{s.name}</div>
                  <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:3}}>
                    📞 {s.contact || '—'} · {s.payTerms || '—'}
                    {s.note && <span style={{color:'var(--text-tertiary)'}}> · {s.note}</span>}
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    style={{
                      display:'flex', alignItems:'center', gap:5,
                      padding:'5px 10px', borderRadius:6, fontSize:12,
                      background: isOpen ? 'var(--bg-active)' : 'var(--bg-overlay)',
                      color: 'var(--text-secondary)',
                      border:'1px solid var(--border-dim)',
                    }}
                  >
                    <Package size={12}/>
                    {t('purchase.n_products', {count: supplierProducts.length})}
                    <ChevronDown size={12} style={{transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms'}}/>
                  </button>
                  <button className="btn-icon btn-sm" onClick={()=>{setEditing(s.id);setForm(s)}} title={t('common.edit')}>
                    <Pencil size={13}/>
                  </button>
                </div>
              </div>

              {/* 展開：商品按分類分組 */}
              {isOpen && (
                <div style={{borderTop:'1px solid var(--border-dim)', padding:'12px 16px', background:'var(--bg-overlay)'}}>
                  {supplierProducts.length === 0 ? (
                    <div style={{textAlign:'center', padding:'20px 0', color:'var(--text-tertiary)', fontSize:12}}>
                      {t('purchase.no_supplier_products')}
                      {onGoInventory && (
                        <div style={{marginTop:8}}>
                          <button className="btn btn-ghost btn-sm" onClick={onGoInventory}>
                            {t('purchase.go_inventory')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : groups.map(g => (
                    <div key={g.category} style={{marginBottom:10}}>
                      <div style={{
                        fontSize:11, fontWeight:600, color:'var(--text-tertiary)',
                        letterSpacing:'.05em', marginBottom:6,
                        display:'flex', alignItems:'center', gap:6,
                      }}>
                        <span>{CATEGORY_META[g.category]?.icon || '📦'}</span>
                        <span>{g.category}</span>
                        <span style={{fontFamily:'var(--font-mono)', fontWeight:400}}>· {g.products.length}</span>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:6}}>
                        {g.products.map(p => {
                          const reorder = Number(p.reorderLevel) || 0
                          const stock = Number(p.stock) || 0
                          const low = reorder > 0 && stock <= reorder
                          return (
                            <div key={p.id} style={{
                              padding:'8px 10px',
                              borderRadius:6,
                              background:'var(--bg-raised)',
                              border:`1px solid ${low ? 'var(--amber)' : 'var(--border-dim)'}`,
                              fontSize:12,
                            }}>
                              <div style={{fontWeight:500, marginBottom:2}}>{p.name}</div>
                              <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-tertiary)'}}>
                                <span>{reorder ? t('purchase.card_stock_safe', {stock, safe: reorder}) : t('purchase.card_stock', {stock})}</span>
                                <span style={{fontFamily:'var(--font-mono)'}}>{p.cost ? fmtMoney(p.cost) : '—'}</span>
                              </div>
                              {low && <div style={{fontSize:10, color:'var(--amber)', marginTop:2}}>{t('purchase.restock_flag')}</div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal maxWidth={400}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:18}}>
              <span style={{fontWeight:700}}>{editing==='new'?t('purchase.add_supplier'):t('purchase.edit_supplier')}</span>
              <button className="btn-icon" onClick={()=>setEditing(null)}><X size={16}/></button>
            </div>
            {[['name',`${t('common.name')} *`],['contact',t('purchase.contact')],['payTerms',t('purchase.pay_terms')],['note',t('common.notes')]].map(([k,l])=>(
              <div key={k} style={{marginBottom:12}}>
                <FL>{l}</FL>
                <input className="field" value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={l}/>
              </div>
            ))}
            <div style={{display:'flex', gap:10, marginTop:4}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={save}><Check size={15}/>{t('common.save')}</button>
              <button className="btn btn-ghost"   style={{flex:1}} onClick={()=>setEditing(null)}>{t('common.cancel')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}

function FL({children}){return <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:5,letterSpacing:'.03em'}}>{children}</div>}

function PayableTab({ purchases, suppliers, onMarkPaid }) {
  // 已收貨但未付款 = 應付帳款
  const unpaid = purchases.filter(p => p.status === 'received' && !p.paidDate)
  const paid = purchases.filter(p => p.paidDate)

  // 依供應商彙總
  const bySupplier = {}
  unpaid.forEach(p => {
    const sid = p.supplierId || p.supplierName || '未指定' // 分組用內部鍵值，非顯示字串
    if (!bySupplier[sid]) bySupplier[sid] = { name: p.supplierName || t('purchase.unassigned'), total: 0, count: 0, items: [] }
    bySupplier[sid].total += p.total
    bySupplier[sid].count += 1
    bySupplier[sid].items.push(p)
  })
  const supplierList = Object.values(bySupplier).sort((a,b) => b.total - a.total)
  const totalUnpaid = unpaid.reduce((s,p) => s + p.total, 0)

  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 0'}}>
      <div className="card" style={{padding:'18px 20px', marginBottom:14, borderTop:'2px solid var(--red)'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <span style={{fontSize:12, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'.05em'}}>{t('purchase.unpaid_total')}</span>
          <span style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600, color:'var(--red)'}}>{fmtMoney(totalUnpaid)}</span>
        </div>
        <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:4}}>
          {t('purchase.unpaid_summary', {count: unpaid.length, suppliers: supplierList.length})}
        </div>
      </div>

      {supplierList.length === 0 ? (
        <div className="card" style={{padding:'40px 20px', textAlign:'center', color:'var(--text-tertiary)'}}>
          {t('purchase.no_unpaid')}
        </div>
      ) : supplierList.map((s, i) => (
        <div key={i} className="card" style={{padding:'18px 20px', marginBottom:10}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div>
              <div style={{fontSize:14, fontWeight:600}}>{s.name}</div>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:2}}>{t('purchase.unpaid_count', {count: s.count})}</div>
            </div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:'var(--red)'}}>
              {fmtMoney(s.total)}
            </div>
          </div>
          <table style={{width:'100%', fontSize:13}}>
            <tbody>
              {s.items.map(p => (
                <tr key={p.id} style={{borderTop:'1px solid var(--border-dim)'}}>
                  <td style={{padding:'8px 4px'}}>{p.id}</td>
                  <td style={{padding:'8px 4px', color:'var(--text-tertiary)'}}>{p.receivedDate || p.date}</td>
                  <td style={{padding:'8px 4px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:500}}>
                    {fmtMoney(p.total)}
                  </td>
                  <td style={{padding:'8px 4px', textAlign:'right'}}>
                    <button className="btn btn-primary btn-sm" onClick={()=>{ if(confirm(t('purchase.confirm_paid', {id: p.id}))) onMarkPaid(p.id) }}>{t('purchase.mark_paid')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {paid.length > 0 && (
        <details style={{marginTop:14}}>
          <summary style={{cursor:'pointer', padding:'10px 16px', fontSize:13, color:'var(--text-secondary)'}}>
            {t('purchase.paid_history', {count: paid.length})}
          </summary>
          <div className="card" style={{padding:'12px 16px', marginTop:8}}>
            <table style={{width:'100%', fontSize:12}}>
              <thead>
                <tr style={{color:'var(--text-tertiary)'}}>
                  <th style={{textAlign:'left', padding:'6px 4px'}}>{t('purchase.th_po')}</th>
                  <th style={{textAlign:'left', padding:'6px 4px'}}>{t('purchase.supplier')}</th>
                  <th style={{textAlign:'left', padding:'6px 4px'}}>{t('purchase.th_paid_date')}</th>
                  <th style={{textAlign:'right', padding:'6px 4px'}}>{t('purchase.th_amount')}</th>
                </tr>
              </thead>
              <tbody>
                {paid.slice(0,30).map(p => (
                  <tr key={p.id} style={{borderTop:'1px solid var(--border-dim)'}}>
                    <td style={{padding:'6px 4px'}}>{p.id}</td>
                    <td style={{padding:'6px 4px'}}>{p.supplierName}</td>
                    <td style={{padding:'6px 4px', color:'var(--text-tertiary)'}}>{p.paidDate}</td>
                    <td style={{padding:'6px 4px', textAlign:'right', fontFamily:'var(--font-mono)'}}>{fmtMoney(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

const ps = {
  root:{display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:14,overflow:'hidden'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0,flexWrap:'wrap',gap:10},
  title:{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600},
  poCard:{display:'flex',flexDirection:'column',borderRadius:'var(--r3)',padding:'13px 15px',textAlign:'left',cursor:'pointer',transition:'all 150ms',width:'100%'},
  statusBadge:{fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:500},
  detail:{flex:1,overflowY:'auto'},
  emptyDetail:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'},
}
