// POS Pro Indonesia — i18n Translation Dictionary
// Simple ponytail approach: no i18next, just object lookup + localStorage

export const translations = {
  zh: {
    // Login
    'login.title': '登入',
    'login.username': '帳號',
    'login.password': '密碼',
    'login.login_button': '登入',
    'login.error': '帳號或密碼錯誤',
    
    // Common
    'common.confirm': '確認',
    'common.cancel': '取消',
    'common.close': '關閉',
    'common.save': '儲存',
    'common.delete': '刪除',
    'common.edit': '編輯',
    'common.add': '新增',
    'common.search': '搜尋',
    'common.no_data': '無資料',
    'common.loading': '載入中...',
    
    // POS
    'pos.title': '收銀',
    'pos.item': '品項',
    'pos.qty': '數量',
    'pos.price': '價格',
    'pos.total': '合計',
    'pos.cash': '現金',
    'pos.card': '卡片',
    'pos.qris': 'QRIS',
    'pos.complete': '完成',
    'pos.refund': '退貨',
    'pos.receipt': '收據',
    
    // Reports
    'reports.title': '報表',
    'reports.daily_revenue': '每日營收',
    'reports.profit': '毛利',
    'reports.transactions': '交易數',
    
    // Settings
    'settings.title': '設定',
    'settings.language': '語言',
    'settings.logout': '登出',
  },
  
  en: {
    // Login
    'login.title': 'Login',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.login_button': 'Login',
    'login.error': 'Invalid username or password',
    
    // Common
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.no_data': 'No data',
    'common.loading': 'Loading...',
    
    // POS
    'pos.title': 'POS',
    'pos.item': 'Item',
    'pos.qty': 'Quantity',
    'pos.price': 'Price',
    'pos.total': 'Total',
    'pos.cash': 'Cash',
    'pos.card': 'Card',
    'pos.qris': 'QRIS',
    'pos.complete': 'Complete',
    'pos.refund': 'Refund',
    'pos.receipt': 'Receipt',
    
    // Reports
    'reports.title': 'Reports',
    'reports.daily_revenue': 'Daily Revenue',
    'reports.profit': 'Profit',
    'reports.transactions': 'Transactions',
    
    // Settings
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.logout': 'Logout',
  },
  
  id: {
    // Login
    'login.title': 'Masuk',
    'login.username': 'Nama Pengguna',
    'login.password': 'Kata Sandi',
    'login.login_button': 'Masuk',
    'login.error': 'Nama pengguna atau kata sandi salah',
    
    // Common
    'common.confirm': 'Konfirmasi',
    'common.cancel': 'Batal',
    'common.close': 'Tutup',
    'common.save': 'Simpan',
    'common.delete': 'Hapus',
    'common.edit': 'Edit',
    'common.add': 'Tambah',
    'common.search': 'Cari',
    'common.no_data': 'Tidak ada data',
    'common.loading': 'Memuat...',
    
    // POS
    'pos.title': 'Kasir',
    'pos.item': 'Barang',
    'pos.qty': 'Jumlah',
    'pos.price': 'Harga',
    'pos.total': 'Total',
    'pos.cash': 'Tunai',
    'pos.card': 'Kartu',
    'pos.qris': 'QRIS',
    'pos.complete': 'Selesai',
    'pos.refund': 'Retur',
    'pos.receipt': 'Kwitansi',
    
    // Reports
    'reports.title': 'Laporan',
    'reports.daily_revenue': 'Omzet Harian',
    'reports.profit': 'Keuntungan',
    'reports.transactions': 'Transaksi',
    
    // Settings
    'settings.title': 'Pengaturan',
    'settings.language': 'Bahasa',
    'settings.logout': 'Keluar',
  }
};

// Get current language from localStorage, default to 'id' for Indonesia market
export function getCurrentLanguage() {
  const stored = localStorage.getItem('pos_language');
  return stored || 'id'; // Default to Indonesian
}

// Set language to localStorage
export function setLanguage(lang) {
  if (['zh', 'en', 'id'].includes(lang)) {
    localStorage.setItem('pos_language', lang);
  }
}

// Translation helper function - called throughout the app
export function t(key, defaultValue = key) {
  const lang = getCurrentLanguage();
  return translations[lang]?.[key] || translations['id']?.[key] || defaultValue;
}
