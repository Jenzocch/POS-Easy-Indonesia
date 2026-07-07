# POS Easy Indonesia — UX / 效能 / 代碼健康 總體檢報告

> 彙整自六個視角的對抗式驗證（perf-jank、perf-load、ux-flow、rwd、dead-code、readability），
> 共 67 條 findings，**66 條 CONFIRMED、1 條 DOWNGRADED（RWD-04）、0 條 REFUTED**。
> 所有數字均經獨立實測（production build + Playwright CPU 4x throttle、5000 訂單/300 商品/200 會員 seed）
> 或逐檔逐行核對。本報告只描述問題與方案，**未修改任何程式碼**。

---

## 1. 執行摘要

整體健康度：**功能骨架完整、資料層邏輯紮實，但「接線缺失」與「台灣模板殘留」是兩大系統病**——多個已寫好的引擎（促銷、速率限制、Electron SQLite 包裝）從未接進 UI，種子資料/格式/文案大量沿用台灣舊版。效能問題全部可歸因、可修復，無架構性死結。

最重要的 5 個發現：

1. **進貨「標記付款」會讓全站白屏且重整後復現**（`src/pages/PurchasePage.jsx:132` 寫入 STATUS map 查無的 `paid`，唯一 ErrorBoundary 在 `main.jsx:12` 包住整個 App）——一行修復，最高優先。
2. **Google Fonts render-blocking：離線/弱網白屏 12 秒以上**（`index.html:17` + `src/index.css:1`），實測 FCP 1:1 跟著字型 CSS 走（76ms vs 6076ms @6s stall）。
3. **切頁停頓根因是條件式 unmount/remount**（`src/App.jsx:142-154`）：warm 切回 POS 實測 639ms paint / 1361ms settle @4x，所有 useMemo 歸零重算。
4. **訂單全史塞單一 localStorage key，~19k 筆撞 5MB quota 且錯誤被靜默吞掉**（`src/store/useStore.js:73,165`）——約營業 316 天後開始**默默丟單**。
5. **手機上「新增/編輯商品」modal 超出視窗且不可捲動，儲存鈕完全按不到**（`src/pages/InventoryPage.jsx:830`，實測 360x640 按鈕 y=718.9 在視窗外）；同病 Settings 9 個分頁籤手機上 6 個不可達（`SettingsPage.jsx:1249`）。

---

## 2. 🔴 頁面切換停頓：根因清單與長久解法

### 2.1 根因清單（按貢獻度排序）

| # | ID | 根因 | 位置 | 實測證據（CPU 4x） | Impact / Effort |
|---|----|------|------|--------------------|-----------------|
| 1 | PERF-02 | **切頁 = 條件式 unmount/remount**：`{view==='x' && <Page/>}`，14 頁全靜態 import，所有頁內 useMemo（Dashboard analytics30d、Accounting buildPnL/buildBalanceSheet、Reports perf30d/abcAnalysis）每次 mount 歸零重算 | `src/App.jsx:142-154`；`DashboardPage.jsx:78-91`、`AccountingPage.jsx:40-42` | 冷切 POS click→paint=756ms / settle=1535ms（7 個 long task）；冷切 Members=1970ms；**warm 重切 POS 仍 639ms paint / 1361ms settle** | high / medium |
| 2 | PERF-04 | **POS 頁 300 張 ProductCard 無虛擬化 + 每次 remount 重播進場動畫**：ProductCard 無 React.memo、staggered animationDelay 把工作攤成連續 long task、每 render 呼叫 daysUntilExpiry | `src/pages/POSPage.jsx:212-215,293,298,302-310` | 開班後 warm 切回 POS 639ms/1361ms vs 未開班空狀態僅 ~80ms——**300 卡片重建+動畫重播就是差額主體** | high / medium |
| 3 | PERF-03 | **結帳主執行緒阻塞，隨歷史單量線性惡化**：每筆結帳 JSON.stringify 全量 orders + localStorage.setItem + autoJournal 全量 flatMap+sort | `src/store/useStore.js:73,165,168-172` | 5000 單（1.53MB）：stringify 19-30ms + setItem 73-83ms + autoJournal ~128ms + App 全樹重渲染 81-133ms，**單次結帳合計 ~360-630ms** | high / large |
| 4 | PERF-05 | **useStore 單一 hook 無 selector**：任何 state 變動重渲染整個 App 樹；`useStore.js:573-578` 四個衍生值（categories/todayOrders/todayRevenue/todayProfit）每 render 裸算，todayProfit 內 products.find 每單每品項 O(P) | `src/store/useStore.js:573-578`；`App.jsx:29` | **POS 加一件商品 click→paint = 81-133ms**（掉 5-8 幀），快速連續掃碼必掉拍；低階 Android 上接近 high | medium / large |
| 5 | PERF-06 | **computeMemberRFM O(members×orders)**：每會員全量 filter 訂單，effectiveOrders 也每會員重跑 = 2×100 萬次迭代 | `src/utils/analytics.js:105,136-138`；`MembersPage.jsx:44-48`、`DashboardPage.jsx:84` | computeAllRFM=40.6ms @1x（≈160ms @4x）；單趟 groupBy 改寫 2.2ms（**18x 加速、200 會員輸出 0 差異**） | medium / small |
| 6 | PERF-08 | **Sidebar 每秒時鐘重渲染整個 Sidebar 子樹**（13 nav 鈕 + icon + 營收卡）；手機 drawer 隱藏時仍 mounted 照跑 | `src/components/Sidebar.jsx:25-29`；`App.jsx:122-128` | 常駐背景稅，非切頁主因 | low / small |

