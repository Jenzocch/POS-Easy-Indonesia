// Supabase 客戶端 — 設定存 localStorage，讓 user 在 Settings UI 輸入即可（也支援 env）
// LOAD-2/PERF-07：SDK 改為動態 import（見 getSupabase），未設定雲端的用戶
// 不再於啟動關鍵路徑下載/解析 ~210KB 的 supabase chunk。

const STORAGE_KEY = 'pos_supabase_config'

export function getCloudConfig() {
  // 優先讀 localStorage（UI 設定），其次讀 vite env
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.url && parsed.anonKey) return parsed
    }
  } catch {}
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && anonKey) return { url, anonKey }
  return null
}

export function saveCloudConfig({ url, anonKey }) {
  if (!url || !anonKey) {
    localStorage.removeItem(STORAGE_KEY)
    _client = null
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }))
  _client = null // 強制下次重建
}

export function clearCloudConfig() {
  localStorage.removeItem(STORAGE_KEY)
  _client = null
}

let _client = null
// 現在是 async：SDK 只在真的要用雲端時才動態載入（呼叫端一律 await getSupabase()）
export async function getSupabase() {
  if (_client) return _client
  const cfg = getCloudConfig()
  if (!cfg) return null
  try {
    const { createClient } = await import('@supabase/supabase-js')
    if (_client) return _client // 併發呼叫防重複建立
    _client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },
    })
    return _client
  } catch (e) {
    console.error('[Supabase] init failed:', e)
    return null
  }
}

export function isCloudEnabled() {
  return !!getCloudConfig()
}

// 測試連線（呼叫一個輕量 query）
export async function testConnection() {
  const sb = await getSupabase()
  if (!sb) return { ok: false, error: '尚未設定雲端' }
  try {
    const { error } = await sb.from('products').select('id', { count: 'exact', head: true })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}
