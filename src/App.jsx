import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Menu, X, Cloud, AlertTriangle } from 'lucide-react'
import { useStore } from './store/useStore'
import { getSession, destroySession, writeAuditLog, startIdleTimer, hasPermission, createBackup } from './utils/security'
import { getCloudConfig } from './utils/supabaseClient'
import { pullAll } from './utils/cloudSync'
import LoginScreen from './pages/LoginScreen'
import Sidebar from './components/Sidebar'
// PERF：14 個頁面原本全部靜態 import，擠在同一個主 bundle 裡（含 jsbarcode/qrcode/exportXLS 等重依賴），
// 拖慢首次載入；改成 lazy 讓每頁只在真的切進去時才下載自己的 chunk
const POSPage        = lazy(() => import('./pages/POSPage'))
const InventoryPage  = lazy(() => import('./pages/InventoryPage'))
const MembersPage    = lazy(() => import('./pages/MembersPage'))
const ReportsPage    = lazy(() => import('./pages/ReportsPage'))
const AccountingPage = lazy(() => import('./pages/AccountingPage'))
const PurchasePage   = lazy(() => import('./pages/PurchasePage'))
const StocktakePage  = lazy(() => import('./pages/StocktakePage'))
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'))
const SettingsPage   = lazy(() => import('./pages/SettingsPage'))
const OrdersPage     = lazy(() => import('./pages/OrdersPage'))
const DashboardPage  = lazy(() => import('./pages/DashboardPage'))
const ShiftPage      = lazy(() => import('./pages/ShiftPage'))
const WastePage      = lazy(() => import('./pages/WastePage'))
const KastonPage     = lazy(() => import('./pages/KastonPage'))
import { isElectron } from './utils/dataAccess'
import useIsMobile from './hooks/useIsMobile'
import { t } from './i18n'

const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000 // 上次同步超過 10 分鐘才自動 pull