> ⚠️ 量測陷阱：`POSPage.jsx:102` 未開班時只渲染輕量空狀態（~80ms）。任何後續量測**必須先 seed `pos2_shifts` 開班**，否則會嚴重低估 POS 頁成本。

### 2.2 長久解法設計（分步驟實施方案）

**步驟 1（small，無依賴，先做）— 衍生值 memo 化 + RFM 單趟改寫**
- `useStore.js:573-578` 用 useMemo 包四個衍生值（依賴 `[orders, products]`），todayProfit 內先建 `Map<id,cost>` 消掉 products.find。<30 行改動。
- `analytics.js`：effectiveOrders 只做一次，一趟 for 依 memberId 建 `Map<id,orders[]>`，computeMemberRFM 改吃預過濾小陣列。用 vitest 以現有輸出做等價斷言（已驗證 0 mismatches）。
- 風險：低。注意此步後加購物車仍會因 App 全樹重渲染打穿（300 卡片 reconcile），需步驟 2 才壓到 <16ms。

**步驟 2（medium，依賴步驟 1）— POS/Dashboard keep-alive + ProductCard memo**
- `App.jsx:142-154` 高頻頁（POS/Dashboard）改為常駐 + `display:none` 或 activity 切換；冷頁維持條件渲染但 analytics 結果放 module-level cache（以 orders reference 為 key）。
- `POSPage.jsx`：ProductCard 加 React.memo + `onAdd` 用 useCallback（目前 `:214` 每 render 建新箭頭函式會打穿 memo）；進場動畫只播首次；daysUntilExpiry 以 `[products]` 為依賴的 useMemo 批次算成 Map（300 商品 <1ms）。
- **風險（已驗證存在）**：POSPage 的全域 window keydown（F1/F2/F3/`/`）在 keep-alive 下必須依 active view gate，否則在其他頁打字會誤觸。
- Dashboard 常駐後 analytics30d 只在 orders reference 變時重算，配合步驟 1 的單趟 RFM 成本可忽略。

**步驟 3（small，可與步驟 4 解耦先做）— autoJournal 增量化**
- `useStore.js:168-172` 新單 append 而非全量 flatMap+sort，先砍掉 ~1/3 結帳阻塞（~128ms @4x）。

**步驟 4（large，依賴步驟 3，與 §3 LOAD-6 同一工程）— 訂單存儲層重構**
- 分月 key 或遷 IndexedDB；近 90 天 in-memory。
- **耦合改動點（已核實行號）**：`src/utils/security.js:259` BACKUP_KEYS（createBackup/restoreBackup）、`src/utils/cloudSync.js:33,163,189` 引用 `'pos2_orders'`。
- 風險：中高。涉及備份/還原/雲端同步三條路徑，需遷移腳本 + 相容舊資料。

**步驟 5（small）— Sidebar 時鐘**：抽 `<ClockBadge>` 把每秒 reconcile 縮到兩個文字節點；手機 drawer 關閉時停 interval。

**（後續，large）** zustand/selector 遷移，徹底解掉 App 全樹重渲染——在步驟 1+2 之後效益遞減，可排最後。

---

## 3. 載入速度：發現與建議

| # | ID | 發現 | 位置 | 預期收益 | Impact / Effort |
|---|----|------|------|----------|-----------------|
| 1 | LOAD-1 / PERF-01 | **Google Fonts render-blocking stylesheet 把 FCP 綁死在字型 CSS 網路延遲上**；`sw.js:39` 的 `r.ok && 同源` 檢查使跨域字型 CSS 永不進 SW cache；連 `index.html:21` 用系統字型的「啟動中…」splash 也被擋——阻塞完全零收益。兩個阻塞點：`index.html:17` 與 `src/index.css:1` 巢狀 @import（**兩處都要刪**，都進了 production build） | `index.html:16-17`、`src/index.css:1`、`public/sw.js:39` | 實測：字型 abort → FCP=116ms；懸掛 → **12,916ms**。修復後弱網/離線 FCP 從十幾秒降到 ~100ms 量級 | high / small |
| 2 | LOAD-2 / PERF-07 | **supabase chunk（210,537B / gzip 54,464B）被靜態 import 進啟動關鍵路徑並 modulepreload**，未設雲端的用戶也要載。getCloudConfig/isCloudEnabled（`supabaseClient.js:6-19,52-54`）只讀 localStorage、零 SDK 依賴，可直接抽離；getSupabase 改 async + `await import()`（`_client` 單例 `:36` 與失效邏輯一起搬） | `src/utils/supabaseClient.js:2`、`src/App.jsx:5`、`SyncStatusBadge.jsx:3` | 啟動關鍵路徑 **-210KB（gzip -54KB）** 下載+parse | high / small |
| 3 | LOAD-3 | **全部 13 頁打進主 chunk**（僅 BarcodeScannerModal lazy）：次要頁 + 專屬依賴 jsbarcode（僅 `InventoryPage.jsx:3`）、qrcode（僅 `SettingsPage.jsx:3`）合計 ~288KB，占主 chunk（599,037B / gzip 150,574B）近半。Login/Dashboard/POS/Sidebar 以外全改 React.lazy + Suspense（fallback 重用 splash 樣式） | `src/App.jsx:9-21` | 主 chunk **約 -288KB（-49%）** | high / medium |
| 4 | LOAD-4 | **i18n 三語全量進主 chunk（~108KB minified），執行期只用一種**；換語言本來就走整頁 reload（`translations.js:4` 註解自承），單語載入零 UX 代價。重排為 `keys/<lang>/<feature>.js`，main.jsx 先 `await import(...)` 再 render（避免 top-level await 的舊 WebView 相容風險） | `src/i18n/translations.js:6-14,24-29` | **-70KB minified**（gzip -15~20KB；收益主要在 parse/記憶體） | medium / medium |
| 5 | LOAD-5 | **SW precache 不含任何 build 資產與 icon**（CORE 僅 4 項，`sw.js:3`），離線可靠性機率性；HTML network-first 無 timeout（`sw.js:28-33`），弱網每次開啟等完整 RTT。改 vite-plugin-pwa 自動 precache + navigation ~3s timeout race。**若做 LOAD-3 lazy 化，precache 完整清單從 nice-to-have 變成必要**，兩項要一起修。另 manifest name/lang 仍是 'POS Pro 雜貨店管理系統'/'zh-TW' | `public/sw.js:3,28-33,39` | 離線開啟從「機率性成功」變確定；弱網重複開啟省 1 個 RTT | medium / medium |
| 6 | LOAD-6 | **訂單全史單一 localStorage key，~260B/筆 → ~19-20k 筆撞 Chromium ~5MB quota；`saveLS` catch{} 靜默吞錯 → 新訂單默默不落盤**（60 單/天 ≈ 316 天觸頂）。BACKUP_MAX=10 份全量副本（`security.js:258-289`）讓天花板提早；createBackup 失敗也靜默（`:289`，`App.jsx:58` 不檢查回傳）。**quota 錯誤浮出 UI 是三行改動（saveLS catch 裡 dispatch 全域 error event），應立即做**——這是「默默丟單」與「可感知故障」的分界線 | `src/store/useStore.js:73,165`、`src/utils/security.js:258-289` | 消除資料遺失定時炸彈；中期遷 IndexedDB（見 §2 步驟 4） | high / small(止血)→large(根治) |
| 7 | LOAD-7 | **lucide-react tree-shaking 正常（非問題，供排除）**：22 檔 72 icon named import，react-vendor 140,998B / gzip 45,254B 屬合理基線 | `src/App.jsx:2` | 不需處理。合計帳：936KB → 修完 1-4 後 **~440KB** | — |

