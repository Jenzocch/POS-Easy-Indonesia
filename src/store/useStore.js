import { useState, useEffect, useCallback, useMemo } from 'react'
import { orderToJournalEntries, topupToJournalEntries } from '../utils/accounting'
import {
  isElectron, checkAndMigrate,
  loadProducts, saveProducts, dbAddProduct, dbUpdateProduct, dbDeleteProduct,
  loadMembers, saveMembers, dbAddMember, dbUpdateMember, dbDeleteMember,
  loadOrders, saveOrders, dbCheckout, dbRefund,
  loadManualJournal, saveManualJournal, dbAddManualEntry, dbDeleteManualEntry,
  loadHeldOrders, addHeldOrder, deleteHeldOrder,
  getOpenShift, openShift as apiOpenShift, closeShift as apiCloseShift, addCashLog,
  loadShifts, loadCashLog,
  loadWasteLog, addWaste, deleteWaste,
  addTopup, loadTopups,
  loadSuppliers, dbAddSupplier, dbUpdateSupplier, dbDeleteSupplier,
  loadPurchases, dbAddPurchase, dbUpdatePurchase, dbDeletePurchase,
  loadPromotions, dbAddPromotion, dbUpdatePromotion, dbDeletePromotion,
  getSetting, setSetting,
} from '../utils/dataAccess'
import { loadSoundEnabledCache } from '../utils/sound'
import { fireWebhook, payloadFromOrder, payloadFromLowStock, payloadFromShift, payloadFromExpiring, getWebhookConfig } from '../utils/webhook'
import { getReorderList, getExpiringProducts, memberTier } from '../utils/analytics'
import { needsRestock } from '../utils/stock'

