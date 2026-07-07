# POS Easy Indonesia — 商業化與市場進入作戰書

> **本文件目的**：讓任何未來的 Claude / agent session 直接讀到完整商業脈絡，不需使用者重新解釋。
> **內容**：Part 1 訂閱制商業設計（含程式碼實作規格）｜Part 2 入門期印尼線上線下銷售計畫｜Part 3 可分派 agent 任務清單
> **狀態**：規劃完成、尚未實作。授權系統實作對應任務 A1。
> **重要前提**：本專案為獨立專案，與 denikin-recruitment 或任何其他專案**無關**。
> 最後更新：2026-07-07

---

# Part 1｜訂閱制商業設計

## 1.1 核心原則：為什麼不賣斷

賣斷賣的是**程式碼**，訂閱賣的是**持續運作的服務**。把最值錢的功能綁在「伺服器上跑的東西」，客戶買斷 App 也帶不走價值。

**一條鐵律**：免費版必須「單機完整能做生意」（收銀＋基本庫存）。付費鎖的是**安心（備份）、成長（報表／會員）、擴張（QR 點餐／多員工）**。永遠不鎖「今天收銀」——欠費處理一律**降級回免費層**，不是鎖死 App。資料永遠保留。

## 1.2 服務型利基點（全部對應現有代碼）

| 功能（已存在） | 為什麼是訂閱利基點 |
|---|---|
| 雲端備份／同步（`src/utils/supabaseClient.js`） | 老闆最怕手機摔壞資料全沒（銷售、庫存、客人欠帳）。安心感是最強續訂理由；斷訂不毀生意（本地照常用），道德上站得住、客訴少 |
| QR 掃碼點餐（`public/menu/` + 即時訂單） | 必須有伺服器在線上跑 → 天然月費、物理上不可破解 |
| 進階報表（ABC 分析、滯銷品、員工排行、損益；`src/utils/analytics.js`） | 開發成本已沉沒、感知價值高，且用的是客戶自己的數據 = 最好的推銷員 |
| 會員／積分／Kasbon 賒帳（`MembersPage`） | 印尼 warung 賒帳文化是剛需，數位化 kasbon 是殺手級功能 |
| 多員工權限（Settings 內建 perm 系統）、交班、會計 | 生意做大才需要 → 按成長階段收費的自然階梯 |
| WhatsApp 整合（webhook 雛形） | WA 電子收據、一鍵催收欠帳 → 走伺服器發送 = 硬鎖點 |

## 1.3 三層方案（印尼定價）

| | Gratis | Paket Warung ~Rp 49.000/月 | Paket Rumah Makan ~Rp 129.000/月 |
|---|---|---|---|
| 收銀＋基本庫存＋本地備份 | ✅ | ✅ | ✅ |
| 收據頁尾 "Powered by POS Easy" | 強制顯示 | 可移除 | 可移除 |
| 雲端備份／同步 | — | ✅ | ✅ |
| 完整報表（ABC／滯銷／損益） | 模糊預覽 | ✅ | ✅ |
| 促銷、盤點、報廢 | — | ✅ | ✅ |
| QR 掃碼點餐 | — | — | ✅ |
| 會員／積分／Kasbon | — | — | ✅ |
| 多員工權限＋交班＋會計 | — | — | ✅ |

- 加購：額外裝置 ~Rp 20.000/台/月
- 年繳 = 10 個月價
- 14 天全功能試用 → 到期自動降級（資料全保留，只是功能收合）
- 定價話術：*「Lebih murah dari segelas kopi per hari」*（一天不到一杯咖啡）

## 1.4 授權系統技術規格（掌控權設計）

擁有者透過 Supabase 後台改一列資料即可對**任一客戶開／關任一功能**，不改 code、不發版。

### licenses 表（真相來源）

```sql
create table licenses (
  store_id uuid primary key,
  plan text not null default 'free',        -- 'free' | 'warung' | 'resto'
  expires_at timestamptz,
  feature_overrides jsonb default '{}',      -- 擁有者的總開關（最高優先）
  device_limit int default 1
);
```

`feature_overrides` 範例：示範店免費開 QR 點餐 → `{"qr_menu": true}`；單獨關某人報表 → `{"reports.full": false}`。

### 前端模組（沿用現有 perm 權限模式）

```
src/license/
  plans.js         ← 功能×方案矩陣（唯一真相表）
  entitlements.js  ← hasFeature(key)、載入/快取、離線寬限 7 天
  FeatureGate.jsx  ← <FeatureGate feature="reports.abc" teaser>
  UpgradeModal.jsx ← 升級彈窗（WhatsApp 聯繫 CTA）
```