---

## 4. 操作邏輯與連動缺失：現況 vs 理想流程

| # | ID | 場景 | 現況 | 理想流程 | 位置 | Impact / Effort |
|---|----|------|------|----------|------|-----------------|
| 1 | FLOW-12 | 進貨標記付款 | 寫入 `status:'paid'`，STATUS map（僅 draft/ordered/received/partial）查無此鍵 → PurchaseList 渲染 TypeError → **唯一 ErrorBoundary 在 main.jsx:12 → 全站白屏，重整後再點進貨頁再炸（壞狀態已持久化）**；paid 單還被 pending filter 算回待處理 | onMarkPaid 只寫 paidDate、不改 status（PayableTab `:809-810` 本就以 paidDate 區分）；加 `STATUS[po.status] \|\| STATUS.draft` fallback；一次性修復既有 paid 壞資料 | `src/pages/PurchasePage.jsx:12-17,106,129-137,161,170` | **high / small** |
| 2 | FLOW-01 | 結帳套用促銷 | applyPromotions 四型引擎已寫好（`PromotionsPage.jsx:16-56`）但全案零呼叫，連 cloudSync 都同步 promotions 表——**每單要收銀員心算手填折讓** | POSPage 掛載時 loadPromotions 進 store；pay stage 自動列出命中活動（可單筆取消）；checkout 寫入 order.promoDiscounts；退貨沿用既有 ratio 分攤（`useStore.js:319-322`） | `src/pages/PromotionsPage.jsx:16`、`CartPanel.jsx:36`、`useStore.js:212` | high / medium |
| 3 | FLOW-02 | 散客退貨 | RefundModal 唯一入口在會員頁消費紀錄（`MembersPage.jsx:263-266`）——**非會員訂單無任何退貨路徑**，而 store 層 refund 對 memberId:null 完全可用 | Reports 或銷售紀錄列表對 completed 訂單掛 RefundModal（props 全現成；priorRefunds 照抄 `MembersPage.jsx:278` 範本） | `src/pages/MembersPage.jsx:264` | high / small |
| 4 | FLOW-03 | 盤點盤虧 | applyAdjustments 只改 stock + audit 計數——盤虧要去損耗頁**重打一次，且會二次扣庫存**（recordWaste 必扣 stock） | review 確認時對 shortages 批次產生 wasteLog（reason='盤虧'），走不扣庫存路徑（recordWaste 加 skipStockDeduct 參數）；Electron 側 dataAccess 需一併確認 | `src/pages/StocktakePage.jsx:73-82`、`useStore.js:485-486` | high / small |
| 5 | FLOW-04 | 進貨收貨 | 自動加庫存（好），但 **item.unitCost 不回寫 product.cost、不產生會計分錄**（autoJournal 無進貨來源，現況靠手打分錄如 SEED JM003）；todayProfit 以 prod.cost 計毛利直接失真 | 收貨時回寫成本（建議**移動平均**而非覆蓋，與 stock 更新合併為一次 updateProduct）；新增 purchaseToJournalEntries 雙分錄 | `src/pages/PurchasePage.jsx:77-104,129-137`、`useStore.js:168-171,578` | high / medium |
| 6 | FLOW-05 | 雲端同步 | 只有登入時 auto-pull（且需 stale>10min），**push 永遠手動**——整天營業資料沒有自動上雲時點；SyncStatusBadge 24 小時才轉黃 | endShift/logout 掛 fire-and-forget pushAll；checkout 後 debounce 增量 push；成功寫 `pos_last_sync`（徽章 `:20` 每 5 秒讀此鍵會自動變綠） | `src/App.jsx:60-81`、`cloudSync.js:210`、`SyncStatusBadge.jsx:41,84` | high / medium |
| 7 | FLOW-06 | 取回掛單 | recallHeld 首行 setCart 直接覆蓋，**正在結的單（含 activeMember/manualDiscount）靜默消失**，cart 無持久化覆蓋即遺失；對照刪除鈕反而有 confirm | 取回前若 cart 非空先自動 holdCart（交換式）——holdCart 已保存 cart/member/manualDiscount 三者，語意完全對稱，POSPage onRecall 包一層即可 | `src/store/useStore.js:428-437`、`POSPage.jsx:268`、`HeldOrdersModal.jsx:43` | medium / small |
| 8 | FLOW-07 | 刪損耗紀錄 | removeWaste 只 filter，**不回補庫存**——記錯一筆要再去庫存頁手動改回；confirm 文案也未提示 | removeWaste 依 w.productId/\|w.qty\| 回補（寫入時已帶）；Electron 側 dataAccess 加 stock delta | `src/store/useStore.js:491-494`、`WastePage.jsx:184` | medium / small |
| 9 | FLOW-08 | 現金整付結帳 | 5 次點擊（點商品→去結帳→快捷鈕→確認收款→繼續銷售），done stage 不自動離開（CartPanel 零 useEffect） | 「整付一鍵收款」+ done stage 在 cart 由空變非空時自動 reset（**注意 checkout 本身會 setCart([])，要監聽邊緣而非任意變化**） | `src/components/CartPanel.jsx:106,146-148,300-307` | medium / small |
| 10 | FLOW-09 | 新店初始化 | 首開即 34 筆台灣中文雜貨種子（471 條碼、台幣定價），**無批次刪除**：清空要點 68 次；SEED_ORDERS 更是完全無 UI 可清（污染報表） | 空狀態引導 + 批次刪除 + 種子印尼本地化（SEED_MANUAL 可在會計頁逐筆刪，`AccountingPage.jsx:231`，非「刪不掉」） | `src/store/useStore.js:19-64`、`InventoryPage.jsx:138-169` | medium / small |
| 11 | FLOW-10 | 開班 | POS 全頁擋板 → 跳 Shifts 頁 → 開 modal → 輸零用金 → 確認 → 手動切回 POS，**5 次互動 + 2 次跳頁** | 抽開班 Modal 共用元件，POS 擋板原地開啟（startShift 已可取用），5 互動降 3、0 跳頁 | `src/pages/POSPage.jsx:102-120`、`ShiftPage.jsx:99-102` | medium / small |
| 12 | FLOW-11 | 刪促銷 | 一點即毀無確認——**全 App 唯一無確認的刪除**（會員/損耗/掛單/庫存四個對照組都有），刪除鈕還緊鄰編輯鈕 | 最低成本包 confirm；較佳：刪除移入編輯 modal、日常停用走既有 toggle | `src/pages/PromotionsPage.jsx:196-199` | low / small |

