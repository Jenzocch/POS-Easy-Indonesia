/**
 * License 授權金鑰驗證 — 共用商業邏輯 (CommonJS)
 *
 * 同 electron/kasbon-shared.js 的理由：electron-builder 的 files 只打包 dist/、electron/、
 * public/menu/，src/ 不在安裝包內；且 src/ 下有 ESM/TS 檔案，main process 的 CJS require
 * 會直接 SyntaxError 或 MODULE_NOT_FOUND（af8ef30 修過這個問題）。所以這裡是純 CJS，
 * 不 require 任何 src/ 底下的東西。
 *
 * 只內嵌「公鑰」，私鑰只存在 tools/license-private-key.pem（不出貨、gitignored），
 * 由 tools/generate-license.js 離線簽發授權碼。
 *
 * License code 格式：base64url(JSON payload) + '.' + base64url(Ed25519 signature)
 * Payload：{ tier, to, expires: <ISO date|null>, issuedAt: <ISO date>, v: 1 }
 *
 * 對外函式一律不 throw（內部 try/catch），回傳 { valid, ... } 結構化結果 —
 * 避免驗證失敗把 main process 或 IPC 炸掉。
 */

const crypto = require('crypto')

// 訂閱層級——複製自 electron/kasbon-shared.js 的 KASBON_LIMITS（source of truth），
// 修改時請與 kasbon-shared.js 及 tools/generate-license.js 同步。
const KASBON_LIMITS = {
  free: { perMember: 0, perStore: 0 },
  warung: { perMember: 50e6, perStore: 500e6 },
  resto: { perMember: 500e6, perStore: 5e9 },
}

// 公鑰（SPKI PEM）— 由 tools/generate-license.js 產生。只有這把公鑰隨 app 出貨，
// 私鑰永遠留在 tools/license-private-key.pem，不進版控、不打包。
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlg42srqZII+lgj/GDiXqCC+9R3W0QjRRZfvbn0LDkeU=
-----END PUBLIC KEY-----
`

/**
 * 驗證授權碼。永不 throw。
 * @param {string} code base64url(payload) + '.' + base64url(signature)
 * @returns {{valid:true, tier:string, to:string, expires:string|null}
 *         | {valid:false, reason:'invalid_signature'|'expired'|'malformed'|'unknown_tier'}}
 */
function verifyLicense(code) {
  try {
    if (!code || typeof code !== 'string') {
      return { valid: false, reason: 'malformed' }
    }

    const parts = code.trim().split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { valid: false, reason: 'malformed' }
    }
    const [payloadB64, signatureB64] = parts

    let payloadJson
    let payload
    try {
      payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
      payload = JSON.parse(payloadJson)
    } catch {
      return { valid: false, reason: 'malformed' }
    }
    if (!payload || typeof payload !== 'object' || !payload.tier || !payload.to) {
      return { valid: false, reason: 'malformed' }
    }

    let signature
    try {
      signature = Buffer.from(signatureB64, 'base64url')
    } catch {
      return { valid: false, reason: 'malformed' }
    }

    let publicKey
    let signatureOk = false
    try {
      publicKey = crypto.createPublicKey(LICENSE_PUBLIC_KEY)
      signatureOk = crypto.verify(null, Buffer.from(payloadJson, 'utf8'), publicKey, signature)
    } catch {
      signatureOk = false
    }
    if (!signatureOk) {
      return { valid: false, reason: 'invalid_signature' }
    }

    if (!Object.prototype.hasOwnProperty.call(KASBON_LIMITS, payload.tier)) {
      return { valid: false, reason: 'unknown_tier' }
    }

    if (payload.expires) {
      const expiresAt = new Date(payload.expires)
      if (isNaN(expiresAt.getTime())) {
        return { valid: false, reason: 'malformed' }
      }
      // 到期日視為當天結束（含當天）
      const endOfExpiryDay = new Date(expiresAt.getTime())
      endOfExpiryDay.setUTCHours(23, 59, 59, 999)
      if (Date.now() > endOfExpiryDay.getTime()) {
        return { valid: false, reason: 'expired' }
      }
    }

    return {
      valid: true,
      tier: payload.tier,
      to: payload.to,
      expires: payload.expires || null,
    }
  } catch {
    return { valid: false, reason: 'malformed' }
  }
}

/**
 * 開機（或啟用授權碼後）重新驗證並改寫 subscriptionTier 設定。
 *
 * 絕不信任資料表裡存的 tier 字串——每次都從 licenseCode 重新驗證簽章，並「覆寫」
 * subscriptionTier，讓有人直接手改 settings 表偽造 tier 這條路完全失效
 * （kasbon-shared.js 的 getSubscription() 只讀 subscriptionTier，這裡改完它就自動生效，
 * 不需要動 kasbon-shared.js）。
 *
 * @param {object} db electron/database.js 回傳的 wrapper（有 getSetting/setSetting）
 * @returns {{valid:true, tier:string, to:string, expires:string|null}
 *         | {valid:false, reason:'invalid_signature'|'expired'|'malformed'|'unknown_tier'|'absent'}}
 */
function syncSubscriptionTier(db) {
  let code = null
  try { code = db.getSetting('licenseCode') } catch { /* 讀取失敗視同無授權碼 */ }

  if (!code) {
    try { db.setSetting('subscriptionTier', 'free') } catch { /* 寫入失敗不致命，getSubscription 預設也是 free */ }
    return { valid: false, reason: 'absent' }
  }

  const result = verifyLicense(code)
  try {
    db.setSetting('subscriptionTier', result.valid ? result.tier : 'free')
  } catch { /* 寫入失敗不致命 */ }
  return result
}

module.exports = { verifyLicense, syncSubscriptionTier, KASBON_LIMITS }
