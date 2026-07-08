// 由 SettingsPage.jsx 拆分出的共用元件與樣式：Section/FL 元件、ss 樣式物件
// 供多個 Settings 分頁（tab）共用，避免重複定義或循環 import。

export function Section({ title, children }) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:13, fontWeight:600, marginBottom:10, color:'var(--text-primary)'}}>{title}</div>
      {children}
    </div>
  )
}

export function FL({children}){return <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:5,letterSpacing:'.03em'}}>{children}</div>}

export const ss = {
  root:{display:'flex',flexDirection:'column',height:'100%',padding:'16px',gap:12,overflow:'hidden'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0},
  title:{fontFamily:'var(--font-serif)',fontSize:20,fontWeight:600},
  // RWD-02：overflowX auto（照 POSPage ps.catWrap 模式）——9 個分頁籤在手機上可橫捲，不再被硬裁 6 個進不去
  tabBar:{display:'flex',borderBottom:'1px solid var(--border-dim)',flexShrink:0,overflowX:'auto'},
  tab:{display:'flex',alignItems:'center',gap:7,padding:'9px 14px',fontSize:13,fontWeight:500,transition:'all 150ms',borderRadius:0,letterSpacing:'.01em',whiteSpace:'nowrap',flexShrink:0},
  overlay:{position:'fixed',inset:0,background:'rgba(44,42,38,0.25)',backdropFilter:'blur(2px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200},
  // RWD-01：maxHeight + overflowY，手機上表單長於視窗時可捲動
  modal:{background:'var(--bg-raised)',border:'1px solid var(--border-dim)',borderRadius:'var(--r4)',padding:24,width:'90%',maxWidth:420,maxHeight:'88vh',overflowY:'auto'},
}