---

## 5. 三端適配問題清單（按裝置分組）

### 📱 手機（360×640 實測）

| ID | 問題 | 位置 | 驗證 | Impact / Effort |
|----|------|------|------|-----------------|
| RWD-01 | **新增/編輯商品 modal h=935.7、top=-147.8，無 maxHeight/overflow，不可捲動；Simpan 鈕 y=718.9 完全在視窗外按不到**。同病：SettingsPage `:1252`、MembersPage `:403`、WastePage `:198`；RefundModal `:159-161`（maxHeight:88vh）是現成範本 | `src/pages/InventoryPage.jsx:830` | Playwright 獨立重測，數字與原報告一致到小數 | high / small |
| RWD-02 | **Settings 9 個 tab（非 7）被硬裁、不可捲**：scrollWidth 972 vs clientWidth 328，**6 個分頁（硬體/安全/備份/雲端/Webhook/稽核）手機上進不去**。修法照抄 POSPage `ps.catWrap`（`:375-380`）的 overflowX 模式 | `src/pages/SettingsPage.jsx:1249` | Playwright 實測 scrollLeft 設 9999 仍為 0 | high / small |
| RWD-03 | **14 頁僅 4 頁有行動版佈局**（useIsMobile 只有 App/POS/Purchase/Login 用）：Accounting 硬編 `'1fr 1fr'`（`:109,:282`）損益表壓成兩條窄欄；Reports `repeat(4,1fr)`（`:455-456`）KPI 卡被 monospace 長金額撐爆溢出畫面。修：auto-fit minmax + isMobile 單欄；**KPI 卡另需 minWidth:0 或金額 clamp()**；filter 群組無 wrap 在 `InventoryPage.jsx:328`（非 :821，toolbar 本身已有 flexWrap） | `src/pages/AccountingPage.jsx:109`、`ReportsPage.jsx:455-456` | 截圖複核 | high / large |
| RWD-04 | Tutup Shift 鈕右側 42px 被裁（sh.header 無 flexWrap；7 欄 shift 表無 overflow 包裹把 root 撐到 454 寬）。**DOWNGRADED：頁面實測可橫捲、按鈕露出 95px 可點**，非阻斷但難看且整頁橫向漂移易誤觸 | `src/pages/ShiftPage.jsx:311,180-207` | Playwright 實測 | **medium**（原 high 降級）/ small |
| READ-03 | POS 商品卡 17px 價格與庫存 pill 同列，測試資料 3-4 字元已折行；真實印尼價位經千分位後 8-10 字元（Rp 15.000）**必定全面折行**。修：價格獨佔一行 + pill 移右上 + nowrap + clamp 字級 | `src/pages/POSPage.jsx:414-423,212` | 截圖複核 5 張卡已折行 | medium / small |
| I18N-01 | 畫面渲染出原始字串 **「{{count}} pesanan」**（t() 置換不到 `{{count}}`，還撐爆 KPI 格線）與 **raw key「acct.tab_balance」**；驗證時再抓到同病 **`acct.tab_expense`** 也未定義。修：ReportsPage `:191` 傳參對齊 + 補三語 key（id 建議 'Neraca'/'Beban'）+ 守門測試（translation 不得含 `{{`、字面 t() key 必須存在） | `src/i18n/keys/reports.js:137,307,477`、`AccountingPage.jsx:19-20` | 截圖可見 | medium / small |

