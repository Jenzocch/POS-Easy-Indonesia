import { useState, useEffect } from 'react'
import { Printer, Wifi } from 'lucide-react'
import QRCode from 'qrcode'
import { t } from '../../i18n'

// ── 硬體設定 ────────────────────────────────────────────────
export default function HardwareTab({ session }) {
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
