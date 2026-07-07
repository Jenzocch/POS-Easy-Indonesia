import { useState } from 'react'
import { Trash2, Plus, Minus, User, X, CreditCard, Banknote, Check, ChevronRight, Gift, Printer, Pause, Percent, Wallet, Receipt, ShoppingCart } from 'lucide-react'
import { t, fmtMoney } from '../i18n'

export default function CartPanel({
  cart, cartSubtotal, activeMember,
  onUpdateQty, onRemove, onClear, onCheckout, onFindMember,
  onSelectMember, // 選取 / 移除會員（取代過去把 _select 掛在 onFindMember 上的反模式）
  onUpdatePrice, // 改價
  onHold,        // 掛單
  pointsRule = { earn: 10, redeem: 1 },
  manualDiscount = 0, setManualDiscount,
}) {
  const [stage, setStage]       = useState('cart')   // cart | member | pay | done
  const [payMethod, setPayMethod] = useState('cash')
  const [paidInput, setPaidInput] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [pointsUsed, setPointsUsed] = useState(0)
  const [balanceUsed, setBalanceUsed] = useState(0)
  const [lastOrder, setLastOrder] = useState(null)
  const [memberError, setMemberError] = useState('')
  const [taxId, setTaxId] = useState('')
  const [splitMode, setSplitMode] = useState(false) // 混合付款
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [showHoldDlg, setShowHoldDlg] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [priceInput, setPriceInput] = useState('')

  // 點數折抵：1 點 = redeem 元
  const redeemRate = pointsRule.redeem || 1
  const earnRate = pointsRule.earn || 10
  const maxPointsByCart = Math.min(activeMember?.points || 0, Math.floor(cartSubtotal / redeemRate))
  const pointsDiscount = pointsUsed * redeemRate
  const totalDiscount = pointsDiscount + (manualDiscount || 0) + balanceUsed
  const total = Math.max(0, cartSubtotal - totalDiscount)
  const paid = parseFloat(paidInput) || 0
  const change = paid - total
  const pointsEarned = Math.floor(total / earnRate)
  const memberBalance = activeMember?.balance || 0

  const splitCashAmt = parseFloat(splitCash) || 0
  const splitCardAmt = parseFloat(splitCard) || 0
  const splitTotal = splitCashAmt + splitCardAmt
  const splitOK = Math.abs(splitTotal - total) < 0.01

  function handleFindMember() {
    const m = onFindMember(memberQuery)
    if (m) { onSelectMember(m); setMemberError(''); setMemberQuery('') }
    else setMemberError(t('pos.member_not_found'))
  }

  function handleCheckout() {
    if (splitMode) {
      if (!splitOK) return
      const order = onCheckout('mixed', total, pointsUsed, {
        taxId,
        payments: [
          ...(splitCashAmt > 0 ? [{ method: 'cash', amount: splitCashAmt }] : []),
          ...(splitCardAmt > 0 ? [{ method: 'card', amount: splitCardAmt }] : []),
        ],
        manualDiscountAmt: manualDiscount,
        balanceUsed,
      })
      if (order) {
        setLastOrder(order); setStage('done')
        setPointsUsed(0); setPaidInput(''); setBalanceUsed(0)
        setSplitMode(false); setSplitCash(''); setSplitCard(''); setTaxId('')
      }
      return
    }
    if (payMethod === 'cash' && paid < total) return
    const order = onCheckout(payMethod, paid, pointsUsed, {
      taxId,
      manualDiscountAmt: manualDiscount,
      balanceUsed,
    })
    if (order) {
      setLastOrder(order); setStage('done')
      setPointsUsed(0); setPaidInput(''); setBalanceUsed(0); setTaxId('')
    }
  }

  function reset() {
    setLastOrder(null); setStage('cart')
    setMemberQuery(''); setMemberError('')
  }

  function handleHold() {
    if (!cart.length) return
    if (onHold) onHold(holdLabel)
    setShowHoldDlg(false); setHoldLabel('')
  }

  function startEditPrice(item) {
    setEditingPriceId(item.id)
    setPriceInput(String(item.price))
  }
  function commitEditPrice(item) {
    const n = parseFloat(priceInput)
    if (!isNaN(n) && n >= 0 && onUpdatePrice) onUpdatePrice(item.id, n)
    setEditingPriceId(null); setPriceInput('')
  }

  // UX-01: 現金快捷面額改用 Rupiah 動態進位 —— 應收金額本身 + 進位到 5.000/10.000 常用鈔票
  // 面額，外加固定大鈔（20.000/50.000/100.000），只保留 >= 應收的金額（避免找零為負）。
  // 目前硬編印尼面額；未來多市場需改為讀 market profile 的貨幣面額表。
  const ceilTo = (v, step) => Math.ceil(v / step) * step
  const quickAmounts = [total, ceilTo(total, 5000), ceilTo(total, 10000), 20000, 50000, 100000]
    .filter((v,i,a) => v >= total && v > 0 && a.indexOf(v)===i).sort((a,b)=>a-b).slice(0,5)

  // ===== Done stage =====
  if (stage === 'done' && lastOrder) return (
    <div style={cs.panel}>
      <div style={cs.doneWrap}>
        <div style={cs.doneCheck}><Check size={28} strokeWidth={2.5} /></div>
        <div style={{fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:6}}>{t('pos.checkout_done')}</div>
        {/* UX-02: 現金找零是收銀員結帳後唯一要做的動作，設為主角（大字綠色）；總額退為輔助小字。
            非現金或無找零時，總額維持原本主顯示。 */}
        {lastOrder.payMethod === 'cash' && lastOrder.change > 0 ? (
          <>
            <div style={{fontSize:12, color:'var(--text-secondary)', marginBottom:2}}>{t('pos.change')}</div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:40, fontWeight:700, letterSpacing:'-.02em', color:'var(--green)', lineHeight:1.1, marginBottom:6}}>
              {fmtMoney(lastOrder.change)}
            </div>
            <div style={{fontSize:13, color:'var(--text-tertiary)'}}>
              {t('pos.total')} <span style={{fontFamily:'var(--font-mono)'}}>{fmtMoney(lastOrder.total)}</span>
            </div>
          </>
        ) : (
          <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:500, letterSpacing:'-.02em', marginBottom:4}}>
            {fmtMoney(lastOrder.total)}
          </div>
        )}
        {lastOrder.payMethod === 'mixed' && lastOrder.payments?.length > 0 && (
          <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:6}}>
            {lastOrder.payments.map((p,i) => (
              <span key={i}>{i>0?' · ':''}{p.method === 'cash' ? t('pos.cash') : t('pos.digital_short')} {fmtMoney(p.amount)}</span>
            ))}
          </div>
        )}
        {lastOrder.taxId && (
          <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:4}}>{t('pos.tax_id_display', { taxId: lastOrder.taxId })}</div>
        )}
        {lastOrder.pointsEarned > 0 && (
          <div style={{marginTop:12, background:'var(--gold-dim)', borderRadius:8, padding:'8px 14px', fontSize:12, color:'var(--gold-bright)', display:'flex', alignItems:'center', gap:6}}>
            <Gift size={13}/> {t('pos.points_earned_msg', { n: lastOrder.pointsEarned })}
          </div>
        )}
        <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:12}}>{t('pos.order_no', { id: lastOrder.id })}</div>
        {window.electronAPI && (
          <button className="btn btn-ghost btn-sm"
            style={{marginTop:12, display:'flex', alignItems:'center', gap:6, justifyContent:'center', width:'100%'}}
            onClick={() => window.electronAPI.printer.printReceipt(lastOrder).catch(() => {})}>
            <Printer size={14}/> {t('pos.print_receipt')}
          </button>
        )}
      </div>
      <div style={cs.stageFooter}>
        <button className="btn btn-primary" style={{width:'100%', padding:14}} onClick={reset}>{t('pos.continue_sale')}</button>
      </div>
    </div>
  )

  // ===== Pay stage =====
  if (stage === 'pay') return (
    <div style={cs.panel}>
      <div style={cs.panelHeader}>
        <span style={{fontWeight:600}}>{t('pos.confirm_payment')}</span>
        <button className="btn-icon" onClick={() => setStage('cart')}><X size={16}/></button>
      </div>
      <div style={cs.stageContent}>
        {/* 點數折抵 */}
        {activeMember && maxPointsByCart > 0 && (
          <div style={cs.pointsBox}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <div style={{fontSize:12, color:'var(--text-secondary)'}}>
                <Gift size={12} style={{marginRight:4, verticalAlign:'middle'}}/>
                {t('pos.member_points', { name: activeMember.name, points: activeMember.points })}
              </div>
              <button onClick={() => setPointsUsed(p => p > 0 ? 0 : maxPointsByCart)} style={{fontSize:11, color:'var(--gold)', background:'none'}}>
                {pointsUsed > 0 ? t('pos.cancel_redeem') : t('pos.redeem_all')}
              </button>
            </div>
            {pointsUsed > 0 && (
              <div style={{fontSize:12, color:'var(--gold)'}}>{t('pos.redeem_line', { n: pointsUsed, amt: fmtMoney(pointsDiscount) })}</div>
            )}
          </div>
        )}

        {/* 會員儲值 */}
        {activeMember && memberBalance > 0 && (
          <div style={{...cs.pointsBox, background:'var(--teal-dim)', borderColor:'var(--teal-dim)'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <div style={{fontSize:12, color:'var(--text-secondary)'}}>
                <Wallet size={12} style={{marginRight:4, verticalAlign:'middle'}}/>
                {t('pos.balance')} {fmtMoney(memberBalance)}
              </div>
              <button onClick={() => {
                const max = Math.min(memberBalance, cartSubtotal - pointsDiscount - manualDiscount)
                setBalanceUsed(p => p > 0 ? 0 : Math.max(0, max))
              }} style={{fontSize:11, color:'var(--teal)', background:'none'}}>
                {balanceUsed > 0 ? t('pos.cancel_use') : t('pos.use_all')}
              </button>
            </div>
            {balanceUsed > 0 && (
              <div style={{fontSize:12, color:'var(--teal)'}}>{t('pos.balance_used_line', { amt: fmtMoney(balanceUsed) })}</div>
            )}
          </div>
        )}

        <div style={cs.totalDisplay}>
          <div style={{fontSize:11, color:'var(--accent-deep)', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:6}}>{t('pos.amount_due')}</div>
          {totalDiscount > 0 && (
            <div style={{fontSize:13, color:'var(--text-tertiary)', textDecoration:'line-through', fontFamily:'var(--font-mono)', marginBottom:4}}>
              {fmtMoney(cartSubtotal)}
            </div>
          )}
          <div style={{
            fontFamily:'var(--font-mono)', fontSize:38, fontWeight:800,
            letterSpacing:'-.03em',
            background:'var(--accent-grad)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
            backgroundClip:'text',
            lineHeight:1.1,
          }}>
            {fmtMoney(total)}
          </div>
          {pointsEarned > 0 && (
            <div style={{fontSize:12, color:'var(--gold-bright)', marginTop:8, fontWeight:600, display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', background:'var(--gold-dim)', borderRadius:'var(--r-pill)'}}>
              <Gift size={11}/> {t('pos.plus_points', { n: pointsEarned })}
            </div>
          )}
        </div>

        {/* 付款方式切換 */}
        <div style={{display:'flex', gap:8, marginBottom:12}}>
          {[['cash',t('pos.cash'),Banknote],['card',t('pos.card'),CreditCard]].map(([k,l,Icon])=>(
            <button key={k} onClick={()=>{setPayMethod(k); setSplitMode(false)}} style={{...cs.methodBtn,
              background: !splitMode && payMethod===k?'var(--gold)':'var(--bg-overlay)',
              color: !splitMode && payMethod===k?'#fff':'var(--text-secondary)',
              border:`1px solid ${!splitMode && payMethod===k?'var(--gold)':'var(--border-subtle)'}`,
            }}>
              <Icon size={15}/>{l}
            </button>
          ))}
          <button onClick={()=>setSplitMode(v => !v)} style={{...cs.methodBtn,
            background: splitMode?'var(--gold)':'var(--bg-overlay)',
            color: splitMode?'#fff':'var(--text-secondary)',
            border:`1px solid ${splitMode?'var(--gold)':'var(--border-subtle)'}`,
            flex:'0 0 auto', padding:'10px 12px',
          }} title={t('pos.mixed_payment')}>
            ＋
          </button>
        </div>

        {/* 混合付款 */}
        {splitMode && (
          <div style={{padding:'12px 14px', background:'var(--bg-overlay)', borderRadius:8, marginBottom:12}}>
            <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:6}}>{t('pos.split_payment')}</div>
            <div style={{display:'flex', gap:6, marginBottom:6, alignItems:'center'}}>
              <Banknote size={14} style={{color:'var(--text-secondary)', flexShrink:0}}/>
              <span style={{fontSize:12, color:'var(--text-secondary)', width:40}}>{t('pos.cash')}</span>
              <input className="field" type="number" inputMode="numeric" value={splitCash} onChange={e=>setSplitCash(e.target.value)} placeholder="0" style={{flex:1, padding:'6px 10px'}}/>
            </div>
            <div style={{display:'flex', gap:6, marginBottom:6, alignItems:'center'}}>
              <CreditCard size={14} style={{color:'var(--text-secondary)', flexShrink:0}}/>
              <span style={{fontSize:12, color:'var(--text-secondary)', width:40}}>{t('pos.digital_short')}</span>
              <input className="field" type="number" inputMode="numeric" value={splitCard} onChange={e=>setSplitCard(e.target.value)} placeholder="0" style={{flex:1, padding:'6px 10px'}}/>
            </div>
            <div style={{fontSize:11, color: splitOK ? 'var(--green)' : 'var(--red)', marginTop:4}}>
              {splitOK ? t('pos.split_ok', { amt: fmtMoney(splitTotal) }) : t('pos.split_diff', { amt: fmtMoney(total - splitTotal) })}
            </div>
          </div>
        )}

        {/* 現金付款輸入 */}
        {!splitMode && payMethod === 'cash' && (
          <>
            <div style={{fontSize:11, color:'var(--text-tertiary)', marginBottom:6}}>{t('pos.amount_received')}</div>
            <input className="field" type="number" inputMode="numeric" value={paidInput} onChange={e=>setPaidInput(e.target.value)} placeholder={t('pos.enter_amount')} style={{fontSize:22, fontFamily:'var(--font-mono)', marginBottom:10, width:'100%'}}/>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:12}}>
              {quickAmounts.map(a => (
                <button key={a} onClick={()=>setPaidInput(String(a))} style={{...cs.quickBtn,
                  background: parseFloat(paidInput)===a?'var(--bg-active)':'var(--bg-overlay)',
                  border: parseFloat(paidInput)===a?'1px solid var(--border-mid)':'1px solid var(--border-dim)',
                }}>
                  {a === total ? <span style={{color:'var(--green)'}}>{t('pos.exact_amount')}</span> : fmtMoney(a)}
                </button>
              ))}
            </div>
            {paid > 0 && (
              <div style={{...cs.changeRow, background: change>=0?'var(--green-dim)':'var(--red-dim)', borderColor: change>=0?'rgba(52,201,122,0.2)':'rgba(229,90,90,0.2)'}}>
                <span style={{color:'var(--text-secondary)', fontSize:13}}>{t('pos.change')}</span>
                <span style={{fontFamily:'var(--font-mono)', fontWeight:600, color: change>=0?'var(--green)':'var(--red)'}}>
                  {fmtMoney(change)}
                </span>
              </div>
            )}
          </>
        )}

        {/* 統編 */}
        <details style={{marginTop:8}}>
          <summary style={{fontSize:12, color:'var(--text-secondary)', cursor:'pointer', padding:'4px 0'}}>
            <Receipt size={11} style={{verticalAlign:'middle', marginRight:4}}/>
            {t('pos.tax_id_toggle')} {taxId && <span style={{color:'var(--gold)'}}>· {taxId}</span>}
          </summary>
          <input className="field" inputMode="numeric" value={taxId} onChange={e=>setTaxId(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder={t('pos.tax_id_placeholder')} style={{marginTop:6, width:'100%'}}/>
        </details>
      </div>
      <div style={cs.stageFooter}>
        <button className="btn btn-primary"
          style={{width:'100%', padding:14,
            opacity: (splitMode ? !splitOK : (payMethod==='cash' && paid < total)) ? 0.45 : 1
          }}
          disabled={splitMode ? !splitOK : (payMethod==='cash' && paid < total)}
          onClick={handleCheckout}>
          {t('pos.confirm_charge')}
        </button>
      </div>
    </div>
  )

  // ===== Member stage =====
  if (stage === 'member') return (
    <div style={cs.panel}>
      <div style={cs.panelHeader}>
        <span style={{fontWeight:600}}>{t('pos.bind_member')}</span>
        <button className="btn-icon" onClick={()=>setStage('cart')}><X size={16}/></button>
      </div>
      <div style={cs.stageContent}>
        <p style={{fontSize:13, color:'var(--text-secondary)', marginBottom:16}}>{t('pos.member_search_hint')}</p>
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <input className="field" value={memberQuery} onChange={e=>{setMemberQuery(e.target.value);setMemberError('')}} placeholder={t('pos.member_search_placeholder')} style={{flex:1, minWidth:0}} onKeyDown={e=>e.key==='Enter'&&handleFindMember()}/>
          <button className="btn btn-ghost btn-sm" onClick={handleFindMember} style={{flexShrink:0}}>{t('common.search')}</button>
        </div>
        {memberError && <div style={{fontSize:12, color:'var(--red)', marginBottom:12}}>{memberError}</div>}
        {activeMember && (
          <div style={cs.memberFound}>
            <div style={cs.memberAvatar}>{activeMember.name[0]}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{activeMember.name}</div>
              <div style={{fontSize:12, color:'var(--text-secondary)'}}>{activeMember.phone}</div>
              <div style={{fontSize:12, color:'var(--gold)', marginTop:2}}>
                {t('pos.points_count', { n: activeMember.points })} · {t(TIER_LABEL_KEY[activeMember.tier])}
                {memberBalance > 0 && <span style={{color:'var(--teal)'}}> · {t('pos.balance_short')} {fmtMoney(memberBalance)}</span>}
              </div>
            </div>
            <span className={`badge badge-${TIER_COLOR[activeMember.tier]}`} style={{flexShrink:0}}>{t(TIER_LABEL_KEY[activeMember.tier])}</span>
          </div>
        )}
      </div>
      <div style={{...cs.stageFooter, display:'flex', gap:8}}>
        {activeMember && <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{ onSelectMember(null); setStage('cart') }}>{t('pos.remove_member')}</button>}
        <button className="btn btn-primary" style={{flex:1}} onClick={()=>setStage('cart')}>
          {activeMember ? t('common.confirm') : t('pos.skip')}
        </button>
      </div>
    </div>
  )

  // ===== Cart stage =====
  return (
    <div style={cs.panel}>
      <div style={cs.panelHeader}>
        <span style={{fontWeight:600, display:'flex', alignItems:'center', gap:8}}>
          {t('pos.cart')}
          {cart.length > 0 && <span className="badge badge-blue">{t('pos.items_count', { n: cart.reduce((s,i)=>s+i.qty,0) })}</span>}
        </span>
        <div style={{display:'flex', gap:6}}>
          {cart.length > 0 && onHold && (
            <button className="btn-icon" onClick={()=>setShowHoldDlg(true)} title={t('pos.hold')}><Pause size={15}/></button>
          )}
          {cart.length > 0 && (
            <button className="btn-icon" onClick={onClear} title={t('pos.clear_cart')}><Trash2 size={15}/></button>
          )}
        </div>
      </div>

      <button onClick={()=>setStage('member')} style={cs.memberStrip}>
        <User size={14} style={{color: activeMember?'var(--gold)':'var(--text-tertiary)'}}/>
        {activeMember
          ? <span style={{color:'var(--gold)', fontWeight:500, fontSize:13}}>
              {activeMember.name} · {t('pos.points_count', { n: activeMember.points })}
              {memberBalance > 0 && <span style={{color:'var(--teal)'}}> · {fmtMoney(memberBalance)}</span>}
            </span>
          : <span style={{color:'var(--text-tertiary)', fontSize:13}}>{t('pos.bind_member_optional')}</span>
        }
        <ChevronRight size={14} style={{marginLeft:'auto', color:'var(--text-tertiary)'}}/>
      </button>

      <div style={cs.itemList}>
        {cart.length === 0 ? (
          <div style={cs.emptyState}>
            <div style={{
              width:64, height:64, borderRadius:'50%',
              background:'var(--bg-overlay)',
              display:'flex', alignItems:'center', justifyContent:'center',
              opacity:0.6,
            }}>
              <ShoppingCart size={28} color="var(--text-tertiary)"/>
            </div>
            <div style={{color:'var(--text-secondary)', fontSize:14, fontWeight:600}}>{t('pos.cart_empty')}</div>
            <div style={{color:'var(--text-tertiary)', fontSize:12}}>{t('pos.cart_empty_hint')}</div>
          </div>
        ) : cart.map((item, idx) => (
          <div key={item.id} className="animate-up" style={{...cs.cartItem, animationDelay:`${idx*30}ms`}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</div>
              <div style={{fontSize:11, color:'var(--text-tertiary)', marginTop:1}}>
                {editingPriceId === item.id ? (
                  <span>
                    <span>Rp </span>
                    <input type="number" inputMode="numeric" value={priceInput} autoFocus
                      onChange={e=>setPriceInput(e.target.value)}
                      onBlur={()=>commitEditPrice(item)}
                      onKeyDown={e=>{ if(e.key==='Enter') commitEditPrice(item); if(e.key==='Escape'){ setEditingPriceId(null); setPriceInput('') } }}
                      style={{width:54, fontSize:11, padding:'1px 4px', background:'var(--bg-overlay)', borderRadius:4}}/>
                  </span>
                ) : (
                  <span onClick={()=>onUpdatePrice && startEditPrice(item)} style={{cursor: onUpdatePrice ? 'pointer' : 'default', textDecoration: onUpdatePrice ? 'underline dotted' : 'none', textUnderlineOffset:2}}>
                    {item.category} · {fmtMoney(item.price)}
                  </span>
                )}
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <button style={cs.qtyBtn} onClick={()=>onUpdateQty(item.id,item.qty-1)}><Minus size={11}/></button>
              <span style={{fontFamily:'var(--font-mono)', fontSize:13, minWidth:22, textAlign:'center', fontWeight:500}}>{item.qty}</span>
              <button style={cs.qtyBtn} onClick={()=>onUpdateQty(item.id,item.qty+1)}><Plus size={11}/></button>
            </div>
            <div style={{textAlign:'right', minWidth:64}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text-primary)', fontWeight:500}}>
                {fmtMoney(item.price * item.qty)}
              </div>
              <button style={{fontSize:10, color:'var(--text-tertiary)', marginTop:2, display:'block', marginLeft:'auto'}} onClick={()=>onRemove(item.id)}>{t('pos.remove')}</button>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={cs.footer}>
          {/* 手動折讓 */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{color:'var(--text-secondary)', fontSize:13, display:'flex', alignItems:'center', gap:4}}>
              <Percent size={12}/> {t('pos.manual_discount')}
            </span>
            <input type="number" inputMode="numeric" value={manualDiscount || ''} onChange={e=>setManualDiscount(parseFloat(e.target.value) || 0)}
              placeholder="0" style={{width:80, textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13, background:'var(--bg-overlay)', borderRadius:4, padding:'4px 8px', border:'1px solid var(--border-dim)'}}/>
          </div>
          <div style={cs.subtotalRow}>
            <span style={{color:'var(--text-secondary)', fontSize:13}}>{t('common.subtotal')}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:22, fontWeight:500}}>
              {fmtMoney(Math.max(0, cartSubtotal - (manualDiscount || 0)))}
            </span>
          </div>
          <button className="btn btn-primary" style={{width:'100%', padding:'14px', fontSize:15, letterSpacing:'.04em'}} onClick={()=>setStage('pay')}>
            {t('pos.go_checkout')} →
          </button>
        </div>
      )}

      {showHoldDlg && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:998}} onClick={()=>setShowHoldDlg(false)}/>
          <div style={{position:'fixed', top:'40%', left:'50%', transform:'translate(-50%,-50%)', background:'var(--bg-raised)', borderRadius:12, width:340, maxWidth:'90vw', boxShadow:'var(--shadow-lg)', zIndex:999, padding:20}}>
            <div style={{fontWeight:600, fontSize:15, marginBottom:12}}>{t('pos.hold')}</div>
            <input className="field" placeholder={t('pos.hold_label_placeholder')} value={holdLabel} onChange={e=>setHoldLabel(e.target.value)} autoFocus
              onKeyDown={e=>{ if(e.key==='Enter') handleHold() }}/>
            <div style={{display:'flex', gap:8, marginTop:12}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowHoldDlg(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={handleHold}>{t('pos.hold')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const TIER_LABEL_KEY = { normal:'pos.tier_normal', silver:'pos.tier_silver', gold:'pos.tier_gold' }
const TIER_COLOR = { normal:'blue', silver:'blue', gold:'gold' }

const cs = {
  panel:{
    display:'flex', flexDirection:'column', height:'100%',
    background:'var(--bg-raised)', borderLeft:'1px solid var(--border-dim)',
    overflow:'hidden',
  },
  panelHeader:{
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'18px 20px', borderBottom:'1px solid var(--border-dim)',
    fontSize:14, flexShrink:0,
  },
  stageContent:{
    flex:1, overflowY:'auto', overflowX:'hidden',
    padding:'18px 20px', minHeight:0,
  },
  stageFooter:{
    flexShrink:0, padding:'14px 20px 18px',
    borderTop:'1px solid var(--border-dim)',
    background:'var(--bg-raised)',
  },
  memberStrip:{
    display:'flex', alignItems:'center', gap:10, width:'100%',
    padding:'12px 20px', borderBottom:'1px solid var(--border-dim)',
    background:'transparent', textAlign:'left', flexShrink:0,
    transition:'background var(--t2)',
  },
  itemList:{ flex:1, overflowY:'auto', padding:'6px 0' },
  cartItem:{
    display:'flex', alignItems:'center', gap:12,
    padding:'12px 20px', borderBottom:'1px solid var(--border-dim)',
    transition:'background var(--t2)',
  },
  qtyBtn:{
    width:28, height:28, borderRadius:'var(--r2)',
    background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
    color:'var(--text-secondary)',
    display:'flex', alignItems:'center', justifyContent:'center',
    flexShrink:0,
    transition:'all var(--t2) var(--ease-snap)',
  },
  emptyState:{
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    height:'100%', padding:'40px 0', gap:12,
  },
  footer:{
    borderTop:'1px solid var(--border-dim)', padding:'16px 20px',
    display:'flex', flexDirection:'column', gap:12, flexShrink:0,
    background:'var(--bg-raised)',
  },
  subtotalRow:{
    display:'flex', justifyContent:'space-between', alignItems:'baseline',
  },
  doneWrap:{
    flex:1, display:'flex', flexDirection:'column', alignItems:'center',
    justifyContent:'center', padding:'40px 20px', textAlign:'center',
  },
  doneCheck:{
    width:72, height:72, borderRadius:'50%',
    background:'linear-gradient(135deg, var(--green) 0%, var(--teal) 100%)',
    color:'#fff',
    display:'flex', alignItems:'center', justifyContent:'center',
    marginBottom:24,
    boxShadow:'0 8px 24px rgba(63,178,122,0.35), inset 0 1px 0 rgba(255,255,255,.2)',
  },
  totalDisplay:{
    padding:'24px 20px', marginBottom:16,
    borderRadius:'var(--r3)',
    background:'linear-gradient(135deg, var(--accent-dim), var(--gold-glow))',
    border:'1px solid var(--accent-dim)',
    textAlign:'center',
  },
  methodBtn:{
    flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    padding:'12px', borderRadius:'var(--r2)',
    fontSize:13.5, fontWeight:600, cursor:'pointer',
    transition:'all var(--t2) var(--ease-snap)',
  },
  quickBtn:{
    padding:'8px 14px', borderRadius:'var(--r-pill)',
    fontSize:12.5, fontFamily:'var(--font-mono)', fontWeight:600, cursor:'pointer',
    background:'var(--bg-overlay)', color:'var(--text-secondary)',
    border:'1px solid var(--border-dim)',
    transition:'all var(--t2) var(--ease-snap)',
  },
  changeRow:{
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'12px 16px', borderRadius:'var(--r2)', border:'1.5px solid',
    marginBottom:8,
  },
  pointsBox:{
    padding:'14px 16px',
    background:'linear-gradient(135deg, var(--gold-glow), transparent)',
    border:'1.5px solid var(--gold-dim)',
    borderRadius:'var(--r3)', marginBottom:14,
  },
  memberFound:{
    display:'flex', alignItems:'center', gap:12,
    background:'var(--bg-overlay)',
    borderRadius:'var(--r3)', padding:'14px 16px',
    border:'1px solid var(--border-subtle)', marginTop:10,
  },
  memberAvatar:{
    width:42, height:42, borderRadius:'50%',
    background:'var(--accent-grad)',
    color:'#fff',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontWeight:800, fontSize:17, flexShrink:0,
    boxShadow:'inset 0 1px 0 rgba(255,255,255,.2)',
  },
}
