// ── 資安設定說明 ──────────────────────────────────────────────
export default function SecurityTab({ session }) {
  const items = [
    { icon:'🔐', title:'PBKDF2 密碼加密', desc:'密碼以 PBKDF2（200,000次迭代 + 隨機 salt）儲存，即使資料庫外洩也無法破解', status:'已啟用', ok:true },
    { icon:'⏱', title:'閒置自動鎖定', desc:'30 分鐘無操作自動回到登入畫面，防止員工離開後他人存取', status:'30分鐘', ok:true },
    { icon:'🚫', title:'暴力破解防護', desc:'同一帳號連續 5 次輸入錯誤密碼，鎖定 30 分鐘', status:'已啟用', ok:true },
    { icon:'📋', title:'稽核日誌', desc:'所有登入、結帳、刪除、匯出操作均記錄時間戳、操作人，最多保留 2000 筆', status:'已啟用', ok:true },
    // DEAD-14：原文案宣稱「所有輸入資料」都清洗，但 sanitizeObject 實際只接在促銷/進貨兩個表單，
    // 商品/會員/結帳輸入未套用——降級文案為「部分套用」，不再誇大涵蓋範圍。
    { icon:'🧹', title:'XSS / Injection 防護', desc:'促銷、進貨等表單輸入在儲存前清洗，過濾 script 標籤等惡意字串；尚未涵蓋商品/會員/結帳輸入', status:'部分套用', ok:false },
    // DEAD-14 修復：電話號碼已接上 maskPhone，會員列表/詳情/POS 結帳的會員卡片皆顯示遮罩後號碼
    // （09xx****xxx）；姓名維持明碼顯示（員工仍需辨識顧客本人），故標記為部分套用而非全面。
    { icon:'👁', title:'個資遮罩', desc:'會員列表、詳情、結帳畫面的電話號碼已套用遮罩（09xx****xxx）；姓名維持明碼顯示以利員工辨識顧客', status:'部分套用', ok:true },
    // DEAD-14：自動備份實際觸發時機是登出時 + 每日第一次登入時，並非「每次重要操作前」，修正描述避免誇大。
    { icon:'💾', title:'自動備份', desc:'登出時與每日首次登入時自動快照，最多保留 10 份，可匯出 JSON 檔案離線保存', status:'已啟用', ok:true },
    { icon:'🔒', title:'Session 管理', desc:'登入 Token 存於 sessionStorage（關閉分頁即失效），包含到期時間，不存密碼', status:'8小時', ok:true },
  ]

  return (
    <div style={{overflowY:'auto',height:'100%',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'4px 0',flexShrink:0}}>
        以下為系統內建的資安防護，所有措施均在瀏覽器端實作，無需額外設定。
      </div>
      {items.map(item=>(
        <div key={item.title} className="card" style={{padding:'13px 16px',display:'flex',gap:14,alignItems:'flex-start'}}>
          <div style={{fontSize:22,flexShrink:0,marginTop:2}}>{item.icon}</div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontWeight:600,fontSize:13}}>{item.title}</span>
              <span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:item.ok?'var(--green-dim)':'var(--red-dim)',color:item.ok?'var(--green)':'var(--red)'}}>
                {item.status}
              </span>
            </div>
            <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>{item.desc}</div>
          </div>
        </div>
      ))}
      <div style={{background:'var(--gold-dim)',border:'1px solid var(--gold-dim)',borderRadius:10,padding:'12px 16px',fontSize:12,color:'var(--gold-bright)',lineHeight:1.7,flexShrink:0}}>
        <strong>升級至雲端版後額外獲得：</strong> HTTPS 加密傳輸 · Row Level Security（每店資料隔離）· 異地備份 · WAF 防火牆 · DDoS 防護
      </div>
    </div>
  )
}
