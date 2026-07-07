// Customer QR ordering page — vanilla JS
const API = window.location.origin
let products = []
let categories = []
let cart = []
let activeCategory = null
let ws = null
let currentOrderId = null
let submitting = false

// ===== Mini i18n (self-contained, this page is not part of the React bundle) =====
const MENU_LANG_KEY = 'pos_menu_language'

const MENU_I18N = {
  zh: {
    pageTitle: '線上點餐',
    loading: '載入中...',
    subtitle: '線上點餐系統',
    searchPlaceholder: '搜尋商品...',
    cartTitle: '購物車',
    total: '合計',
    checkout: '送出訂單',
    confirmOrderTitle: '確認訂單',
    nameLabel: '您的姓名（選填）',
    namePlaceholder: '方便取餐時叫號',
    tableLabel: '桌號 / 備註（選填）',
    tablePlaceholder: '例如: 3號桌',
    noteLabel: '備註',
    notePlaceholder: '特殊需求...',
    cancel: '取消',
    confirmSubmit: '確認送出',
    orderSent: '訂單已送出!',
    continueOrder: '繼續點餐',
    offline: '無法連線',
    loadFail: '無法載入菜單，請確認網路連線',
    allCategories: '全部',
    soldOut: '售完',
    lastFew: '最後 {n} {unit}！',
    lowStock: '剩 {n} {unit}',
    addToCart: '加入購物車',
    noMatch: '沒有符合的商品',
    cartEmpty: '購物車是空的',
    submitting: '送出中...',
    orderFail: '訂單送出失敗',
    serverFail: '無法連線到伺服器',
    orderIdPrefix: '訂單編號: ',
    statusPending: '等待店家確認中...',
    statusAccepted: '店家已接單，準備中！',
    statusCompleted: '已完成，請取餐！',
    statusRejected: '很抱歉，訂單已被取消',
    defaultUnit: '個',
  },
  en: {
    pageTitle: 'Online Ordering',
    loading: 'Loading...',
    subtitle: 'Online Ordering System',
    searchPlaceholder: 'Search menu...',
    cartTitle: 'Cart',
    total: 'Total',
    checkout: 'Place Order',
    confirmOrderTitle: 'Confirm Order',
    nameLabel: 'Your name (optional)',
    namePlaceholder: 'So we can call you when it\'s ready',
    tableLabel: 'Table no. / Note (optional)',
    tablePlaceholder: 'e.g. Table 3',
    noteLabel: 'Note',
    notePlaceholder: 'Special requests...',
    cancel: 'Cancel',
    confirmSubmit: 'Submit Order',
    orderSent: 'Order Sent!',
    continueOrder: 'Order More',
    offline: 'Connection failed',
    loadFail: 'Could not load the menu, please check your internet connection',
    allCategories: 'All',
    soldOut: 'Sold Out',
    lastFew: 'Only {n} {unit} left!',
    lowStock: '{n} {unit} left',
    addToCart: 'Add to Cart',
    noMatch: 'No matching items',
    cartEmpty: 'Your cart is empty',
    submitting: 'Sending...',
    orderFail: 'Failed to submit order',
    serverFail: 'Could not reach the server',
    orderIdPrefix: 'Order no.: ',
    statusPending: 'Waiting for the shop to confirm...',
    statusAccepted: 'Order accepted, being prepared!',
    statusCompleted: 'Done, please pick up your order!',
    statusRejected: 'Sorry, your order was cancelled',
    defaultUnit: 'pcs',
  },
  id: {
    pageTitle: 'Pesan Online',
    loading: 'Memuat...',
    subtitle: 'Sistem Pemesanan Online',
    searchPlaceholder: 'Cari menu...',
    cartTitle: 'Keranjang',
    total: 'Total',
    checkout: 'Pesan Sekarang',
    confirmOrderTitle: 'Konfirmasi Pesanan',
    nameLabel: 'Nama Anda (opsional)',
    namePlaceholder: 'Untuk dipanggil saat pesanan siap',
    tableLabel: 'No. Meja / Catatan (opsional)',
    tablePlaceholder: 'Contoh: Meja 3',
    noteLabel: 'Catatan',
    notePlaceholder: 'Permintaan khusus...',
    cancel: 'Batal',
    confirmSubmit: 'Kirim Pesanan',
    orderSent: 'Pesanan Terkirim!',
    continueOrder: 'Pesan Lagi',
    offline: 'Tidak dapat terhubung',
    loadFail: 'Tidak dapat memuat menu, silakan periksa koneksi internet Anda',
    allCategories: 'Semua',
    soldOut: 'Habis',
    lastFew: 'Sisa {n} {unit} terakhir!',
    lowStock: 'Sisa {n} {unit}',
    addToCart: 'Tambah ke Keranjang',
    noMatch: 'Tidak ada menu yang cocok',
    cartEmpty: 'Keranjang masih kosong',
    submitting: 'Mengirim...',
    orderFail: 'Gagal mengirim pesanan',
    serverFail: 'Tidak dapat terhubung ke server',
    orderIdPrefix: 'No. Pesanan: ',
    statusPending: 'Menunggu konfirmasi warung...',
    statusAccepted: 'Pesanan diterima, sedang disiapkan!',
    statusCompleted: 'Selesai, silakan ambil pesanan Anda!',
    statusRejected: 'Maaf, pesanan Anda dibatalkan',
    defaultUnit: 'porsi',
  },
}