### 📲 平板（768–1024，收銀主力裝置）

| ID | 問題 | 位置 | 驗證 | Impact / Effort |
|----|------|------|------|-----------------|
| TABLET-01 | **斷點兩頭落空**：useIsMobile 含 768 → 768 直立拿到手機版（無常駐購物車、下半留白）；800-1024 桌面版 Sidebar 232 + cartWrap 340 後商品格只剩 1-2 欄（1024 實測恰 2 欄，數學驗證吻合）。優先序：cartWrap clamp（一行）→ 斷點改 <768 或 640 → 圖示欄側欄（工程量大後做） | `src/pages/POSPage.jsx:428`、`useIsMobile.js:6-8`、`Sidebar.jsx:136` | 截圖 + 數學驗證 | medium / medium |
| TOUCH-02 | 庫存頁核取方塊實測 **32×13px**（gridTpl 首欄硬編 32px + 原生 checkbox 無樣式，觸控高度僅 13px）；排序表頭 12px 高；**index.css 的 .btn-icon 38px 保底只在 ≤768 生效，769-1024 平板拿不到**。修：checkbox 20×20 + 首欄 44px + label 包整格；colHead 加 padding | `src/pages/InventoryPage.jsx:292,347-353,827` | 實測量測吻合 | medium / small |

### 🖐 全裝置共通（觸控/鍵盤/對比）

| ID | 問題 | 位置 | 驗證 | Impact / Effort |
|----|------|------|------|-----------------|
| TOUCH-01 | 購物車 +/- 鈕僅 **28×28px、gap 6** 相鄰（Android 標準 48dp）、Hapus 刪除鈕 10px 純文字、改價 11px 底線——**結帳熱路徑且直接改交易數量**；inline style 吃不到 index.css 的 mobile 保底 | `src/components/CartPanel.jsx:505-512,415-419,424` | 逐行核實 | medium / small |
| READ-01 | `--text-tertiary #9a958a` 亮色主題對比僅 **2.60-2.98:1**（AA 需 4.5），卻用於購物車單價、分類籤等 10-12px 關鍵小字；`--amber` 文字 2.26:1；商品卡漸層價格最亮段 2.27:1。現成合格替代：`--text-secondary #5e5b54` = 6.77:1 | `src/index.css:21,44,96` | 獨立重算 WCAG，與原報告一致到小數第二位 | medium / small |
| READ-02 | **全專案 0 個 inputMode**：統編（onChange 已濾非數字）、會員電話搜尋、拆帳、收款金額等在手機跳全鍵盤；33 處 type="number" iOS 不出九宮格。加屬性即可，**全部 findings 中 CP 值最高之一** | `src/components/CartPanel.jsx:296,322,251,256,268` | grep 0 筆 | medium / small |

---

## 6. 易讀性與一致性問題

### 6.1 功能性錯誤（不只是文案）

| ID | 問題 | 位置 | Impact / Effort |
|----|------|------|-----------------|
| UX-01 | **現金快捷鍵是台幣面額 [100, 500, 1000]**——Rp 100/500/1.000 是硬幣量級，對 Rupiah 收銀完全無用。改依應收動態進位 `[total, ceilTo(total,5000), ceilTo(total,10000), 20000, 50000, 100000]`，一行等級 | `src/components/CartPanel.jsx:106` | high / small |
| UX-06 / DEAD-11 | **NPWP 輸入 `slice(0,8)` 是台灣統編規格照搬**——印尼 NPWP 15 碼（新制 16 碼），合法稅號根本輸不完。放寬到 16 + 修三語 placeholder（`pos.js:62,176,290`）；會員 tier 門檻 30000/10000 也是台幣量級，且**硬編碼兩處**（`useStore.js:266` 與 `:284-285`）須同步改 | `src/components/CartPanel.jsx:295-296` | medium / small |
| UX-02 | 結帳完成畫面**「找零」只有 13px 小字、總額反而 32px**——現金交易收款後唯一動作是數找零，層級倒置每單發生。對調層級：找零 36-40px 粗體 + var(--green) | `src/components/CartPanel.jsx:114-121` | high / small |
| UX-13 | **Electron 結帳寫入 SQLite 失敗，UI 照樣顯示成功勾勾**：dbCheckout fire-and-forget、logDbErr 只寫 console、checkout 無條件 return order——訂單/庫存/會員三類寫入靜默丟失（僅限 Electron 路徑，web 端同步寫入不受影響）。修：persistError 旗標 + 全域 banner + 重試 | `src/store/useStore.js:75,277,289,295` | medium / medium |
| UX-03 / DEAD-04 | **首開整頁台灣中文種子**：34 中文商品（「花生糖」「斤」、台幣定價）、17 項中文分類、09xx 會員、「台電+台水」記帳、「滿500折50」NT$ 促銷、**中文預設帳號「老闆/員工」**（印尼老闆首次啟動必須輸入中文帳號名才能登入）。換印尼 warung 種子（Indomie Goreng Rp 3.500、Sembako/Minuman/Snack/Rokok、0812 號碼）；**改 SEED_USERS 須 bump `LoginScreen.jsx:16` CURRENT_VER 並同步 `:266` 提示列**；SEED_ORDERS/SEED_MANUAL 一併換 | `src/store/useStore.js:19-70`、`categories.js:3-42`、`LoginScreen.jsx:9-16` | high / medium |

