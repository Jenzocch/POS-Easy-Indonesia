// 共用的小型欄位標籤（表單欄位上方的小字說明）
// 原本在 6 個檔案中各自定義了 7 份幾乎一致的版本（部份叫 FieldLabel，部份叫 FL），
// 這裡統一成單一來源。樣式採用 7 份定義中多數（6/7）採用的版本：
// fontSize:11 / marginBottom:5 / letterSpacing:'.03em'，不含 textTransform。
export default function FieldLabel({ children }) {
  return <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:5,letterSpacing:'.03em'}}>{children}</div>
}
