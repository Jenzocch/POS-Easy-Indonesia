import { Z } from '../utils/zIndex'

// 共用置中 Modal：把原本散落在 14 個檔案裡、各自手刻的「全螢幕遮罩 + 置中卡片」重複樣式
// 收斂成一個元件。每個呼叫端仍然完全掌控自己的 header/body/footer 內容（透過 children），
// 這裡只統一負責：遮罩、置中、尺寸上限、進場動畫、z-index 分層——這些原本 14 個檔案各自
// 抄一份、抄到 border-radius、box-shadow、maxHeight 都各自漂移出好幾種寫法的部分。
//
// API 刻意走輕量、children-based：多數呼叫端把自己原本的 header JSX 原封不動搬進來當
// children 就好（保留每個 modal 原本的標題排版、副標題、icon 等差異），不用套用一個死板的
// slot 系統。只有 title 這個小欄位是例外——ShiftPage.jsx 原本就有一個「標題文字 + ✕」的
// 通用小 Modal wrapper，這裡原樣提供同等功能，讓那類簡單案例不用自己重寫 header。
//
// overlayStyle / panelStyle 是逃生艙：少數 modal 原本的遮罩顏色、模糊程度、置中位置（例如
// PriceLookupModal 貼齊畫面上緣而非正中央）跟這裡的預設值不同，用這兩個 prop 覆寫，確保
// 遷移後畫面像素級一致，不因為共用元件而悄悄改變原本的視覺呈現。
export default function Modal({
  children,
  onClose,
  closeOnOverlayClick = true,
  title,
  maxWidth = 480,
  overlayStyle,
  panelStyle,
  className = 'animate-scale', // 復用 index.css 既有的進場動畫 class，不另外發明新動畫
}) {
  return (
    <div
      style={{ ...overlayBase, ...overlayStyle }}
      onClick={closeOnOverlayClick && onClose ? onClose : undefined}
    >
      <div
        style={{
          ...panelBase,
          maxWidth,
          padding: title ? 0 : 24,
          ...panelStyle,
        }}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div style={headerBase}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
            <button onClick={onClose} style={{ padding: 4 }}>✕</button>
          </div>
        )}
        {title ? <div style={{ padding: '16px 18px' }}>{children}</div> : children}
      </div>
    </div>
  )
}

const overlayBase = {
  position: 'fixed', inset: 0,
  zIndex: Z.MODAL_OVERLAY,
  background: 'rgba(44,42,38,0.25)',
  backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// RWD-01：maxHeight + overflowY，手機上內容比視窗高時可捲動，不會被裁掉按不到底部按鈕
const panelBase = {
  position: 'relative', // 讓 zIndex 真的生效，也讓呼叫端未來需要在卡片內做絕對定位時有個依附基準
  zIndex: Z.MODAL,
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--r4)',
  boxShadow: 'var(--shadow-lg)',
  width: '90%',
  maxHeight: '88vh',
  overflowY: 'auto',
}

const headerBase = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 18px', borderBottom: '1px solid var(--border-dim)',
}