### 6.2 術語不一致與誤譯

| ID | 問題 | 位置 | Impact |
|----|------|------|--------|
| UX-04 | 「會員」POS/會員頁叫 **Member**、Dashboard/Reports 叫 **Anggota**——統一 'Member'，改 reports.js id 區 4 key | `src/i18n/keys/reports.js:474,419-421` vs `nav.js:53`、`members.js:259` | medium |
| UX-05 | 「今日營收」側欄 **Penjualan Hari Ini** vs Dashboard **Pendapatan Hari Ini**（同一個 todayRevenue，同屏可見）；nav **Pembukuan** vs 頁標題 **Akuntansi** | `nav.js:58` vs `reports.js:444`；`nav.js:55` vs `reports.js:395` | medium |
| UX-09 | 側欄角色**硬編碼中文「老闆／員工」**（員工登入後常駐看不懂的身分標籤）；Settings 已有 key：role_owner='Pemilik'、role_staff='**Karyawan**'（`settings.js:494-495`），Sidebar `:122` 改 t() 即可 | `src/utils/security.js:12,29`、`Sidebar.jsx:122` | medium |
| UX-10 | 誤譯：滯銷商品叫 **「Penjual Lambat」（賣得慢的人）**，應為 'Produk Kurang Laku'；'Qty Macet'、'Ringkasan Lambat' 同批；退貨全案用 'Retur' 唯獨 reports 用 'Pengembalian Dana' | `src/i18n/keys/reports.js:497,498,502,481,493` | medium |
| UX-11 | 「過期」拼字兩套：reports.js 用非標準 **Kadaluarsa**（**5 個 key**：404/405/406/407/423），其餘全案用 KBBI 標準 Kedaluwarsa。統一 + i18n.test.js 加 `/kadaluarsa/i` 禁用 lint | `src/i18n/keys/reports.js:404-407,423` | low |

### 6.3 資訊層級與可發現性

| ID | 問題 | 位置 | Impact |
|----|------|------|--------|
| UX-07 | 報表頁 8+ 區塊單頁直落，**期間篩選只控制一半區塊**（30 天三卡獨立於 range，程式碼註解 `:92-93` 自承），切「Hari Ini」下方仍是 30 天資料。修：頁內 tab 拆分，或最低成本加分隔標題 | `src/pages/ReportsPage.jsx:9,92-93,187` | medium |
| UX-08 | Settings **9 tab 平鋪**，日常與進階混同層（且無 responsive 處理，見 RWD-02）。常用 4 tab + 'Lanjutan' 收納 | `src/pages/SettingsPage.jsx:16-26` | medium |
| UX-12 | Dashboard「即將過期」KPI：**紅色用在未過期商品** + `3 / 1` 雙數字無標籤（POS 端規則是過期才紅、即期 amber，色彩語意衝突）。主數字只放 soon、改 amber、expired 紅色小徽章 | `src/pages/DashboardPage.jsx:143-145` | low |
| UX-14 | 混合付款入口只有一顆**無字「＋」按鈕**，語意只在 title tooltip（觸控裝置看不到）。加 'Campuran' 標籤（key 已存在：`pos.js:263`） | `src/components/CartPanel.jsx:234-241` | low |

---

## 7. 🗑️ 無用代碼候選清單

> **全部 15 條經 grep 窮舉 + 逐行親驗（15/15 CONFIRMED），但任何刪除均須待使用者確認後才執行。**
> 「接線 vs 刪除」需使用者決策的項目已標註。信心度 = 對「零引用/證據屬實」的把握。

