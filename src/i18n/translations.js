// POS Easy Indonesia — i18n core
// Ponytail approach: no framework. Plain dictionaries merged from per-feature
// fragment files in ./keys/ so parallel work never touches the same file.
// Language changes take effect via full page reload (see LanguageSwitcher).

import common from './keys/common.js'
import login from './keys/login.js'
import nav from './keys/nav.js'
import pos from './keys/pos.js'
import settings from './keys/settings.js'
import inventory from './keys/inventory.js'
import purchase from './keys/purchase.js'
import reports from './keys/reports.js'
import members from './keys/members.js'
import kasbon from './keys/kasbon.js'

const fragments = [common, login, nav, pos, settings, inventory, purchase, reports, members, kasbon]

export const LANGUAGES = [
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
]

export const translations = { zh: {}, en: {}, id: {} }
for (const frag of fragments) {
  for (const lang of ['zh', 'en', 'id']) {
    Object.assign(translations[lang], frag[lang] || {})
  }
}

const LANG_KEY = 'pos_language'

export function getCurrentLanguage() {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored && ['zh', 'en', 'id'].includes(stored)) return stored
  } catch { /* node / SSR */ }
  return 'id' // Indonesian market default
}

export function setLanguage(lang) {
  if (!['zh', 'en', 'id'].includes(lang)) return
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* ignore */ }
}

// t('pos.total') → translated string for current language.
// t('msg.deleted', { name: 'Kopi' }) → interpolates {name}.
// Fallback chain: current lang → id → zh → the key itself.
export function t(key, vars) {
  const lang = getCurrentLanguage()
  let s = translations[lang]?.[key] ?? translations.id?.[key] ?? translations.zh?.[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}