// 種子商品改成印尼傳統雜貨店（warung）常見品項 + 合理的印尼盾（Rp）售價，
// 分類簡化為 Makanan/Minuman/Sembako/Kebutuhan 四類（見 utils/categories.js CATEGORY_META）。
// 條碼：少數品項用真實包裝品會有的 EAN-13（899 開頭＝印尼 GS1 前綴），其餘散裝/秤重品項
// 維持 noBarcode:true（原本設計就是如此，只是換成印尼場景）。
const SEED_PRODUCTS = [
  // Makanan 🍜
  { id:'p001', name:'Indomie Goreng',           category:'Makanan', price:3500,  cost:2450,  stock:100, barcode:'8991011000016', unit:'bungkus', noBarcode:false },
  { id:'p002', name:'Mie Sedaap Goreng',         category:'Makanan', price:3000,  cost:2100,  stock:80,  barcode:'',              unit:'bungkus', noBarcode:true  },
  { id:'p003', name:'Roti Tawar',                category:'Makanan', price:14000, cost:9800,  stock:20,  barcode:'',              unit:'bungkus', noBarcode:true  },
  { id:'p004', name:'Biskuit Roma Kelapa',       category:'Makanan', price:8000,  cost:5600,  stock:40,  barcode:'',              unit:'bungkus', noBarcode:true  },
  { id:'p005', name:'Chiki Balls',               category:'Makanan', price:2000,  cost:1300,  stock:60,  barcode:'',              unit:'bungkus', noBarcode:true  },
  { id:'p006', name:'Kerupuk Udang',             category:'Makanan', price:5000,  cost:3250,  stock:30,  barcode:'',              unit:'bungkus', noBarcode:true  },
  // Minuman 🥤
  { id:'p007', name:'Teh Botol Sosro',           category:'Minuman', price:5000,  cost:3500,  stock:48,  barcode:'8991022000012', unit:'botol',   noBarcode:false },
  { id:'p008', name:'Aqua 600ml',                category:'Minuman', price:4000,  cost:2800,  stock:60,  barcode:'8991011000023', unit:'botol',   noBarcode:false },
  { id:'p009', name:'Kopi Kapal Api Sachet',     category:'Minuman', price:2000,  cost:1300,  stock:100, barcode:'8991033000018', unit:'sachet',  noBarcode:false },
  { id:'p010', name:'Susu Ultra 250ml',          category:'Minuman', price:7000,  cost:4900,  stock:36,  barcode:'8991022000029', unit:'kotak',   noBarcode:false },
  { id:'p011', name:'Fanta Kaleng',              category:'Minuman', price:6000,  cost:4200,  stock:24,  barcode:'',              unit:'kaleng',  noBarcode:true  },
  { id:'p012', name:'Pop Ice Sachet',            category:'Minuman', price:1500,  cost:1000,  stock:90,  barcode:'',              unit:'sachet',  noBarcode:true  },
  // Sembako 🍚
  { id:'p013', name:'Beras 1kg',                 category:'Sembako', price:14000, cost:9800,  stock:50,  barcode:'',              unit:'kg',      noBarcode:true  },
  { id:'p014', name:'Minyak Goreng 1L',          category:'Sembako', price:18000, cost:12600, stock:30,  barcode:'',              unit:'botol',   noBarcode:true  },
  { id:'p015', name:'Gula Pasir 1kg',            category:'Sembako', price:17500, cost:12250, stock:40,  barcode:'',              unit:'kg',      noBarcode:true  },
  { id:'p016', name:'Telur 1kg',                 category:'Sembako', price:28000, cost:19600, stock:20,  barcode:'',              unit:'kg',      noBarcode:true  },
  { id:'p017', name:'Tepung Terigu 1kg',         category:'Sembako', price:12000, cost:8400,  stock:25,  barcode:'',              unit:'kg',      noBarcode:true  },
  { id:'p018', name:'Garam Dapur 500g',          category:'Sembako', price:3000,  cost:1800,  stock:40,  barcode:'',              unit:'bungkus', noBarcode:true  },
  // Kebutuhan 🧼
  { id:'p019', name:'Sabun Mandi Lifebuoy',      category:'Kebutuhan', price:5000,  cost:3500, stock:30,  barcode:'8991044000014', unit:'pcs',     noBarcode:false },
  { id:'p020', name:'Shampo Sachet Clear',       category:'Kebutuhan', price:1000,  cost:650,  stock:100, barcode:'',              unit:'sachet',  noBarcode:true  },
  { id:'p021', name:'Baterai AA Alkaline',       category:'Kebutuhan', price:10000, cost:7000, stock:3,   barcode:'',              unit:'pcs',     noBarcode:true  },
  { id:'p022', name:'Sabun Cuci Piring Sunlight',category:'Kebutuhan', price:9000,  cost:6300, stock:15,  barcode:'',              unit:'botol',   noBarcode:true  },
  { id:'p023', name:'Pasta Gigi Pepsodent',      category:'Kebutuhan', price:8500,  cost:5950, stock:20,  barcode:'8991044000021', unit:'pcs',     noBarcode:false },
  { id:'p024', name:'Deterjen Rinso 1kg',        category:'Kebutuhan', price:16000, cost:11200,stock:25,  barcode:'8991055000010', unit:'bungkus', noBarcode:false },
]
// 會員名稱改印尼常見姓名 + 08xx 印尼手機格式；totalSpent 依新的等級門檻（見 utils/analytics.js
// memberTier：silver >= Rp1.000.000、gold >= Rp3.000.000）分散在三個級距，讓 MembersPage 的
// 升級進度條一開始就有意義（不是每個人都卡在 0% 或 100%）。
const SEED_MEMBERS = [
  { id:'m001', name:'Budi Santoso', phone:'0812-3456-7890', points:320,  tier:'normal', totalSpent:420000,  joinDate:'2024-06-01' },
  { id:'m002', name:'Siti Rahayu',  phone:'0813-4567-8901', points:980,  tier:'silver', totalSpent:1650000, joinDate:'2024-02-15' },
  { id:'m003', name:'Agus Wijaya',  phone:'0821-5678-9012', points:2450, tier:'gold',   totalSpent:4200000, joinDate:'2025-01-10' },
]
const SEED_ORDERS = [
  { id:'O1700000001', items:[{id:'p001',name:'Indomie Goreng',price:3500,qty:2},{id:'p019',name:'Sabun Mandi Lifebuoy',price:5000,qty:1}], subtotal:12000, discount:0, total:12000, payMethod:'cash', paid:20000, change:8000, memberId:'m001', pointsUsed:0, pointsEarned:12, time: new Date(Date.now()-3600000).toISOString() },
  { id:'O1700000002', items:[{id:'p008',name:'Aqua 600ml',price:4000,qty:3}], subtotal:12000, discount:2000, total:10000, payMethod:'card', paid:10000, change:0, memberId:'m002', pointsUsed:20, pointsEarned:10, time: new Date(Date.now()-7200000).toISOString() },
  { id:'O1700000003', items:[{id:'p013',name:'Beras 1kg',price:14000,qty:1},{id:'p017',name:'Tepung Terigu 1kg',price:12000,qty:2}], subtotal:38000, discount:0, total:38000, payMethod:'cash', paid:40000, change:2000, memberId:null, pointsUsed:0, pointsEarned:0, time: new Date(Date.now()-86400000).toISOString() },
]
const thisMonth = new Date().toISOString().slice(0,7)
const SEED_MANUAL = [
  { id:'JM001', orderId:null, date:thisMonth+'-01', description:'Sewa toko bulan ini', type:'manual', lines:[{account:'5202',debit:1200000,credit:0,note:'Sewa toko'},{account:'1101',debit:0,credit:1200000,note:'Kas'}] },
  { id:'JM002', orderId:null, date:thisMonth+'-05', description:'Listrik & air',       type:'manual', lines:[{account:'5203',debit:350000,credit:0,note:'PLN + PDAM'},{account:'1101',debit:0,credit:350000,note:'Kas'}] },
  { id:'JM003', orderId:null, date:thisMonth+'-10', description:'Belanja stok grosir', type:'manual', lines:[{account:'1211',debit:850000,credit:0,note:'Masuk gudang'},{account:'1101',debit:0,credit:850000,note:'Kas'}] },
]
// PERF-06：suppliers/purchases/promotions 原本分別在 InventoryPage/PurchasePage/PromotionsPage
// 各自 mount 時呼叫 loadX()（每次切頁都重打一次 IPC/SQLite）。搬進 store 統一載入一次，
// 種子資料一併搬過來（原本分散在各頁面檔案內）。
const SEED_SUPPLIERS = [
  { id:'s001', name:'Toko Grosir Makmur Jaya', contact:'021-5678-1234', payTerms:'Jatuh tempo 30 hari', note:'Kirim tiap Selasa & Jumat' },
  { id:'s002', name:'Distributor Snack Sentosa', contact:'0812-1111-2222', payTerms:'Tunai', note:'Minimal order Rp 200.000' },
  { id:'s003', name:'Grosir Sembako Barokah', contact:'031-2345-0001', payTerms:'Jatuh tempo 60 hari', note:'' },
]
const SEED_PURCHASES = [
  {
    id:'PO001', supplierId:'s001', supplierName:'Toko Grosir Makmur Jaya',
    status:'received', date:'2025-03-10', receivedDate:'2025-03-12',
    items:[
      { productId:'p002', name:'Mie Sedaap Goreng', qty:200, unitCost:2100, received:200 },
      { productId:'p006', name:'Kerupuk Udang',      qty:100,unitCost:3250, received:100 },
    ],
    note:'Belanja rutin', total:745000,
  },
  {
    id:'PO002', supplierId:'s002', supplierName:'Distributor Snack Sentosa',
    status:'ordered', date:'2025-03-15', receivedDate:null,
    items:[
      { productId:'p005', name:'Chiki Balls',         qty:300, unitCost:1300, received:0 },
      { productId:'p004', name:'Biskuit Roma Kelapa', qty:150, unitCost:5600, received:0 },
    ],
    note:'', total:1230000,
  },
]
const SEED_PROMOTIONS = [
  {
    id:'pr001', name:'Belanja 50rb Diskon 5rb', type:'threshold', enabled:true,
    startAt:'2025-01-01T00:00:00', endAt:'2025-12-31T23:59:59',
    condition:{ threshold:50000, discount:5000 },
    note:'Berlaku semua produk',
  },
  {
    id:'pr002', name:'Diskon Akhir Pekan 10%', type:'percent', enabled:false,
    startAt:'2025-03-01T00:00:00', endAt:'2025-03-31T23:59:59',
    condition:{ rate:0.9 },
    note:'',
  },
  {
    id:'pr003', name:'Beli 3 Gratis 1', type:'buyget', enabled:true,
    startAt:'2025-01-01T00:00:00', endAt:'2025-06-30T23:59:59',
    condition:{ buy:3, get:1 },
    note:'Produk termurah gratis',
  },
]