```js
// plans.js — 調整方案內容只改這張表
const FREE   = ['pos', 'inventory.basic', 'backup.local']
const WARUNG = [...FREE, 'backup.cloud', 'reports.full', 'promotions', 'stocktake', 'waste', 'receipt.clean']
const RESTO  = [...WARUNG, 'qr_menu', 'members', 'kasbon', 'staff.multi', 'shifts', 'accounting']
export const PLAN_FEATURES = { free: FREE, warung: WARUNG, resto: RESTO }
```

**運作流程**：登入時拉 license → 存 localStorage（含抓取時間戳）→ `hasFeature()` 判定順序：feature_overrides → 方案矩陣 → false。

**離線寬限 7 天**：印尼網路不穩，斷網數日不降級；超過寬限才收合付費功能。必要的善意，也防客訴。

**Sidebar 整合**（現有 perm 過濾旁加一個條件）：
```js
NAV.filter(item => can(item.perm) && hasFeature(item.feature))
```

### 硬鎖／軟鎖分工

- **硬鎖（伺服器端，不可破解）**：雲端同步、QR 點餐、WA 發送。真正值錢的放這邊。
- **軟鎖（前端 FeatureGate，UI 層）**：報表、會員頁等本地功能。客群是 warung 老闆不是工程師——不為防 0.1% 破解者犧牲 99.9% 用戶體驗。

## 1.5 App 內建 upsell 機制（用自己的功能做行銷）

1. **模糊預覽（最重要）**：免費版照樣在本地計算 ABC 分析／滯銷品，但表格加 `blur(6px)` 遮罩，只露結論：「📊 你有 3 個滯銷品積壓了 Rp 450.000 — 升級查看是哪幾個」。用客戶自己的錢說服他。
2. **收據頁尾一魚兩吃**：免費版收據印 "Dibuat dengan POS Easy — gratis"。客人看到 = 病毒傳播；老闆想移除 = 升級理由。
3. **關鍵時刻觸發**：備份頁「上次備份已 X 天前，手機遺失＝資料全失」；月底 Dashboard「想知道哪 20% 商品貢獻 80% 營收？」；Kasbon 累積「客人共欠 Rp X — 用 WA 一鍵催收」。
4. **試用倒數**：最後 3 天每日提醒將收合的功能清單（損失趨避）。
5. **推薦返利**：推薦碼雙方各得 1 個月免費。

## 1.6 落地順序

- **Phase A（最優先，1–2 天）**：`licenses` 表 + `src/license/` 模組 + Sidebar／Reports 接 FeatureGate → 擁有者從此有總開關。**手動開通即第一版金流**（WA 談好 → 轉帳 → 後台改 plan），零金流開發成本。
- **Phase B**：報表模糊預覽 + UpgradeModal + 收據頁尾。
- **Phase C**：試用流程 + 推薦碼。

---

# Part 2｜入門期銷售作戰書（印尼・線上×線下）

## 2.0 起跑前提

1. **擁有者不在印尼、無現成在地網絡** → 核心限制是「在地信任」。印尼是先聊天、先認識人、才買東西的社會。策略：**線上自己來、線下靠養出來的在地節點**。
2. **入門期唯一目標：前 10 家真實使用的店**。10 家店給的是見證素材、產品修正方向、轉介種子。一切手動做。
3. **收款現實**：印尼小老闆無信用卡文化。收款 = QRIS／銀行轉帳／GoPay・OVO・DANA。入門期用「WA 談好 → 轉帳 → Supabase 後台改 plan」手動開通。

## 2.1 三階段路線圖

| 階段 | 期間 | 目標 | 成功判準 |
|---|---|---|---|
| Stage 0 驗證 | 第 1–4 週 | 10 家免費白老鼠店 | ≥7 家一週後還每天開 App |
| Stage 1 首批付費 | 第 2–3 個月 | 30–50 家安裝、5–10 家付費 | 有人主動問怎麼付費 |
| Stage 2 可複製通路 | 第 4–6 個月 | 找出 1 條可重複獲客路徑 | 通路獲客成本 < 客戶 3 個月訂閱費 |

退出條件：Stage 0 若 10 家中 7 家一週內不再打開 → 停下修產品，不往前衝。

## 2.2 冷啟動三路徑（無在地網絡版）

1. **線上徵白老鼠（第 1 週就能做）**：FB 的 UMKM／warung 社團發「徵免費試用夥伴」文——「免費收銀 App 找 10 位老闆免費用、一對一教學，換使用回饋」。完全不需人在印尼。
2. **從用戶養出在地代理（Stage 0→1 關鍵）**：白老鼠中最熱情、會主動拉朋友的 1–2 位老闆 = 線下部隊。給代理分潤（推薦成交抽首年 20–30%），由他跑 grosir、掃街、教學。
3. **聘在地兼職（想加速用這條）**：Projects.co.id／Fastwork／Sribulancer 聘兼職做地推＋WA 客服，月成本約 IDR 1–3 juta。任務明確化：每週拜訪 X 家、裝機教學、回 WA。