// Native-script labels for the language toggle (中文 = Chinese)
const MENU_LANG_LABELS = { id: 'ID', en: 'EN', zh: '中文' }

let LANG = localStorage.getItem(MENU_LANG_KEY)
if (!MENU_I18N[LANG]) LANG = 'id' // default: Indonesian customers

function mt(key, params) {
  let s = (MENU_I18N[LANG] && MENU_I18N[LANG][key]) || MENU_I18N.id[key] || key
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(params[k])
  }
  return s
}

function setLang(lang) {
  if (!MENU_I18N[lang]) return
  localStorage.setItem(MENU_LANG_KEY, lang)
  location.reload()
}

// Format price as Indonesian Rupiah: Rp 15.000 (dot thousands separator, no decimals)
function fmtMoney(n) {
  const num = Math.round(Number(n) || 0)
  return 'Rp ' + String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function renderLangToggle() {
  const box = document.getElementById('lang-toggle')
  if (!box) return
  box.innerHTML = ''
  ;['id', 'en', 'zh'].forEach(code => {
    const btn = document.createElement('button')
    btn.className = 'lang-btn' + (LANG === code ? ' active' : '')
    btn.textContent = MENU_LANG_LABELS[code]
    btn.onclick = () => setLang(code)
    box.appendChild(btn)
  })
}

function applyI18n() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-TW' : LANG
  document.title = mt('pageTitle')
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = mt(el.getAttribute('data-i18n'))
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', mt(el.getAttribute('data-i18n-placeholder')))
  })
  renderLangToggle()
}

// Escape HTML special chars (XSS protection)
function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

// ===== Init =====
async function init() {
  applyI18n()
  try {
    const res = await fetch(API + '/api/menu')
    const data = await res.json()
    if (data.success) {
      products = data.products
      categories = data.categories
      document.getElementById('store-name').textContent = data.storeName
      document.title = data.storeName + ' - ' + mt('pageTitle')
      renderCategories()
      renderProducts()
    }
  } catch (err) {
    document.getElementById('store-name').textContent = mt('offline')
    document.getElementById('product-list').innerHTML =
      '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">' + esc(mt('loadFail')) + '</p>'
  }
  connectWebSocket()
}

// ===== WebSocket =====
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  try {
    ws = new WebSocket(protocol + '//' + location.host)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'order-status' && msg.orderId === currentOrderId) {
          updateOrderStatus(msg.status)
        }
      } catch {}
    }
    ws.onclose = () => setTimeout(connectWebSocket, 3000)
    ws.onerror = () => {}
  } catch {}
}

// ===== Categories =====
function renderCategories() {
  const nav = document.getElementById('categories')
  const allBtn = createCatBtn(mt('allCategories'), null)
  nav.appendChild(allBtn)
  categories.forEach(cat => nav.appendChild(createCatBtn(cat, cat)))
}

function createCatBtn(label, value) {
  const btn = document.createElement('button')
  btn.className = 'cat-btn' + (activeCategory === value ? ' active' : '')
  btn.textContent = label
  btn.onclick = () => {
    activeCategory = value
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    renderProducts()
  }
  return btn
}

// ===== Product search =====
let searchQuery = ''

// ===== Product list =====
function renderProducts() {
  const list = document.getElementById('product-list')
  let filtered = activeCategory
    ? products.filter(p => p.category === activeCategory)
    : products
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    )
  }

  list.innerHTML = filtered.map(p => {
    const inCart = cart.find(c => c.id === p.id)
    const qtyBadge = inCart ? `<div class="qty-badge">${inCart.qty}</div>` : ''
    const stock = Number(p.stock) || 0
    const soldOut = stock <= 0
    const lastFew = stock > 0 && stock <= 3
    const low = stock > 0 && stock <= 5
    const unit = esc(p.unit || mt('defaultUnit'))
    let stockNote = ''
    if (soldOut) stockNote = `<span class="p-soldout">${esc(mt('soldOut'))}</span>`
    else if (lastFew) stockNote = `<span class="p-stock-last">${mt('lastFew', { n: stock, unit })}</span>`
    else if (low) stockNote = `<span class="p-stock-low">${mt('lowStock', { n: stock, unit })}</span>`
    return `
      <div class="product-card${soldOut ? ' sold-out' : ''}">
        ${qtyBadge}
        <span class="p-category">${esc(p.category)}</span>
        <span class="p-name">${esc(p.name)}</span>
        <span class="p-price">${fmtMoney(p.price)} <span class="p-unit">/ ${unit}</span></span>
        ${stockNote}
        <button class="add-btn" data-pid="${esc(p.id)}" ${soldOut ? 'disabled' : ''}>${soldOut ? esc(mt('soldOut')) : esc(mt('addToCart'))}</button>
      </div>
    `
  }).join('')

  if (!filtered.length) {
    list.innerHTML = '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">' + esc(mt('noMatch')) + '</p>'
  }

  // Event delegation instead of inline onclick — audit #23 edge case, safely handles ids with special chars
  list.querySelectorAll('.add-btn[data-pid]').forEach(btn => {
    btn.onclick = () => addToCart(btn.getAttribute('data-pid'))
  })
}

