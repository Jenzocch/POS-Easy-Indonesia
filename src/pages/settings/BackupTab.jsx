import { useState, useEffect } from 'react'
import { Database, Download, Upload, RefreshCw } from 'lucide-react'
import {
  writeAuditLog, createBackup, getBackupList, restoreBackup, exportBackupFile, importBackupFile,
} from '../../utils/security'
import {
  isElectron, loadBackups, restoreBackup as dbRestoreBackup, exportData as dbExportData, importData as dbImportData,
} from '../../utils/dataAccess'
import { downloadBlob } from '../../utils/csv'
import { t } from '../../i18n'
import Modal from '../../components/Modal'

// ── 備份還原 ──────────────────────────────────────────────────
// Electron：清單 / 還原 / 匯入 / 匯出全走 IPC（SQLite backups 表 + backups/ JSON 檔）。
// 以前這頁接的是 security.js 的 localStorage 快照函式，在 Electron 上是「按了沒事」的
// 死路 — 損毀復原後店家在 App 內完全沒有可執行的還原途徑。
// 瀏覽器：維持原本 localStorage 行為不變。
export default function BackupTab({ session }) {
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
        <Modal maxWidth={360}>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{t('settings.confirm_restore')}</div>
              <div style={{fontSize:13,color:'var(--text-secondary)'}}>{t('settings.restore_warning')}</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={()=>doRestore(restoring)}>{t('settings.confirm_restore_btn')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setRestoring(null)}>{t('common.cancel')}</button>
            </div>
        </Modal>
      )}

      {importing && (
        <Modal maxWidth={360}>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{t('settings.confirm_import')}</div>
              <div style={{fontSize:13,color:'var(--text-secondary)'}}>{t('settings.import_warning')}</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger" style={{flex:1}} onClick={doImport}>{t('settings.confirm_import_btn')}</button>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setImporting(null)}>{t('common.cancel')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}
