// friendlyError — turns a raw JS exception into a short, plain-language message
// with a concrete next step, for display to older/low-literacy shop staff.
//
// Why this exists: raw exception text ("TypeError: Failed to fetch", "Invalid API
// key", English validation strings from IPC handlers, stack traces...) means
// nothing to this app's target users and makes them freeze. This function never
// shows the raw message on screen — callers should still log the ORIGINAL error
// via console.error / writeAuditLog wherever they already do, for debugging.
//
// This is intentionally NOT exhaustive — it only covers the realistic failure
// modes the app's five call sites (cloud sync, CSV import, Kasbon IPC) actually
// surface: offline/network failures, Supabase/auth misconfiguration, malformed
// CSV files, and a generic "something went wrong" catch-all for everything else
// (this is also the right bucket for unexpected Kasbon/IPC failures — genuine
// business-rule rejections from kasbon-validation.js are already user-facing
// Indonesian/structured messages surfaced via `response.error`, not exceptions,
// so they never reach this function and are intentionally left untouched).
import { t } from '../i18n'

/**
 * @param {unknown} err - the caught error/exception (Error, string, anything)
 * @param {'network'|'cloud'|'csv'|string} [context] - optional hint about where
 *   the error came from, used to bias classification when the message itself
 *   is ambiguous (e.g. a plain "Error: 500" from a cloud call).
 * @returns {string} a translated (t()) plain-language message with a next step
 */
export function friendlyError(err, context) {
  const message = String((err && err.message) ?? err ?? '')
  const lower = message.toLowerCase()

  // Network / offline — checked first since it can happen regardless of context
  // (e.g. a cloud push that fails because there's simply no connection at all).
  const isNetwork =
    (err instanceof TypeError && lower.includes('fetch')) ||
    /network|offline|failed to fetch|econnrefused|enotfound|etimedout|\btimeout\b/.test(lower) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  if (isNetwork) return t('errors.network')

  // Supabase / auth misconfiguration
  const isAuth = /unauthorized|invalid.*key|apikey|api key|jwt|401|403|permission denied/.test(lower)
  if (isAuth || context === 'cloud') return t('errors.cloud_config')

  // CSV / file parsing
  const isCsv = /csv|parse|unexpected token|malformed|column/.test(lower)
  if (isCsv || context === 'csv') return t('errors.csv_format')

  // Generic fallback — also correct for unexpected Kasbon/IPC/DB failures
  return t('errors.generic')
}