function setSearch(q) {
  searchQuery = q || ''
  renderProducts()
}

// ===== Cart =====
function addToCart(productId) {
  const product = products.find(p => p.id === productId)
  if (!product) return
  const existing = cart.find(c => c.id === productId)
  if (existing) {
    if (existing.qty >= product.stock) return // cannot exceed stock
    existing.qty++
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty: 1, unit: product.unit })
  }
  updateCartUI()
  renderProducts() // refresh qty badge
}

function removeFromCart(productId) {
  const idx = cart.findIndex(c => c.id === productId)
  if (idx < 0) return
  if (cart[idx].qty > 1) cart[idx].qty--
  else cart.splice(idx, 1)
  updateCartUI()
  renderProducts()
}

function deleteFromCart(productId) {
  cart = cart.filter(c => c.id !== productId)
  updateCartUI()
  renderProducts()
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0)
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0)
}

function updateCartUI() {
  const badge = document.getElementById('cart-badge')
  const count = getCartCount()
  badge.textContent = count
  badge.style.display = count > 0 ? 'flex' : 'none'

  const itemsDiv = document.getElementById('cart-items')
  const totalEl = document.getElementById('cart-total-amount')
  const checkoutBtn = document.getElementById('checkout-btn')

  if (!cart.length) {
    itemsDiv.innerHTML = '<div class="cart-empty">' + esc(mt('cartEmpty')) + '</div>'
    totalEl.textContent = fmtMoney(0)
    checkoutBtn.disabled = true
    return
  }

  itemsDiv.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-name">${esc(item.name)}</div>
        <div class="ci-price">${fmtMoney(item.price)} / ${esc(item.unit || mt('defaultUnit'))}</div>
      </div>
      <div class="ci-controls">
        <button onclick="removeFromCart('${esc(item.id)}')">-</button>
        <span class="ci-qty">${item.qty}</span>
        <button onclick="addToCart('${esc(item.id)}')">+</button>
      </div>
      <span class="ci-subtotal">${fmtMoney(item.price * item.qty)}</span>
    </div>
  `).join('')

  totalEl.textContent = fmtMoney(getCartTotal())
  checkoutBtn.disabled = false
}

function toggleCart() {
  const overlay = document.getElementById('cart-overlay')
  const panel = document.getElementById('cart-panel')
  const isOpen = panel.classList.contains('open')
  if (isOpen) {
    panel.classList.remove('open')
    overlay.classList.remove('open')
  } else {
    updateCartUI()
    panel.classList.add('open')
    overlay.classList.add('open')
  }
}

// ===== Order submission =====
function submitOrder() {
  if (!cart.length) return
  toggleCart()
  document.getElementById('form-total').textContent = fmtMoney(getCartTotal())
  document.getElementById('order-form-overlay').style.display = 'flex'
}

function closeOrderForm() {
  document.getElementById('order-form-overlay').style.display = 'none'
}

async function confirmOrder() {
  if (submitting) return
  submitting = true
  const btn = document.querySelector('.order-form .btn-primary')
  if (btn) { btn.disabled = true; btn.textContent = mt('submitting') }

  const customerName = document.getElementById('customer-name').value.trim()
  const tableNum = document.getElementById('table-num').value.trim()
  const note = document.getElementById('order-note').value.trim()

  const orderItems = cart.map(c => ({ id: c.id, qty: c.qty }))

  try {
    const res = await fetch(API + '/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: orderItems, customerName, tableNum, note }),
    })
    const data = await res.json()
    if (data.success) {
      currentOrderId = data.orderId
      closeOrderForm()
      showSuccess(data.orderId, data.total)
      cart = []
      updateCartUI()
    } else {
      alert(data.error || mt('orderFail'))
    }
  } catch (err) {
    alert(mt('serverFail'))
  }
  submitting = false
  if (btn) { btn.disabled = false; btn.textContent = mt('confirmSubmit') }
}

function showSuccess(orderId, total) {
  document.getElementById('success-order-id').textContent = mt('orderIdPrefix') + orderId
  document.getElementById('success-status').textContent = mt('statusPending')
  document.getElementById('order-success').style.display = 'flex'
}

function updateOrderStatus(status) {
  const statusEl = document.getElementById('success-status')
  if (!statusEl) return
  const labels = {
    pending: mt('statusPending'),
    accepted: mt('statusAccepted'),
    completed: mt('statusCompleted'),
    rejected: mt('statusRejected'),
  }
  statusEl.textContent = labels[status] || status
}

function resetApp() {
  currentOrderId = null
  document.getElementById('order-success').style.display = 'none'
  document.getElementById('customer-name').value = ''
  document.getElementById('table-num').value = ''
  document.getElementById('order-note').value = ''
  renderProducts()
}

// Start
init()