export default function App() {
  const store = useStore()
  const { view, setView, lowStockCount, todayRevenue, todayOrders } = store
  const [session, setSession] = useState(() => getSession())
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState(0)
  const [autoSync, setAutoSync] = useState(null) // 'syncing' | 'done' | 'failed' | null
  const [storageError, setStorageError] = useState(null) // LOAD-6：localStorage 寫入失敗（quota 滿）浮出 UI
  const isMobile = useIsMobile()

  // LOAD-6：useStore 的 saveLS 寫入失敗會 dispatch 此事件（quota 滿 = 新訂單默默不落盤）
  useEffect(() => {
    const onStorageError = (e) => setStorageError(e.detail || { key: '?', error: 'unknown' })
    window.addEventListener('pos-storage-error', onStorageError)
    return () => window.removeEventListener('pos-storage-error', onStorageError)
  }, [])

  // 監聽顧客點餐通知
  useEffect(() => {
    if (!isElectron) return
    const unsub = window.electronAPI.onNewOrder(() => {
      setPendingOrders(c => c + 1)
    })
    return unsub
  }, [])

  const handleLogout = useCallback(() => {
    writeAuditLog('LOGOUT', session, {})
    if (session) createBackup(session, t('login.backup_logout'))
    destroySession()
    setSession(null)
  }, [session])

  const handleLogin = useCallback(async (newSession) => {
    setSession(newSession)
    // 每日一備份：pos_backups 在瀏覽器模式存完整備份、在 Electron 模式存輕量戳記
    // （security.js createBackup 兩種模式都會寫入，createdAt 欄位皆有）
    const backups = JSON.parse(localStorage.getItem('pos_backups') || '[]')
    const today = new Date().toDateString()
    const hasToday = backups.some(b => new Date(b.createdAt).toDateString() === today)
    if (!hasToday) createBackup(newSession, t('login.backup_daily', { date: today }))

    // 自動拉取雲端最新（只在有設定 + 上次同步太久）
    const cloudCfg = getCloudConfig()
    if (!cloudCfg) return
    const last = localStorage.getItem('pos_last_sync')
    const stale = !last || (Date.now() - new Date(last).getTime() > AUTO_SYNC_INTERVAL_MS)
    if (!stale) return

    setAutoSync('syncing')
    try {
      await pullAll(() => {})
      localStorage.setItem('pos_last_sync', new Date().toISOString())
      writeAuditLog('CLOUD_AUTO_PULL', newSession, { trigger: 'login' })
      // 用 reload 讓 useStore 重新從本機（已被 cloudSync 覆蓋）拉資料；session 在 sessionStorage 不會掉
      setAutoSync('done')
      setTimeout(() => location.reload(), 600)
    } catch (e) {
      console.warn('[POS] auto-pull failed:', e)
      writeAuditLog('CLOUD_AUTO_PULL_FAIL', newSession, { error: e.message })
      setAutoSync('failed')
      setTimeout(() => setAutoSync(null), 2500)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const cleanup = startIdleTimer(handleLogout)
    return cleanup
  }, [session, handleLogout])

  const handleNavChange = useCallback((v) => {
    setView(v)
    setMenuOpen(false)
  }, [setView])

  if (!store.ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'var(--bg-base)',color:'var(--text-secondary)',fontSize:14}}>
      {t('common.loading')}
    </div>
  )
  if (!session) return <LoginScreen onLogin={handleLogin}/>

  const can = (perm) => hasPermission(session, perm)

  const NAV_LABELS = {
    dashboard:t('nav.dashboard'), pos:t('nav.pos'), shifts:t('nav.shifts'),
    inventory:t('nav.inventory'), purchase:t('nav.purchase'), waste:t('nav.waste'),
    stocktake:t('nav.stocktake'), promotions:t('nav.promotions'), members:t('nav.members'),
    reports:t('nav.reports'), accounting:t('nav.accounting'), kasbon:t('nav.kasbon'), orders:t('nav.orders'), settings:t('nav.settings'),
  }

  return (
    <div style={{ display:'flex', height:'100dvh', background:'var(--bg-base)', overflow:'hidden' }}>
      {storageError && (
        <div style={storageBanner.root} role="alert">
          <AlertTriangle size={16} style={{flexShrink:0}}/>
          <span style={{flex:1, minWidth:0}}>
            {t('common.storage_error')}
            <span style={{opacity:.7, marginLeft:6, fontSize:11, fontFamily:'var(--font-mono)'}}>({storageError.key} · {storageError.error})</span>
          </span>
          <button onClick={() => setStorageError(null)} style={{color:'inherit', padding:4, display:'flex'}} aria-label={t('common.close')}>
            <X size={15}/>
          </button>
        </div>
      )}
      {!isMobile && (
        <Sidebar view={view} setView={setView} session={session}
          lowStockCount={lowStockCount} todayRevenue={todayRevenue}
          todayOrders={todayOrders} onLogout={handleLogout}
          pendingOrders={pendingOrders} openShift={store.openShift}/>
      )}

      {isMobile && menuOpen && (
        <div style={mob.overlay} onClick={() => setMenuOpen(false)} />
      )}
      {isMobile && (
        <div style={{...mob.drawer, transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)'}}>
          <Sidebar view={view} setView={handleNavChange} session={session}
            lowStockCount={lowStockCount} todayRevenue={todayRevenue}
            todayOrders={todayOrders} onLogout={handleLogout}
            pendingOrders={pendingOrders} openShift={store.openShift}/>
        </div>
      )}

      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minWidth:0 }}>
        {isMobile && (
          <div style={mob.topBar}>
            <button onClick={() => setMenuOpen(v => !v)} style={mob.menuBtn}>
              {menuOpen ? <X size={20}/> : <Menu size={20}/>}
            </button>
            <div style={mob.topTitle}>{NAV_LABELS[view] || 'POS'}</div>
            <div style={{ width: 36 }}/>
          </div>
        )}
        <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <Suspense fallback={
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,color:'var(--text-secondary)',fontSize:14}}>
              {t('common.loading')}
            </div>
          }>
            {view === 'dashboard'  && can('pos.use')         && <DashboardPage  store={store} session={session}/>}
            {view === 'pos'        && can('pos.use')         && <POSPage        store={store} session={session}/>}
            {view === 'shifts'     && can('pos.use')         && <ShiftPage      store={store} session={session}/>}
            {view === 'inventory'  && can('inventory.view')  && <InventoryPage  store={store} session={session}/>}
            {view === 'waste'      && can('inventory.view')  && <WastePage      store={store} session={session}/>}
            {view === 'members'    && can('members.view')    && <MembersPage    store={store} session={session}/>}
            {view === 'reports'    && can('reports.view')    && <ReportsPage    store={store} session={session}/>}
            {view === 'accounting' && can('accounting.view') && <AccountingPage store={store} session={session}/>}
            {view === 'purchase'   && can('purchase.view')   && <PurchasePage   store={store} session={session}/>}
            {view === 'stocktake'  && can('stocktake.view')  && <StocktakePage  store={store} session={session}/>}
            {view === 'promotions' && can('promotions.view') && <PromotionsPage store={store} session={session}/>}
            {view === 'kasbon'     && can('accounting.view') && <KastonPage     store={store} session={session}/>}
            {view === 'orders'     && can('pos.use')         && <OrdersPage />}
            {view === 'settings'   && can('settings.view')   && <SettingsPage   session={session} onLogout={handleLogout} store={store}/>}
          </Suspense>
        </main>
      </div>

      {autoSync && (
        <div style={syncOverlay.root}>
          <div style={syncOverlay.box}>
            <Cloud size={28} style={{
              color: autoSync === 'failed' ? 'var(--red)' : 'var(--blue)',
              animation: autoSync === 'syncing' ? 'spin 1.4s linear infinite' : 'none',
            }}/>
            <div style={{textAlign:'center'}}>
              <div style={{fontWeight:600, fontSize:15}}>
                {autoSync === 'syncing' && t('login.sync_syncing')}
                {autoSync === 'done' && t('login.sync_done')}
                {autoSync === 'failed' && t('login.sync_failed')}
              </div>
              <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:4}}>
                {autoSync === 'syncing' && t('login.sync_pulling')}
                {autoSync === 'failed' && t('login.sync_check_network')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const storageBanner = {
  root: {
    position:'fixed', top:0, left:0, right:0, zIndex:10000,
    display:'flex', alignItems:'center', gap:10,
    padding:'10px 16px',
    background:'var(--red)', color:'#fff',
    fontSize:13, fontWeight:600, lineHeight:1.5,
    boxShadow:'var(--shadow-md)',
  },
}

const syncOverlay = {
  root: {
    position:'fixed', inset:0, zIndex:9999,
    background:'rgba(44,42,38,0.4)', backdropFilter:'blur(4px)',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  box: {
    background:'var(--bg-raised)', borderRadius:'var(--r4)',
    padding:'28px 36px', display:'flex', flexDirection:'column',
    alignItems:'center', gap:14,
    boxShadow:'var(--shadow-lg)', border:'1px solid var(--border-dim)',
    minWidth:260, maxWidth:360,
  },
}

const mob = {
  overlay: {
    position:'fixed', inset:0, zIndex:998,
    background:'rgba(44,42,38,0.2)', backdropFilter:'blur(2px)',
  },
  drawer: {
    position:'fixed', top:0, left:0, bottom:0,
    width:260, zIndex:999,
    transition:'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
  },
  topBar: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'10px 14px', background:'var(--bg-raised)',
    borderBottom:'1px solid var(--border-dim)',
    boxShadow:'var(--shadow-sm)', flexShrink:0,
  },
  menuBtn: {
    width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
    borderRadius:'var(--r2)', color:'var(--text-primary)',
  },
  topTitle: { fontSize:15, fontWeight:600, color:'var(--text-primary)' },
}
