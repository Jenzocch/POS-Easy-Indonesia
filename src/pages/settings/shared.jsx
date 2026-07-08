// 由 SettingsPage.jsx 拆分出的共用元件與樣式：Section 元件、ss 樣式物件
// 供多個 Settings 分頁（tab）共用，避免重複定義或循環 import。
// FL 不在此定義——改 re-export 全域共用的 src/components/FieldLabel.jsx（見該檔案
// 註解：原本 6 個檔案各自定義 7 份重複版本，已統一成單一來源，這裡不重新引入重複）。

export function Section({ title, children }) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:13, fontWeight:600, marginBottom:10, color:'var(--text-primary)'}}>{title}</div>
      {children}
    </div>
  )
}

export { default as FL } from '../../components/FieldLabel'

export const ss = {
  root:{display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:12,overflow:'hidden'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0},
  title:{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600},
  // RWD-02：overflowX auto（照 POSPage ps.catWrap 模式）——9 個分頁籤在手機上可橫捲，不再被硬裁 6 個進不去
  tabBar:{display:'flex',borderBottom:'1px solid var(--border-dim)',flexShrink:0,overflowX:'auto'},
  tab:{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',fontSize:13,fontWeight:500,transition:'all 150ms',borderRadius:0,letterSpacing:'.01em',whiteSpace:'nowrap',flexShrink:0},
  // overlay/modal 已移除——UsersTab/BackupTab/CloudSyncTab 的彈窗改用共用 <Modal>（src/components/Modal.jsx）
}