function loadLS(k,fb){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb}catch{return fb}}
// LOAD-6 止血：寫入失敗（最常見是 5MB quota 滿 → 新訂單默默不落盤）不可再靜默吞掉，
// 浮出全域事件讓 App 顯示錯誤 banner——「默默丟單」與「可感知故障」的分界線。
function saveLS(k,v){
  try{localStorage.setItem(k,JSON.stringify(v))}
  catch(e){
    console.error('[POS] saveLS failed:', k, e)
    try{window.dispatchEvent(new CustomEvent('pos-storage-error',{detail:{key:k,error:e?.name||String(e)}}))}catch{}
  }
}
// DB 寫入錯誤至少 log 出來，避免 silent fail（audit #3）
const logDbErr = (op) => (e) => console.error(`[POS DB] ${op} failed:`, e)

export function useStore(){
  const [products,      setProducts]      = useState([])
  const [members,       setMembers]       = useState([])
  const [orders,        setOrders]        = useState([])
  const [manualEntries, setManualEntries] = useState([])
  const [cart,          setCart]          = useState([])
  const [view,          setView]          = useState('dashboard')
  const [activeMember,  setActiveMember]  = useState(null)
  const [ready,         setReady]         = useState(false)
  const [heldOrders,    setHeldOrders]    = useState([])
  const [wasteLog,      setWasteLog]      = useState([])
  const [topups,        setTopups]        = useState([])   // 會員儲值紀錄（給會計自動分錄用）
  const [openShift,     setOpenShiftState] = useState(null)
  const [suppliers,     setSuppliers]     = useState([])
  const [purchases,     setPurchases]     = useState([])
  const [promotions,    setPromotions]    = useState([])
  const [shifts,        setShifts]        = useState([])
  const [cashLog,       setCashLog]       = useState([])
  const [manualDiscount,setManualDiscount] = useState(0)
  const [pointsRule,    setPointsRule]    = useState({ earn: 10, redeem: 1 }) // 消費 X 元 1 點；1 點折抵 X 元
  const [birthdayBonus, setBirthdayBonus] = useState(100)

  // 初始化：從 SQLite 或 localStorage 載入資料
  useEffect(() => {
    async function init() {
      if (isElectron) {
        try { await checkAndMigrate() } catch (e) { console.error('[POS] migrate fail:', e) }
      }
      // 用 Promise.allSettled 避免單一失敗阻塞整個初始化
      const results = await Promise.allSettled([
        loadProducts(SEED_PRODUCTS),
        loadMembers(SEED_MEMBERS),
        loadOrders(SEED_ORDERS),
        loadManualJournal(SEED_MANUAL),
        loadHeldOrders(),
        loadWasteLog(),
        loadTopups(),
        getOpenShift(),
        loadSuppliers(SEED_SUPPLIERS),
        loadPurchases(SEED_PURCHASES),
        loadPromotions(SEED_PROMOTIONS),
        loadShifts(),
        loadCashLog(),
      ])
      const fallbacks = [SEED_PRODUCTS, SEED_MEMBERS, SEED_ORDERS, SEED_MANUAL, [], [], [], null, SEED_SUPPLIERS, SEED_PURCHASES, SEED_PROMOTIONS, [], []]
      const [p, m, o, j, held, waste, tps, shift, sup, purch, promo, shiftsList, cashLogList] = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        console.error('[POS] init load failed:', i, r.reason)
        return fallbacks[i]
      })
      setProducts(Array.isArray(p) ? p : [])
      setMembers(Array.isArray(m) ? m : [])
      setOrders(Array.isArray(o) ? o : [])
      setManualEntries(Array.isArray(j) ? j : [])
      setHeldOrders(Array.isArray(held) ? held : [])
      setWasteLog(Array.isArray(waste) ? waste : [])
      setTopups(Array.isArray(tps) ? tps : [])
      setOpenShiftState(shift || null)
      setSuppliers(Array.isArray(sup) ? sup : [])
      // PurchasePage 舊版一次性資料修復：舊「標記付款」曾寫入 STATUS map 查無的 status:'paid'，
      // 會讓 PurchaseList 渲染 crash（全站白屏）。修回 'received'（付款狀態改以 paidDate 區分）。
      const purchArr = Array.isArray(purch) ? purch : []
      const repairedPurchases = purchArr.map(x => x.status === 'paid' ? { ...x, status: 'received' } : x)
      const fixedPurchases = repairedPurchases.filter((x, i) => x !== purchArr[i])
      setPurchases(repairedPurchases)
      if (fixedPurchases.length > 0 && isElectron) {
        fixedPurchases.forEach(x => dbUpdatePurchase(x.id, x).catch(logDbErr('repairPurchase')))
      }
      setPromotions(Array.isArray(promo) ? promo : [])
      setShifts(Array.isArray(shiftsList) ? shiftsList : [])
      setCashLog(Array.isArray(cashLogList) ? cashLogList : [])
      // 載入點數規則 / 生日贈點
      try {
        const [earn, redeem, bday] = await Promise.all([
          getSetting('pointsEarnRate'),
          getSetting('pointsRedeemRate'),
          getSetting('birthdayBonus'),
        ])
        setPointsRule({
          earn: parseInt(earn) || 10,
          redeem: parseFloat(redeem) || 1,
        })
        setBirthdayBonus(parseInt(bday) || 100)
      } catch {}
      // 音效開關：模組層快取一次載入即可，之後由 SettingsPage 的 onChange 即時更新
      loadSoundEnabledCache().catch(() => {})
      setReady(true)
    }
    init()
  }, [])

  // 監聽商品變化觸發 webhook 通知
  // 效能：多數使用者沒設 webhook → 直接短路，不掃全商品；有設才計算（fireWebhook 內 throttle 6/24h）
  useEffect(() => {
    if (!ready) return
    const cfg = getWebhookConfig()
    if (!cfg?.url) return
    const wantLow = cfg.events?.includes('low_stock')
    const wantExp = cfg.events?.includes('expiring')
    if (!wantLow && !wantExp) return
    if (wantLow) {
      const lowList = getReorderList(products)
      if (lowList.length > 0) fireWebhook('low_stock', payloadFromLowStock(lowList)).catch(()=>{})
    }
    if (wantExp) {
      const { expired, soon } = getExpiringProducts(products, 7)
      if (expired.length > 0 || soon.length > 0) fireWebhook('expiring', payloadFromExpiring(expired, soon)).catch(()=>{})
    }
  }, [products, ready])

  // 瀏覽器模式: 持久化到 localStorage
  useEffect(() => { if (!isElectron && ready) saveLS('pos2_products', products) }, [products, ready])
  useEffect(() => { if (!isElectron && ready) saveLS('pos2_members', members) }, [members, ready])
  useEffect(() => { if (!isElectron && ready) saveLS('pos2_orders', orders) }, [orders, ready])
  useEffect(() => { if (!isElectron && ready) saveLS('pos2_manual_j', manualEntries) }, [manualEntries, ready])
  useEffect(() => { if (!isElectron && ready) saveLS('pos_suppliers', suppliers) }, [suppliers, ready])
  useEffect(() => { if (!isElectron && ready) saveLS('pos_purchases', purchases) }, [purchases, ready])
  // promotions 搬進 store 前，PromotionsPage 自己的 save() 會在瀏覽器模式手動寫 localStorage；
  // 現在 mutator 統一走 addPromotion/updatePromotion/deletePromotion（只在 isElectron 時寫 DB，
  // 跟 addProduct 等其他實體一致），少了這條 effect 瀏覽器模式編輯促銷會在重整後消失。
  useEffect(() => { if (!isElectron && ready) saveLS('pos_promotions', promotions) }, [promotions, ready])

  const autoJournal = useMemo(()=>[
    ...orders.flatMap(o=>orderToJournalEntries(o,products)),
    ...topups.flatMap(topupToJournalEntries),   // 會員儲值（加值 + 折抵）一併入帳，損益表才完整
  ],[orders,products,topups])
  const allJournal  = useMemo(()=>[...autoJournal,...manualEntries].sort((a,b)=>b.date.localeCompare(a.date)),[autoJournal,manualEntries])

  const addManualEntry = useCallback(e=>{
    const n={...e,id:'JM'+Date.now(),type:'manual'}
    setManualEntries(p=>[n,...p])
    if (isElectron) dbAddManualEntry(n).catch(logDbErr('addManualEntry'))
    return n
  },[])
  const deleteManualEntry = useCallback(id=>{
    setManualEntries(p=>p.filter(e=>e.id!==id))
    if (isElectron) dbDeleteManualEntry(id).catch(logDbErr('deleteManualEntry'))
  },[])

  const addToCart = useCallback((product,qty=1)=>{
    setCart(prev=>{
      const idx=prev.findIndex(i=>i.id===product.id)
      if(idx>=0){const next=[...prev];next[idx]={...next[idx],qty:next[idx].qty+qty};return next}
      return [...prev,{...product,qty}]
    })
  },[])
  const removeFromCart = useCallback(id=>setCart(p=>p.filter(i=>i.id!==id)),[])
  const updateCartQty  = useCallback((id,qty)=>{if(qty<=0){setCart(p=>p.filter(i=>i.id!==id));return}setCart(p=>p.map(i=>i.id===id?{...i,qty}:i))},[])
  const updateCartItemPrice = useCallback((id, price) => {
    if (price < 0 || isNaN(price)) return
    setCart(p => p.map(i => i.id === id ? { ...i, price } : i))
  }, [])
  const clearCart      = useCallback(()=>{setCart([]);setActiveMember(null)},[])

  const cartSubtotal = cart.reduce((s,i)=>s+i.price*i.qty,0)
  const cartCount    = cart.reduce((s,i)=>s+i.qty,0)

  // payments: [{method:'cash',amount:50},{method:'card',amount:50}]，若沒帶就用 payMethod+paid
  const checkout = useCallback((payMethod, paid, pointsUsed=0, opts={}) => {
    if(!cart.length) return null
    const { taxId='', payments=null, manualDiscountAmt=0, promoDiscountAmt=0, balanceUsed=0, cashier='' } = opts
    // 夾限：不可超用會員點數/儲值（UI 已擋，這裡再防呆——避免 stale snapshot、跨裝置或直接呼叫造成負值/超折抵）
    const usePoints  = activeMember ? Math.min(Math.max(0, pointsUsed),  activeMember.points  || 0) : 0
    const useBalance = activeMember ? Math.min(Math.max(0, balanceUsed), activeMember.balance || 0) : 0
    const subtotal = cartSubtotal
    const pointsDiscount = usePoints * (pointsRule.redeem || 1)
    const totalDiscount = pointsDiscount + manualDiscountAmt + promoDiscountAmt + useBalance
    const total = Math.max(0, subtotal - totalDiscount)
    let pointsEarned = Math.floor(total / (pointsRule.earn || 10))

    // 生日贈點：本月生日 & 本月尚未發放
    let birthdayBonusGiven = 0
    if (activeMember && activeMember.birthday) {
      const thisMonth = new Date().toISOString().slice(0,7)
      const birthMonth = activeMember.birthday.slice(5,7)
      const curMonth = String(new Date().getMonth()+1).padStart(2,'0')
      const lastBonusMonth = (activeMember.lastBirthdayBonus || '').slice(0,7)
      if (birthMonth === curMonth && lastBonusMonth !== thisMonth) {
        birthdayBonusGiven = birthdayBonus || 100
        pointsEarned += birthdayBonusGiven
      }
    }

    // 計算實際付款方式
    let actualPayments = payments
    if (!actualPayments || !actualPayments.length) {
      actualPayments = [{ method: payMethod || 'cash', amount: total }]
    }
    const totalPaid = actualPayments.reduce((s,p) => s + (p.amount||0), 0)
    const change = (payMethod === 'cash' || actualPayments.some(p=>p.method==='cash'))
      ? Math.max(0, paid - total) : 0

    const order = {
      id: 'O' + Date.now(),
      items: [...cart],
      subtotal, discount: pointsDiscount, manualDiscount: manualDiscountAmt,
      promoDiscount: promoDiscountAmt,
      balanceUsed: useBalance,
      total,
      payMethod: actualPayments.length > 1 ? 'mixed' : (actualPayments[0]?.method || payMethod),
      paid: totalPaid, change,
      payments: actualPayments,
      memberId: activeMember?.id || null,
      pointsUsed: usePoints, pointsEarned,
      time: new Date().toISOString(),
      taxId, cashier,
      shiftId: openShift?.id || '',
      status: 'completed',
    }

    // 更新本地狀態
    setProducts(prev => prev.map(p => {
      const item = cart.find(i => i.id === p.id)
      return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p
    }))
    if (activeMember) {
      setMembers(prev => prev.map(m => {
        if (m.id !== activeMember.id) return m
        const newPoints = Math.max(0, m.points - usePoints + pointsEarned)
        const newSpent = (m.totalSpent || 0) + total
        const newBalance = Math.max(0, (m.balance || 0) - useBalance)
        const tier = memberTier(newSpent)
        const updated = { ...m, points: newPoints, totalSpent: newSpent, tier, balance: newBalance }
        if (birthdayBonusGiven > 0) updated.lastBirthdayBonus = new Date().toISOString().slice(0,10)
        return updated
      }))
    }
    setOrders(prev => [order, ...prev])
    setCart([])
    setActiveMember(null)
    setManualDiscount(0)

    if (isElectron) {
      const stockUpdates = cart.map(i => ({ id: i.id, delta: -i.qty }))
      const memberUpdate = activeMember ? {
        id: activeMember.id,
        pointsDelta: -usePoints + pointsEarned,
        spentDelta: total,
        balanceDelta: -useBalance,
        tier: memberTier(activeMember.totalSpent + total),
        // 生日贈點：把發放月份一起寫回 DB（見 checkoutTx），否則重開後本月會重複贈點
        ...(birthdayBonusGiven > 0 ? { lastBirthdayBonus: new Date().toISOString().slice(0,10) } : {}),
      } : null
      dbCheckout(order, stockUpdates, memberUpdate).catch(logDbErr('checkout'))
    }
    // webhook：每筆結帳 + 大額訂單
    const payload = payloadFromOrder(order, activeMember)
    fireWebhook('checkout', payload).catch(()=>{})
    fireWebhook('big_sale', payload).catch(()=>{}) // 內部會檢查門檻
    return order
  }, [cart, cartSubtotal, activeMember, pointsRule, openShift, birthdayBonus])

  // 退貨：建立負數訂單，補回庫存與會員資料
  const refund = useCallback(async (origOrder, refundItems, opts={}) => {
    if (!origOrder || !refundItems?.length) return null
    const { reason = '', cashier = '' } = opts
    // 累計退貨守衛：算出這張原單每個品項「之前已退數量」，把本次退貨夾在剩餘可退範圍內，
    // 防止同一張單被反覆部分退貨而超退現金 / 庫存 / 點數（部分退貨後原單仍是 completed、退貨鈕還在）。
    const refundedById = {}
    for (const ro of orders) {
      if (ro.refundOf !== origOrder.id) continue
      for (const it of (ro.items || [])) refundedById[it.id] = (refundedById[it.id] || 0) + Math.abs(it.qty || 0)
    }
    const origQtyById = {}
    for (const it of (origOrder.items || [])) origQtyById[it.id] = Math.abs(it.qty || 0)
    const clampedItems = refundItems.map(i => {
      const remaining = Math.max(0, (origQtyById[i.id] || 0) - (refundedById[i.id] || 0))
      return { ...i, qty: Math.min(Math.abs(i.qty || 0), remaining) }
    }).filter(i => i.qty > 0)
    if (!clampedItems.length) return null   // 已全部退完，無可退數量

    const refundSubtotal = clampedItems.reduce((s,i) => s + i.price * i.qty, 0)
    // 守衛分母用 subtotal（折扣按小計比例分攤），避免全額折抵(total=0) 時誤判或除以零
    const ratio = origOrder.subtotal > 0 ? refundSubtotal / origOrder.subtotal : 0
    const refundDiscount = Math.round((origOrder.discount || 0) * ratio)
    const refundManual = Math.round((origOrder.manualDiscount || 0) * ratio)
    const refundTotal = refundSubtotal - refundDiscount - refundManual
    // 原單若用儲值付款，按比例退回儲值，其餘才退現金/原付款；避免「用儲值買、退貨卻全拿現金而儲值沒還」
    const restoredBalance = Math.round((origOrder.balanceUsed || 0) * ratio)
    const cashRefund = refundTotal - restoredBalance   // 真正退回現金/電子的金額（restoredBalance 退回儲值卡）
    const refundPointsEarned = -(Math.floor(refundTotal / (pointsRule.earn || 10)))
    const refundPointsUsed = -Math.round((origOrder.pointsUsed || 0) * ratio)

    // 退款付款方式：原訂單若是 mixed 就按比例退；否則一致
    const refundPayMethod = origOrder.payMethod === 'mixed' ? 'mixed' : (origOrder.payMethod || 'cash')
    let refundPayments
    if (origOrder.payMethod === 'mixed' && Array.isArray(origOrder.payments)) {
      refundPayments = origOrder.payments.map(p => ({
        method: p.method,
        amount: -Math.round((p.amount || 0) * ratio * 100) / 100,
      }))
    } else {
      refundPayments = [{ method: refundPayMethod, amount: -cashRefund }]
    }

    const refundOrder = {
      id: 'R' + Date.now(),
      items: clampedItems.map(i => ({ ...i, qty: -Math.abs(i.qty) })),
      subtotal: -refundSubtotal,
      discount: -refundDiscount,
      manualDiscount: -refundManual,
      total: -cashRefund,
      balanceUsed: -restoredBalance,   // 負數 → auto_balance 反向沖回預收款、回補儲值消費營收
      payMethod: refundPayMethod,
      paid: -cashRefund,
      change: 0,
      payments: refundPayments,
      memberId: origOrder.memberId || null,
      pointsUsed: refundPointsUsed,
      pointsEarned: refundPointsEarned,
      time: new Date().toISOString(),
      status: 'completed',
      refundOf: origOrder.id,
      note: reason,
      cashier,
      shiftId: openShift?.id || '',
    }

    // 判斷是否為完整退貨（含本次在內，每個品項累計退貨量都 >= 原始量）
    const isFullRefund = (origOrder.items || []).every(orig => {
      const already = refundedById[orig.id] || 0
      const r = clampedItems.find(i => i.id === orig.id)
      return (already + (r ? r.qty : 0)) >= Math.abs(orig.qty || 0)
    })
    refundOrder.fullRefund = isFullRefund

    setOrders(prev => {
      const next = isFullRefund
        ? prev.map(o => o.id === origOrder.id ? { ...o, status: 'refunded' } : o)
        : [...prev]
      return [refundOrder, ...next]
    })
    setProducts(prev => prev.map(p => {
      const item = clampedItems.find(i => i.id === p.id)
      return item ? { ...p, stock: p.stock + Math.abs(item.qty) } : p
    }))
    if (origOrder.memberId) {
      setMembers(prev => prev.map(m => {
        if (m.id !== origOrder.memberId) return m
        const newPoints = Math.max(0, (m.points || 0) + refundPointsEarned - refundPointsUsed)
        const newSpent = Math.max(0, (m.totalSpent || 0) - refundTotal)
        const tier = memberTier(newSpent)
        return { ...m, points: newPoints, totalSpent: newSpent, tier, balance: Math.max(0, (m.balance || 0) + restoredBalance) }
      }))
    }

    if (isElectron) {
      const stockUpdates = clampedItems.map(i => ({ id: i.id, delta: Math.abs(i.qty) }))
      const memberUpdate = origOrder.memberId ? {
        id: origOrder.memberId,
        pointsDelta: refundPointsEarned - refundPointsUsed,
        spentDelta: -refundTotal,
        balanceDelta: restoredBalance,   // 退回儲值（refundTx 已支援 balanceDelta）
      } : null
      // 只有完整退貨才把原訂單標記為 refunded
      await dbRefund(isFullRefund ? origOrder.id : null, refundOrder, stockUpdates, memberUpdate)
    }
    // webhook
    fireWebhook('refund', payloadFromOrder(refundOrder, null)).catch(()=>{})
    return refundOrder
  }, [orders, pointsRule, openShift])

  // 掛單
  const holdCart = useCallback(async (label='', cashier='') => {
    if (!cart.length) return null
    const held = {
      id: 'H' + Date.now(),
      label: label || `掛單 ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`,
      cart: [...cart],
      memberId: activeMember?.id || '',
      manualDiscount,
      createdAt: new Date().toISOString(),
      cashier,
    }
    setHeldOrders(p => [held, ...p])
    setCart([])
    setActiveMember(null)
    setManualDiscount(0)
    if (isElectron) await addHeldOrder(held)
    return held
  }, [cart, activeMember, manualDiscount])

  const recallHeld = useCallback(async (h) => {
    setCart(h.cart || [])
    setManualDiscount(h.manualDiscount || 0)
    if (h.memberId) {
      const m = members.find(x => x.id === h.memberId)
      if (m) setActiveMember(m)
    }
    setHeldOrders(p => p.filter(x => x.id !== h.id))
    if (isElectron) await deleteHeldOrder(h.id)
  }, [members])

  const removeHeld = useCallback(async (id) => {
    setHeldOrders(p => p.filter(x => x.id !== id))
    if (isElectron) await deleteHeldOrder(id)
  }, [])

  // 班別
  // PERF-06：shifts/cashLog 原本是 ShiftPage 自己的 state，靠 useEffect(reload, [openShift?.id])
  // 在每次進頁 + 每次開班/關班/記現金時整包重打 IPC。搬進 store 後改成：
  // 初始化只載入一次，開班/關班/記現金這幾個低頻動作才重新整包讀回（因為 closeShift 在後端算出
  // cashSales/cardSales/diff 等衍生欄位，前端沒有對應資料可以樂觀更新，重讀比在這裡重算安全）。
  const refreshShiftData = useCallback(async () => {
    const [s, c] = await Promise.all([
      loadShifts().catch(()=>[]),
      loadCashLog().catch(()=>[]),
    ])
    setShifts(Array.isArray(s) ? s : [])
    setCashLog(Array.isArray(c) ? c : [])
  }, [])

  const startShift = useCallback(async (cashier, openCash, cashierId='') => {
    const data = {
      id: 'S' + Date.now(),
      cashier, cashierId, openCash,
      openTime: new Date().toISOString(),
    }
    if (isElectron) await apiOpenShift(data)
    setOpenShiftState({ ...data, status: 'open' })
    await refreshShiftData()
    fireWebhook('shift_open', payloadFromShift(data, 'open')).catch(()=>{})
    return data
  }, [refreshShiftData])

  const endShift = useCallback(async (closeCash, note='') => {
    if (!openShift) return null
    const r = isElectron
      ? await apiCloseShift(openShift.id, { closeCash, note })
      : { success: true }
    fireWebhook('shift_close', payloadFromShift(openShift, 'close', { ...r, closeCash })).catch(()=>{})
    setOpenShiftState(null)
    await refreshShiftData()
    return r
  }, [openShift, refreshShiftData])

  const logCash = useCallback(async (type, amount, reason, cashier='') => {
    const data = {
      id: 'CL' + Date.now() + Math.random().toString(36).slice(2,5),
      shiftId: openShift?.id || '',
      time: new Date().toISOString(),
      type, amount, reason, cashier,
    }
    if (isElectron) await addCashLog(data)
    await refreshShiftData()
  }, [openShift, refreshShiftData])

  // 損耗
  // opts.skipStockDeduct：FLOW-03 盤點盤虧走此路徑——庫存已被盤點的絕對值更新修正，
  // 再扣一次會二次扣庫存（Electron 端 addWaste 也以同名旗標跳過 delta）
  const recordWaste = useCallback(async (data, opts = {}) => {
    const { skipStockDeduct = false } = opts
    const w = {
      id: 'W' + Date.now(),
      time: new Date().toISOString(),
      ...data,
    }
    setWasteLog(p => [w, ...p])
    if (!skipStockDeduct) {
      setProducts(prev => prev.map(p => p.id === data.productId
        ? { ...p, stock: Math.max(0, p.stock - Math.abs(data.qty)) } : p))
    }
    // 一律持久化（dataAccess 內部分流 SQLite / localStorage；舊版 web 模式從未落盤，重整就掉）
    await addWaste(isElectron && skipStockDeduct ? { ...w, skipStockDeduct: true } : w)
    return w
  }, [])

  const removeWaste = useCallback(async (id) => {
    setWasteLog(p => p.filter(w => w.id !== id))
    await deleteWaste(id) // 同上：web 模式也要同步 localStorage
  }, [])

  // 會員儲值
  const topupMember = useCallback(async (memberId, amount, bonus=0, payMethod='cash', cashier='') => {
    const data = {
      id: 'TP' + Date.now(),
      memberId, amount, bonus, payMethod,
      time: new Date().toISOString(),
      cashier,
    }
    setMembers(prev => prev.map(m => m.id === memberId
      ? { ...m, balance: (m.balance || 0) + amount + bonus } : m))
    setTopups(prev => [data, ...prev])                                    // 進 state → 自動產生會計分錄
    await addTopup(data).catch(e => console.error('[POS] topup persist fail:', e)) // 一律持久化（舊版 web 模式根本沒存到儲值紀錄）
    return data
  }, [])

  // 點數規則設定
  const updatePointsRule = useCallback(async (earn, redeem) => {
    setPointsRule({ earn, redeem })
    if (isElectron) {
      await setSetting('pointsEarnRate', String(earn))
      await setSetting('pointsRedeemRate', String(redeem))
    }
  }, [])

  const updateBirthdayBonus = useCallback(async (val) => {
    const n = parseInt(val) || 100
    setBirthdayBonus(n)
    await setSetting('birthdayBonus', String(n))
  }, [])

  const addProduct = useCallback(p=>{
    const n={...p,id:'p'+Date.now()}
    setProducts(x=>[...x,n])
    if (isElectron) dbAddProduct(n).catch(logDbErr('addProduct'))
    return n
  },[])
  const updateProduct = useCallback((id,u)=>{
    setProducts(p=>p.map(x=>x.id===id?{...x,...u}:x))
    if (isElectron) dbUpdateProduct(id, u).catch(logDbErr('updateProduct'))
  },[])
  const deleteProduct = useCallback(id=>{
    setProducts(p=>p.filter(x=>x.id!==id))
    if (isElectron) dbDeleteProduct(id).catch(logDbErr('deleteProduct'))
  },[])
  const findByBarcode = useCallback(code=>products.find(p=>p.barcode===code),[products])

  const addMember = useCallback(m=>{
    const n={...m,id:'m'+Date.now(),points:0,totalSpent:0,tier:'normal',joinDate:new Date().toISOString().slice(0,10)}
    setMembers(p=>[...p,n])
    if (isElectron) dbAddMember(n).catch(logDbErr('addMember'))
    return n
  },[])
  const updateMember = useCallback((id,u)=>{
    setMembers(p=>p.map(m=>m.id===id?{...m,...u}:m))
    if (isElectron) dbUpdateMember(id, u).catch(logDbErr('updateMember'))
  },[])
  const deleteMember = useCallback(id=>{
    setMembers(p=>p.filter(m=>m.id!==id))
    if (isElectron) dbDeleteMember(id).catch(logDbErr('deleteMember'))
  },[])
  // audit #25: m.phone 可能為 null（舊資料），用 (m.phone||'').replace 防呆
  const findMember = useCallback(q=>members.find(m=>(m.phone||'').replace(/-/g,'').includes(q.replace(/-/g,''))||(m.name||'').includes(q)),[members])

  // PERF-06：suppliers/purchases/promotions 原本各自在 InventoryPage/PurchasePage/PromotionsPage
  // 自己的 useState + mount useEffect 裡讀寫，搬進 store 統一管理（載入已併入上面的 init）。
  const addSupplier = useCallback(s=>{
    const n={...s,id:'s'+Date.now()}
    setSuppliers(x=>[...x,n])
    if (isElectron) dbAddSupplier(n).catch(logDbErr('addSupplier'))
    return n
  },[])
  const updateSupplier = useCallback((id,u)=>{
    setSuppliers(p=>p.map(x=>x.id===id?{...x,...u}:x))
    if (isElectron) dbUpdateSupplier(id, u).catch(logDbErr('updateSupplier'))
  },[])
  const deleteSupplier = useCallback(id=>{
    setSuppliers(p=>p.filter(x=>x.id!==id))
    if (isElectron) dbDeleteSupplier(id).catch(logDbErr('deleteSupplier'))
  },[])

  // 進貨單 id / 完整內容都由呼叫端組好（NewPurchase 已含 AI 建議量等邏輯），這裡只負責存放 + 落盤
  const addPurchase = useCallback(po=>{
    setPurchases(p=>[po,...p])
    if (isElectron) dbAddPurchase(po).catch(logDbErr('addPurchase'))
    return po
  },[])
  const updatePurchase = useCallback((id,data)=>{
    setPurchases(p=>p.map(x=>x.id===id?data:x))
    if (isElectron) dbUpdatePurchase(id, data).catch(logDbErr('updatePurchase'))
  },[])
  const deletePurchase = useCallback(id=>{
    setPurchases(p=>p.filter(x=>x.id!==id))
    if (isElectron) dbDeletePurchase(id).catch(logDbErr('deletePurchase'))
  },[])

  const addPromotion = useCallback(promo=>{
    const n={...promo,id:'pr'+Date.now()}
    setPromotions(x=>[...x,n])
    if (isElectron) dbAddPromotion(n).catch(logDbErr('addPromotion'))
    return n
  },[])
  const updatePromotion = useCallback((id,u)=>{
    setPromotions(p=>p.map(x=>x.id===id?{...x,...u}:x))
    if (isElectron) dbUpdatePromotion(id, u).catch(logDbErr('updatePromotion'))
  },[])
  const deletePromotion = useCallback(id=>{
    setPromotions(p=>p.filter(x=>x.id!==id))
    if (isElectron) dbDeletePromotion(id).catch(logDbErr('deletePromotion'))
  },[])

  // PERF-05 步驟1：衍生值 memo 化——useStore 掛在 App 根部，任何 state 變動都重渲染整個 App 樹，
  // 這四個值先前每 render 裸算（todayProfit 內還有 O(P) 的 products.find），是加購物車掉幀的主因之一。
  const categories    = useMemo(()=>[...new Set(products.map(p=>p.category))],[products])
  // 排除完整退貨原訂單（status='refunded'）；部分退貨負數訂單保留，與原單抵銷正確
  const todayOrders   = useMemo(()=>{
    const todayStr = new Date().toDateString()
    return orders.filter(o=>new Date(o.time).toDateString()===todayStr && o.status!=='refunded' && !(o.refundOf && o.fullRefund))
  },[orders])
  const todayRevenue  = useMemo(()=>todayOrders.reduce((s,o)=>s+o.total,0),[todayOrders])
  const lowStockCount = useMemo(()=>products.filter(needsRestock).length,[products]) // 需補貨 = 低庫存 + 缺貨（Sidebar 徽章與庫存頁 header 同源）
  const todayProfit   = useMemo(()=>{
    const costById = new Map(products.map(p=>[p.id, p.cost||0])) // 消掉每單每品項的 products.find O(P)
    return todayOrders.reduce((s,o)=>s+o.items.reduce((a,i)=>costById.has(i.id)?a+(i.price-costById.get(i.id))*i.qty:a,0),0)
  },[todayOrders, products])

  return {
    products,members,orders,cart,view,setView,ready,
    activeMember,setActiveMember,
    addToCart,removeFromCart,updateCartQty,updateCartItemPrice,clearCart,
    cartSubtotal,cartCount,checkout,refund,
    addProduct,updateProduct,deleteProduct,findByBarcode,
    addMember,updateMember,deleteMember,findMember,
    categories,todayOrders,todayRevenue,lowStockCount,todayProfit,
    allJournal,manualEntries,
    addManualEntry,deleteManualEntry,
    // v2.1
    heldOrders, holdCart, recallHeld, removeHeld,
    wasteLog, recordWaste, removeWaste,
    openShift, startShift, endShift, logCash,
    shifts, cashLog,
    topupMember,
    pointsRule, updatePointsRule,
    birthdayBonus, updateBirthdayBonus,
    manualDiscount, setManualDiscount,
    // PERF-06: suppliers/purchases/promotions（原本各頁面自己 loadX()，現在集中在 store）
    suppliers, addSupplier, updateSupplier, deleteSupplier,
    purchases, addPurchase, updatePurchase, deletePurchase,
    promotions, addPromotion, updatePromotion, deletePromotion,
  }
}
