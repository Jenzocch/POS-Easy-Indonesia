// 庫存狀態判定 — 全案唯一的低庫存/缺貨語意，不要在頁面再手刻 stock <= 5
//
// 三個 helper 的關係：needsRestock = isOutOfStock ∪ isLowStock（互斥、無縫拼滿）
// - 「需補貨」計數（Sidebar 徽章、庫存頁 header）用 needsRestock：缺貨當然也要補
// - 「低庫存」與「缺貨」分開顯示時（篩選 tab、商品卡徽章）用 isLowStock / isOutOfStock

export const LOW_STOCK_THRESHOLD = 5

// 缺貨：無庫存（含負庫存與缺 stock 欄位的異常資料）
export const isOutOfStock = (p) => (p.stock ?? 0) <= 0

// 低庫存：還有貨但低於門檻（不含缺貨）
export const isLowStock = (p) => (p.stock ?? 0) > 0 && p.stock <= LOW_STOCK_THRESHOLD

// 需補貨：低庫存或缺貨
export const needsRestock = (p) => (p.stock ?? 0) <= LOW_STOCK_THRESHOLD
