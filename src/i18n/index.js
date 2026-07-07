// POS Easy Indonesia — i18n module index
// Usage in pages/components:
//   import { t, fmtMoney, formatDate } from '../i18n'
//   <button>{t('common.confirm')}</button>
//   <span>{fmtMoney(15000)}</span>  // → "Rp 15.000"

export { t, getCurrentLanguage, setLanguage, LANGUAGES, translations } from './translations.js';
export {
  fmtMoney,
  formatCurrency,
  formatRupiah,
  parseCurrencyInput,
  formatDate,
  formatDateTime,
  formatTime,
  formatWhatsAppLink,
  formatPercentage,
} from './formatting.js';
export { default as LanguageSwitcher } from './LanguageSwitcher.jsx';
