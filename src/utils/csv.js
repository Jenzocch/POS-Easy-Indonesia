// 簡單 CSV 解析 / 序列化（無外部依賴）
// 支援雙引號包欄位、欄位內有逗號和換行、跳脫雙引號 ""

// 解析 CSV 文字 → array of objects（依首行 header）
export function parseCSV(text) {
  const rows = parseRows(text)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map(h => h.trim())
  const records = rows.slice(1)
    .filter(r => r.length > 0 && r.some(c => c && c.trim()))
    .map(row => {
      const o = {}
      headers.forEach((h, i) => { o[h] = row[i] ?? '' })
      return o
    })
  return { headers, records }
}

// 行 → cell array（每行）
function parseRows(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  let i = 0
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  while (i < t.length) {
    const ch = t[i]
    if (inQuotes) {
      if (ch === '"') {
        if (t[i+1] === '"') { cur += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      cur += ch; i++; continue
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ',') { row.push(cur); cur = ''; i++; continue }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue }
      cur += ch; i++
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// 物件陣列 → CSV 字串
export function stringifyCSV(records, headers = null) {
  const hs = headers || (records[0] ? Object.keys(records[0]) : [])
  const escape = (val) => {
    if (val == null) return ''
    const s = String(val)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [hs.join(',')]
  for (const r of records) {
    lines.push(hs.map(h => escape(r[h])).join(','))
  }
  return lines.join('\n')
}

// 觸發瀏覽器下載 — 全案唯一的 Blob 下載儀式，其他地方一律呼叫這裡，不要手刻。
// content 可為 string 或現成 Blob；100ms 後才 revokeObjectURL，避免部分瀏覽器在下載開始前 URL 已失效。
export function downloadBlob(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// 觸發瀏覽器下載（CSV with BOM 給 Excel 中文）
export function downloadCSV(filename, content) {
  const BOM = '﻿'
  downloadBlob(filename, BOM + content, 'text/csv;charset=utf-8;')
}

// 從 File 物件讀文字
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'utf-8')
  })
}

// 商品 CSV 標準欄位 —— 匯出固定用中文欄名（沿用既有匯出/範本格式，避免破壞現有使用者的檔案格式）。
// DEAD-10：原註解宣稱「中英對照，匯入時兩種都接受」是假的——實作只讀中文鍵，其他語言欄名匯入會得到全空
// 商品。現在匯入端改為真的雙欄名支援：中文（原格式）與印尼文（ID_HEADER_ALIASES）兩者皆可匯入辨識。
export const PRODUCT_CSV_HEADERS = [
  '商品名稱',     // name
  '分類',         // category
  '售價',         // price
  '成本',         // cost
  '庫存',         // stock
  '安全庫存',     // reorderLevel
  '條碼',         // barcode
  '單位',         // unit
  '主要供應商',   // supplierName
  '保存期限',     // expiryDate (YYYY-MM-DD)
  '圖片網址',     // imageUrl
  'ID',           // id（更新時用，新增可空）
]

// 中文欄名 → 印尼文欄名對照，僅供「匯入辨識」使用；匯出仍固定用上面的中文欄名。
const ID_HEADER_ALIASES = {
  '商品名稱': 'Nama Produk',
  '分類': 'Kategori',
  '售價': 'Harga Jual',
  '成本': 'Harga Modal',
  '庫存': 'Stok',
  '安全庫存': 'Stok Aman',
  '條碼': 'Barcode',
  '單位': 'Satuan',
  '主要供應商': 'Pemasok Utama',
  '保存期限': 'Tgl Kedaluwarsa',
  '圖片網址': 'URL Gambar',
  'ID': 'ID',
}

// 讀取欄位值：優先中文欄名，找不到/空值時退回對應的印尼文欄名（雙欄名匯入相容）
function readField(row, zhKey) {
  const v = row[zhKey]
  if (v !== undefined && v !== '') return v
  const idKey = ID_HEADER_ALIASES[zhKey]
  return idKey ? (row[idKey] ?? '') : ''
}

// 商品 → CSV row
export function productToCSVRow(p, supplierMap) {
  return {
    '商品名稱': p.name || '',
    '分類': p.category || '',
    '售價': p.price ?? '',
    '成本': p.cost ?? '',
    '庫存': p.stock ?? '',
    '安全庫存': p.reorderLevel ?? '',
    '條碼': p.barcode || '',
    '單位': p.unit || '',
    '主要供應商': supplierMap?.get(p.supplierId)?.name || '',
    '保存期限': p.expiryDate || '',
    '圖片網址': p.imageUrl || '',
    'ID': p.id || '',
  }
}

// 數值解析：去千分位逗號 + 貨幣符號/空白（Excel 匯出常見），避免 "NT$1,200" → NaN → 0 或 "1,200" 被截成 1
const cleanNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, ''))
  return isNaN(n) ? 0 : n
}
// 整數欄位用四捨五入而非 parseInt 截斷（"12.9" → 13，不是 12）
const cleanInt = (v) => Math.round(cleanNum(v))

// CSV row → 商品物件（給 add/update 用）—— 中文/印尼文欄名皆可辨識
export function csvRowToProduct(row, supplierByName) {
  const supplierName = String(readField(row, '主要供應商') || '').trim()
  const supplierId = supplierName ? (supplierByName.get(supplierName)?.id || '') : ''
  return {
    id: String(readField(row, 'ID') || '').trim() || undefined,
    name: String(readField(row, '商品名稱') || '').trim(),
    category: String(readField(row, '分類') || '').trim(),
    price: cleanNum(readField(row, '售價')),
    cost: cleanNum(readField(row, '成本')),
    stock: cleanInt(readField(row, '庫存')),
    reorderLevel: cleanInt(readField(row, '安全庫存')),
    barcode: String(readField(row, '條碼') || '').trim(),
    unit: String(readField(row, '單位') || '個').trim(),
    supplierId,
    supplierName,
    expiryDate: String(readField(row, '保存期限') || '').trim(),
    imageUrl: String(readField(row, '圖片網址') || '').trim(),
    noBarcode: !String(readField(row, '條碼') || '').trim(),
  }
}