（補充：若擁有者人在台灣，台灣的印尼社群聚點是可選的加分項，非主軸。）

## 2.3 線上通路（零成本→低成本排序）

1. **WhatsApp（最優先）**：WA Business = 店面＋客服＋成交櫃台。廣告只負責讓人加 WA，**成交發生在對話裡**；5 分鐘內回覆是轉換第一因子。broadcast list 每週一則「老闆小教室」維繫免費用戶。
2. **Facebook 社團**：加入 `UMKM Indonesia`、`Komunitas Pedagang`、`Usaha Warung`、`Bisnis Kuliner` 類社團。每週 2–3 篇**教學型貼文**（不是廣告），文末一句「我做了免費 App 解決這個，需要的私訊」。
3. **TikTok（印尼是最大市場之一）**：三種內容——痛點小劇場（客人賒帳老闆忘記→App 一鍵查）、30 秒功能實拍（掃碼→出單→看營收）、老闆見證。每週 3–5 支，量大於精。Instagram Reels 同步搬運。
4. **Landing Page + 搜尋**：純印尼文一頁式，痛點→方案→**WA 按鈕**（不是註冊表單，印尼人不填表單）。目標關鍵字：`aplikasi kasir gratis`、`aplikasi kasir warung`、`aplikasi catat hutang pelanggan`（競爭低、意圖強）。Google Business Profile 免費開。
5. **付費廣告：入門期不做**。先用免費通路測出會轉換的訊息，有數據再小額 boost。

## 2.4 線下通路

1. **密度地推**：選一個城市的一個區（kecamatan）打透，跟著在地節點走。同一條街 3 家在用，第 4 家自己來問——集中 10 家勝過分散 30 家。
2. **批發商（Grosir）合作**：warung 老闆每週必到之地。店內放立牌、推薦成交抽首年 20–30%。先讓 grosir 老闆自己變用戶（他也要記賒帳），再變代理。
3. **手機行／收銀設備行**：幫客人裝 App 送教學，成交抽成。

## 2.5 訊息策略：賣結果不賣功能

| ❌ 不要說 | ✅ 要說 |
|---|---|
| POS 收銀系統 | 不再忘記誰欠你錢（Kasbon 數位化） |
| 庫存管理 | 知道今天賺多少，睡得著覺 |
| 雲端備份 | 手機摔壞，帳還在 |
| 免費試用 14 天 | 免費用，不用卡、不用錢，好用再說 |

## 2.6 每週節奏與指標

- **北極星：每週 10 場真實對話**（WA 或面對面），勝過一切流量數據
- 追蹤四數字：新安裝／7 日留存／WA 進線數／免費→付費轉換
- 每週日 30 分鐘覆盤：哪句話、哪個通路帶來最多 WA 對話 → 下週加倍

## 2.7 新手五大死法

1. 一開始就想吃全印尼 → 一個區打透再複製
2. 太早燒廣告費 → 免費通路先測出會轉換的訊息
3. 只做線上不見人 → 印尼是信任社會，線下節點必須有
4. 免費用戶放養 → 每家免費店都是見證素材＋轉介種子，每週碰一次
5. 收款設卡 → 只收轉帳/QRIS，手動開通，先成交再優雅

---

# Part 3｜可分派 Agent 任務清單

| # | 任務 | 產出物 | 依賴 |
|---|---|---|---|
| A1 | 實作授權系統（§1.4 完整規格：licenses 表 + src/license/ + FeatureGate + Sidebar 整合） | 擁有者總開關＝手動金流基礎 | 無，最優先 |
| A2 | 印尼文一頁式 Landing Page（痛點→方案→WA 按鈕），部署 Vercel | 線上入口 | 無 |
| A3 | 3 支 TikTok 腳本（痛點劇/功能實拍/見證）＋分鏡 | 內容彈藥 | 無 |
| A4 | FB 社團教學貼文 ×6（印尼文：Kasbon/營收/庫存各 2 篇） | 一個月社團內容 | 無 |
| A5 | 地推物料：A5 傳單 + grosir 立牌文案（印尼文，含 QR→WA） | 線下彈藥 | 無 |
| A6 | WA Business 快速回覆模板包（詢價/教學/催升級/收款指引，印尼文） | 成交 SOP | 無 |
| A7 | 報表模糊預覽 + UpgradeModal + 收據頁尾（§1.5 的 1、2 項） | App 內建行銷 | A1 |

**給執行 agent 的注意事項**：
- 所有 UI 文案走 i18n 三語系統（`src/i18n/`，fragment 架構），金額一律 `fmtMoney()`（Rp 格式）
- 不可更動儲存值／比較值（付款方式 key、權限字串、localStorage key、分類值 `'全部'`）
- 改動後必跑 `npx vitest run`（含三語 parity test）再交付
- 本 repo 部署：Vercel 自動部署 `main` 分支
