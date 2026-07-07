# POS Pro 印尼版 — 開發路線圖

> 此文檔為開發計劃的快速查閱版本。詳見上傳的兩份完整企劃書。

## 核心目標
- 🎯 印尼市場專用版本（PWA + Electron）
- 🛍️ 目標客群：Warung（雜貨店）& Rumah Makan（家常餐館）
- 💰 商業模式：軟體買斷 Rp 399-499k + 雲端加購 + 硬體代購
- 📍 銷售通路：Shopee + Instagram/TikTok + 在地業務

## 開發 4 個 Phase（約 3-4 週）

### Phase 1️⃣ i18n 三語化（5-7 天）— 最大項目
**目標**：全 UI 支援中文(ZH) / 英文(EN) / 印尼文(ID)
- 建立 `src/i18n/` 簡單字典方案（無 i18next，ponytail 原則）
- 抽出 14 頁 + 所有組件中的硬編字串
- 印尼盾格式：`Rp 15.000`（千分位用「.」，無小數）
- 日期格式：DD/MM/YYYY
- 價格輸入助手：「15」自動 × 1000
- 首次選語言 + 設定頁可切換
- 印尼文翻譯上市前找母語者校對（Fiverr ~USD 30-50）

### Phase 2️⃣ 簡單模式（4-5 天）— 小店易用性
**目標**：砍菜單、移除開班門檻、大按鈕 / 大字體、淺色主題
- 預設「Mode Sederhana」：菜單 16→5 項
- 自動開班，打開就能賣
- 商品大圖磚 + 鈔票快捷鈕（Rp 50k / 100k / Uang Pas）
- 報表簡化成 3 張大字卡（營收 / 毛利 / 單數）
- Kasbon（賒帳）改用印尼詞並突出
- 主按鈕 ≥48px、價格加大、淺色背景

### Phase 3️⃣ 付款與硬體（4-5 天）— 銷售的成敗點
- **QRIS**：設定頁上傳→結帳顯示→人工確認到帳（不串 API）
- **WhatsApp 收據**：一鍵 wa.me 發收據給客人
- **藍牙熱感出單機**（58mm，Web Bluetooth + ESC/POS）
  - 收銀收據 + **廚房單**（桌號、品項、備註）— 廚房單是餐館成敗關鍵
  - 只承諾支援實測機型（EPPOS、Panda PRJ-58D 等）
  - iOS 不支援 Web Bluetooth → 明講限 Android（市占 ~90%）

### Phase 4️⃣ 啟用碼 + 部署（3-4 天）— 防轉賣 + 上線
- Supabase `licenses` 表：code / 訂單 / 裝置 ID（限 2）/ 狀態
- 首次開啟驗證啟用碼 → 綁定 localStorage 裝置 ID
- 第 3 台拒絕 + 顯示客服 WA
- 預設帳號改英/印尼文 + 強制首次改密
- 部署 Cloudflare Pages + 短網域
- 低階 Android 實機測試

## 驗收標準
- ✅ 76 個既有測試通過（`npm test`）
- ✅ 三語切換後無殘留中文（grep 驗證）
- ✅ 簡單模式：打開→第一筆交易 ≤ 4 次點擊
- ✅ 啟用碼：第 3 台被拒測試通過
- ✅ PWA 離線完整可用

## 接手第一步
1. 讀本文 + HANDOFF.md + README.md
2. `npm install && npm test` 驗證環境
3. `npm run dev` 看現況界面
4. Phase 1：建 `src/i18n/` 骨架 + `t()` helper，拿 LoginScreen 打樣

## 明確跳過（有人提議也不做）
- ❌ 金流 API（QRIS 靜態圖夠用）
- ❌ 上架 Google Play / App Store（PWA 夠用）
- ❌ GoFood/GrabFood 串接、KDS（等真實客人要求）
- ❌ 多版本分支（一套程式碼 + 開關）
- ❌ iOS 藍牙列印
