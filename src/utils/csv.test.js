import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseCSV, stringifyCSV, csvRowToProduct, downloadCSV, downloadBlob } from './csv'

describe('parseCSV', () => {
  it('解析基本 CSV', () => {
    const { headers, records } = parseCSV('name,price\n蘋果,30\n香蕉,20')
    expect(headers).toEqual(['name', 'price'])
    expect(records).toEqual([
      { name: '蘋果', price: '30' },
      { name: '香蕉', price: '20' },
    ])
  })

  it('處理引號包住的逗號', () => {
    const { records } = parseCSV('name,note\n"糖果, 綜合",好吃')
    expect(records[0].name).toBe('糖果, 綜合')
    expect(records[0].note).toBe('好吃')
  })

  it('處理跳脫雙引號 ""', () => {
    const { records } = parseCSV('name\n"他說""你好"""')
    expect(records[0].name).toBe('他說"你好"')
  })

  it('處理引號內換行', () => {
    const { records } = parseCSV('name,desc\n"商品","第一行\n第二行"')
    expect(records[0].desc).toBe('第一行\n第二行')
  })

  it('略過空白行', () => {
    const { records } = parseCSV('name\n蘋果\n\n香蕉\n')
    expect(records.length).toBe(2)
  })

  it('空字串回傳空結果', () => {
    expect(parseCSV('').records).toEqual([])
  })
})

describe('stringifyCSV', () => {
  it('序列化物件陣列', () => {
    const csv = stringifyCSV([{ a: '1', b: '2' }], ['a', 'b'])
    expect(csv).toBe('a,b\n1,2')
  })

  it('含逗號/引號/換行的值自動加引號跳脫', () => {
    const csv = stringifyCSV([{ a: '有,逗號', b: '有"引號' }], ['a', 'b'])
    expect(csv).toBe('a,b\n"有,逗號","有""引號"')
  })

  it('round-trip：序列化後再解析應一致', () => {
    const original = [
      { name: '糖果, 綜合', price: '30', note: '含"特殊"字元' },
    ]
    const csv = stringifyCSV(original, ['name', 'price', 'note'])
    const { records } = parseCSV(csv)
    expect(records[0]).toEqual(original[0])
  })
})

// node 環境無 DOM：以 stub 攔截 createObjectURL / createElement，只驗證內容組裝
// （BOM 前綴、mime、revoke 時機），不真的觸發下載
describe('downloadBlob / downloadCSV', () => {
  let anchor, captured, urlStub

  beforeEach(() => {
    vi.useFakeTimers()
    captured = {}
    anchor = { href: '', download: '', click: vi.fn() }
    urlStub = {
      createObjectURL: vi.fn((blob) => { captured.blob = blob; return 'blob:mock' }),
      revokeObjectURL: vi.fn(),
    }
    vi.stubGlobal('URL', urlStub)
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
  })

  afterEach(() => {
    vi.runAllTimers()        // 先讓 100ms revoke timer 在 stub 還在時跑完
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('downloadCSV 內容前綴 UTF-8 BOM、mime 為 text/csv', async () => {
    downloadCSV('報表.csv', 'a,b\n1,2')
    expect(anchor.download).toBe('報表.csv')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(captured.blob.type).toBe('text/csv;charset=utf-8;')
    // blob.text() 會在 UTF-8 解碼時吃掉 BOM，須驗原始 bytes
    const bytes = new Uint8Array(await captured.blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])            // BOM 在最前
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('a,b\n1,2')     // 內容不變
  })

  it('downloadBlob 字串內容以指定 mime 包成 Blob', async () => {
    downloadBlob('backup.json', '{"a":1}', 'application/json')
    expect(captured.blob.type).toBe('application/json')
    expect(await captured.blob.text()).toBe('{"a":1}')  // 無 BOM
  })

  it('downloadBlob 接受現成 Blob，不重新包裝', () => {
    const b = new Blob(['x'], { type: 'application/octet-stream' })
    downloadBlob('x.bin', b)
    expect(captured.blob).toBe(b)
  })

  it('100ms 後才 revokeObjectURL（避免下載開始前 URL 失效）', () => {
    downloadBlob('x.csv', 'abc', 'text/csv')
    expect(urlStub.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(urlStub.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})

describe('csvRowToProduct', () => {
  const supplierByName = new Map([['台北乾貨行', { id: 's001', name: '台北乾貨行' }]])

  it('對應供應商名稱到 id', () => {
    const p = csvRowToProduct({ '商品名稱': '紫菜', '售價': '35', '主要供應商': '台北乾貨行' }, supplierByName)
    expect(p.name).toBe('紫菜')
    expect(p.price).toBe(35)
    expect(p.supplierId).toBe('s001')
  })

  it('找不到供應商時 supplierId 留空但保留 supplierName', () => {
    const p = csvRowToProduct({ '商品名稱': '紫菜', '主要供應商': '不存在的廠商' }, supplierByName)
    expect(p.supplierId).toBe('')
    expect(p.supplierName).toBe('不存在的廠商')
  })

  it('有條碼時 noBarcode 為 false', () => {
    const p = csvRowToProduct({ '商品名稱': 'X', '條碼': '4710000000001' }, supplierByName)
    expect(p.noBarcode).toBe(false)
    expect(p.barcode).toBe('4710000000001')
  })

  it('無條碼時 noBarcode 為 true', () => {
    const p = csvRowToProduct({ '商品名稱': 'X' }, supplierByName)
    expect(p.noBarcode).toBe(true)
  })

  it('數值欄位轉型，非數字歸 0', () => {
    const p = csvRowToProduct({ '商品名稱': 'X', '售價': 'abc', '庫存': '15' }, supplierByName)
    expect(p.price).toBe(0)
    expect(p.stock).toBe(15)
  })

  it('整數欄位四捨五入而非截斷（庫存 12.9 → 13）', () => {
    const p = csvRowToProduct({ '商品名稱': 'X', '庫存': '12.9' }, supplierByName)
    expect(p.stock).toBe(13)
  })

  it('售價去貨幣符號與千分位（NT$1,200 → 1200，不再變 0）', () => {
    const p = csvRowToProduct({ '商品名稱': 'X', '售價': 'NT$1,200' }, supplierByName)
    expect(p.price).toBe(1200)
  })

  // DEAD-10: 匯入端改為中文/印尼文雙欄名皆可辨識（匯出仍固定用中文欄名，見 PRODUCT_CSV_HEADERS）
  it('印尼文欄名 CSV 也能正確匯入（雙欄名相容）', () => {
    const p = csvRowToProduct({
      'Nama Produk': 'Indomie Goreng', 'Harga Jual': '3500', 'Stok': '20', 'Pemasok Utama': '台北乾貨行',
    }, supplierByName)
    expect(p.name).toBe('Indomie Goreng')
    expect(p.price).toBe(3500)
    expect(p.stock).toBe(20)
    expect(p.supplierId).toBe('s001')
  })

  it('中文欄名優先於印尼文欄名（同一 row 兩者都有時）', () => {
    const p = csvRowToProduct({ '商品名稱': '中文優先', 'Nama Produk': '印尼備援' }, supplierByName)
    expect(p.name).toBe('中文優先')
  })
})