| # | ID | 項目 | 位置 | 信心度 | 建議處置 |
|---|----|------|------|--------|----------|
| 1 | DEAD-02 | **checkRateLimit/resetRateLimit 從未接線，SecurityTab 卻宣稱暴力破解防護「已啟用」**——預設密碼 4 位數字可秒級窮舉，UI 對用戶做不實安全宣稱。同批死匯出：requirePermission `:131`、sanitize `:204`、validatePrice `:226`、validateStock `:232` | `src/utils/security.js:349,373`、`SettingsPage.jsx:716` | 高 | **⚠ 需決策：接線（約 10 行，鎖定邏輯已完整）或刪函數＋修不實文案**。impact high，建議接線 |
| 2 | DEAD-06 | **dataAccess.js 10 個 Electron 包裝函數零引用**（dbAddPromotion `:126` 等，行號逐一核實）——實為**三個現行 Electron bug**：促銷編輯不落地、刪帳號重啟復活、稽核分頁恆空白（security.js:195 isElectron 時 return []） | `src/utils/dataAccess.js:32,114,126-132,144-150,155,169` | 高 | **⚠ 需決策：完成接線（= 修三個 bug，建議）或整鏈刪除** |
| 3 | DEAD-01 | **141 個 i18n key 無引用（×3 語系）**：settings.* 118 + promo.* 11 是「翻譯寫好、UI 沒接」→ 應接線非刪除；common.* 12 個可刪（三語同步刪否則 parity 測試失敗） | `src/i18n/keys/settings.js:117` 等 | 高（獨立掃描完全對帳，含動態 key `settings.role_*` 稽核） | 接線為主；common.* 12 個待確認後刪 |
| 4 | DEAD-05 | PromotionsPage 編輯窗整段硬編碼中文 + NT$（「滿額（NT$）」等）；describeCondition（**非 promoDesc**）產出中文列表描述。對應 promo.* key 已存在（`purchase.js:122-132`），t/fmtMoney 已 import | `src/pages/PromotionsPage.jsx:226-253,261-268` | 高 | 接上既有 key + fmtMoney（impact high / small） |
| 5 | DEAD-14 | SecurityTab 純靜態中文宣傳面板，**至少兩項宣稱不實**（暴力破解防護、XSS 清洗——sanitizeObject 僅 2 處使用，商品/會員/結帳輸入未清洗） | `src/pages/SettingsPage.jsx:712-750` | 高 | **⚠ 需決策：接 settings.sec_* key 並修文案，或整分頁刪**。不實「已啟用」至少先降級文案 |
| 6 | DEAD-03 | validatePhone 為台灣 09xxxxxxxx 驗證，零引用，即使接線對印尼（08xx/+62、10-13 碼）也是錯的 | `src/utils/security.js:238-242` | 高 | 待確認後直接刪 |
| 7 | DEAD-10 | 商品 CSV 匯出/匯入欄名全中文；**`:92` 註解宣稱「中英對照雙收」是假的**（實作只讀中文鍵，英文欄名匯入得全空商品） | `src/utils/csv.js:92-105,109-154`、`InventoryPage.jsx:67-69` | 高 | 改印尼/英欄名 + 匯入新舊雙收過渡 |
| 8 | DEAD-08 | reloadFromDB 零引用（雲端拉取實走 location.reload）；autoJournal 匯出無外部消費者 | `src/store/useStore.js:560,588,590` | 高 | 待確認後刪 reloadFromDB 整段；autoJournal 只移匯出、函數本體保留 |
| 9 | DEAD-09 | 四個零引用匯出：exportMultiSheetXLS、ACCOUNT_GROUPS、toggleTheme、isWebhookEnabled | `exportXLS.js:25`、`accounting.js:35`、`theme.js:14`、`webhook.js:29` | 高 | 待確認後刪函數本體 |
| 10 | DEAD-13 | preload 三個 IPC 通道渲染端零呼叫。**⚠ 不可成鏈刪除**：db.addOrder 被 `electron/server.js:75` 用（顧客點餐）、getLocalIP 被 `main.js:243` 用。安全刪除範圍僅：preload.js:18,19,113 + main.js:113,114,240 三個 handler + database.js getOrderItems 方法 `:913-915`（**保留 stmts.getOrderItems**） | `electron/preload.js:18,19,113` | 高（含下游依賴窮舉） | 按上述精確清單刪，勿擴大 |
| 11 | DEAD-07 | dependency electron-store 全案零引用（不影響 web bundle） | `package.json:22` | 高 | 待確認後自 dependencies 移除，重驗 build + electron:build |
| 12 | DEAD-12 | OrdersPage 引用不存在的 /notification.mp3，新訂單音效永遠無聲（雙層吞錯） | `src/pages/OrdersPage.jsx:38` | 高（find 實測零 mp3） | 補檔案或刪該行 |
| 13 | DEAD-04 | 台灣種子資料全家桶（同 UX-03/FLOW-09，見 §6.1） | `src/store/useStore.js:19-70` 等 | 高 | 整批印尼化或空狀態引導 |
| 14 | DEAD-11 | 統編 8 碼限制（同 UX-06，見 §6.1） | `src/components/CartPanel.jsx:295` | 高 | **⚠ 需決策：移除欄位或放寬 16 碼** |
| 15 | DEAD-15 | 零星台灣格式殘留：02 電話 placeholder（`SettingsPage.jsx:639`）、zh-TW toLocaleString（`:757,:1109-1110` + **security.js:265,277**）、NSIS 無印尼語（package.json）、審計中文 type（`StocktakePage.jsx:102`） | 多處 | 高 | 一批清完（021/08xx、id-ID、NSIS 加 id_ID） |

---

## 8. 總優先級表

### P0 — 影響大、工作量小，立即修

| 項目 | 一句話效益 |
|------|-----------|
| FLOW-12 進貨付款 crash（`PurchasePage.jsx:132` 刪 `status:'paid'` 一行 + STATUS fallback + 資料修復） | 消除「標記付款 → 全站白屏且重整復現」的最嚴重現行 bug |
| PERF-01/LOAD-1 字型自託管（刪 `index.html:16-17` + `index.css:1` 兩處外連） | 弱網/離線首屏從 12+ 秒白屏降到 ~100ms 量級 |
| LOAD-6 止血：saveLS quota 錯誤浮出 UI（三行） | 「默默丟單」變「可感知故障」，比任何速度收益都重要 |
| RWD-01 四個 modal 加 maxHeight:88vh + overflowY（照抄 RefundModal 範本） | 手機上恢復「新增/編輯商品」等核心操作（目前儲存鈕按不到） |
| RWD-02 Settings tabBar 加 overflowX:auto | 手機上 6 個進不去的設定分頁恢復可達 |
| FLOW-02 散客退貨入口（RefundModal 掛到銷售紀錄） | 非會員訂單從「無法退貨」變可退，store 層邏輯全現成 |
| FLOW-03 盤點盤虧自動記損耗 | 消除重複輸入與二次扣庫存的帳實不符風險 |
| UX-01 現金快捷鍵改 Rupiah 動態面額（一行） | 每單必經的收款快捷鍵從完全無用變可用 |
| UX-02 找零/總額字級對調 | 現金收銀最關鍵資訊（找零）從 13px 小字變主角 |
| PERF-05 步驟1 + PERF-06：衍生值 useMemo + RFM 單趟改寫（<30 行 + 已驗證等價） | 加購物車 81-133ms 大幅收斂、RFM 18x 加速 |
| LOAD-2/PERF-07 supabase 動態 import | 啟動關鍵路徑 -210KB（gzip -54KB），未設雲端用戶不再陪付 |
| READ-02 補 inputMode="numeric"（grep 全改 30 分鐘） | 手機數字欄位跳九宮格，CP 值最高的觸控改善 |
| I18N-01 修 {{count}} 置換 + 補 acct.tab_balance/tab_expense 三語 key + 守門測試 | 消除畫面上的原始字串/raw key，並防同類回歸 |
| DEAD-02 接線 checkRateLimit 或修「已啟用」不實文案 | 4 位數預設密碼不再可秒級窮舉；安全宣稱回歸誠實 |
| FLOW-06 取回掛單改交換式 | 正在結的單不再被靜默清空 |

