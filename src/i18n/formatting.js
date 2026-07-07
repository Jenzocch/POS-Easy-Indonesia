// POS Pro Indonesia — Currency & Date Formatting Utilities
// Support Indonesian Rupiah (Rp), Chinese (CNY/NT), English (USD)

import { getCurrentLanguage } from './translations.js';

/**
 * Format number as Rupiah (Rp 15.000 format — dot for thousands, no decimals)
 * @param {number} value - Amount in rupiah
 * @returns {string} Formatted string like "Rp 15.000"
 */
export function formatRupiah(value) {
  if (!Number.isFinite(value)) return 'Rp 0';
  
  // Remove decimals and format with thousands separator (.)
  const formatted = Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

/**
 * Format currency based on current language
 * @param {number} value - Amount
 * @param {string} lang - Optional language override ('id', 'zh', 'en')
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, lang = null) {
  const language = lang || getCurrentLanguage();
  
  switch(language) {
    case 'id': // Indonesian Rupiah
      return formatRupiah(value);
    case 'zh': // Traditional Chinese (NT$ for Taiwan)
      return `NT$ ${Math.floor(value).toLocaleString('zh-TW')}`;
    case 'en': // English (USD)
      return `$ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return formatRupiah(value);
  }
}

/**
 * Parse currency input — handles "15" → 15000 for Indonesian pricing
 * @param {string|number} input - User input
 * @param {boolean} autoMultiply - Auto-multiply by 1000 for Indonesian (default true)
 * @returns {number} Numeric value
 */
export function parseCurrencyInput(input, autoMultiply = true) {
  const lang = getCurrentLanguage();
  let num = parseFloat(input) || 0;
  
  // Auto-multiply by 1000 for Indonesian "15" → 15000 pattern
  if (lang === 'id' && autoMultiply && num < 1000 && num > 0) {
    num *= 1000;
  }
  
  return Math.floor(num);
}

/**
 * Format date as DD/MM/YYYY (standard for Indonesia & international)
 * @param {Date|string|number} date - Date object or timestamp
 * @returns {string} Formatted date like "07/07/2026"
 */
export function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format datetime as "DD/MM/YYYY HH:MM"
 * @param {Date|string|number} date - Date object or timestamp
 * @returns {string} Formatted datetime
 */
export function formatDateTime(date) {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format time as HH:MM
 * @param {Date|string|number} date - Date object or timestamp
 * @returns {string} Formatted time like "14:30"
 */
export function formatTime(date) {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

/**
 * Format Indonesian phone number with WhatsApp prefix
 * @param {string} phone - Phone number (with or without +62)
 * @returns {string} WhatsApp URL
 */
export function formatWhatsAppLink(phone, message = '') {
  // Remove non-digits and handle Indonesian prefix
  let cleaned = phone.replace(/\D/g, '');
  
  // Convert "0..." to "62..." for Indonesian numbers
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  
  // Ensure 62 prefix
  if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encodedMsg}`;
}

/**
 * Format percentage
 * @param {number} value - Decimal (0.15 = 15%)
 * @param {number} decimals - Decimal places (default 1)
 * @returns {string} Formatted percentage like "15.0%"
 */
export function formatPercentage(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}