### P1 — 影響大、需要中等工程

| 項目 | 一句話效益 |
|------|-----------|
| PERF-02/04 POS+Dashboard keep-alive + ProductCard memo（一起做，注意全域 keydown gate） | warm 切頁 639-1361ms → 近零，切頁停頓主體消失 |
| PERF-03 步驟3 autoJournal 增量化（small，可先行） | 先砍 ~1/3 結帳阻塞（~128ms@4x） |
| LOAD-3 次要頁 React.lazy（jsbarcode/qrcode 隨頁拆出） | 主 chunk -288KB（-49%），低階機首載明顯變快 |
| LOAD-5 SW precache 完整化 + navigation timeout（**與 LOAD-3 綁定做**） | 離線開啟從機率性變確定、弱網省 RTT |
| FLOW-01 促銷引擎接進結帳 | 收銀員不再心算折讓，已寫好的四型促銷引擎終於生效 |
| FLOW-04 進貨回寫成本（移動平均）+ 自動分錄 | 毛利/會計數字從失真變可信 |
| FLOW-05 endShift/logout/checkout 自動 push | 營業資料當天上雲，斷電不再丟一整天 |
| UX-03/DEAD-04/FLOW-09 種子資料印尼化 + 空狀態引導 + 批次刪除 | 印尼老闆首開不再面對中文帳號與台灣商品 |
| DEAD-06 接線 Electron SQLite 包裝 | 修掉促銷不落地、刪帳號復活、稽核頁恆空三個現行 bug |
| UX-13 Electron 結帳失敗浮出 banner | SQLite 寫入失敗不再假裝成功 |
| RWD-03 Accounting/Reports 先行 RWD 化（auto-fit + minWidth:0） | 手機上損益表/KPI 從壓爛變可讀 |
| TABLET-01 cartWrap clamp + 斷點調整 | 收銀主力平板不再兩頭落空 |
| TOUCH-01/02 熱路徑觸控目標放大 | 結帳數量鈕/庫存 checkbox 誤觸率下降 |
| READ-01 tertiary/amber 對比修正 + 卡片價格改實色 | 關鍵小字對比 2.6:1 → 4.5:1+ |
| READ-03 商品卡價格獨佔一行 | 真實印尼價位不再全面折行 |
| LOAD-4 i18n 單語載入 | -70KB minified、parse/記憶體同步下降 |
| DEAD-05 + DEAD-01 促銷編輯窗/SecurityTab 接 i18n key | 已翻譯好的 129 個 key 上線，中文殘留大戶清空 |
| UX-06/DEAD-11 NPWP 16 碼 + tier 門檻 Rp 化（兩處同步） | 合法稅號可輸入、會員等級門檻合理 |

### P2 — 打磨與清理

| 項目 | 一句話效益 |
|------|-----------|
| PERF-03 步驟4 / LOAD-6 根治：訂單存儲遷 IndexedDB/分月 key（注意 security.js:259、cloudSync.js:33,163,189 耦合） | 結帳阻塞與 quota 天花板徹底解除 |
| PERF-08 ClockBadge 抽離 | 移除每秒背景稅 |
| FLOW-08 整付一鍵收款 + done 自動離開 | 每單省 2 次點擊 |
| FLOW-10 開班 modal 原地化 | 開班 5 互動 2 跳頁 → 3 互動 0 跳頁 |
| FLOW-11 促銷刪除加 confirm | 補上全 App 唯一裸刪除 |
| UX-04/05 Member/Anggota、Penjualan/Pendapatan、Pembukuan/Akuntansi 術語統一 | 同一概念一個名字 |
| UX-09 側欄角色改 t()（用既有 Pemilik/Karyawan） | 員工看得懂自己的身分標籤 |
| UX-10/11 Penjual Lambat 誤譯修正 + Kedaluwarsa 拼字統一（5 key）+ lint | 報表文案專業化並防回歸 |
| UX-07 報表頁 tab 拆分或 30 天區塊分隔標題 | 期間篩選不再誤導 |
| UX-08 Settings 常用 4 tab + Lanjutan 收納 | 設定頁資訊層級清晰 |
| UX-12 過期 KPI 配色/標籤修正、UX-14 混合付款加文字標籤 | 色彩語意一致、功能可被發現 |
| RWD-04 sh.header flexWrap + shift 表 overflow 包裹 | 關班鈕完整可見、消除整頁橫向漂移 |
| DEAD-03/07/08/09/12/13/15 死碼清理（**均待使用者確認**；DEAD-13 按精確清單勿成鏈刪） | 移除台灣殘留與零引用代碼，降低維護噪音 |
| DEAD-10 CSV 欄名印尼化 + 雙收過渡 | 印尼用戶能讀懂匯入範本 |

---

*報告生成：2026-07-07。驗證方法詳見各節標註（Playwright + vite preview production build、CPU 4x throttle、WCAG 對比獨立重算、grep 引用窮舉、Node micro-bench）。*
