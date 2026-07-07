# Phase 1 Progress: i18n 三語化

## Checklist

### Infrastructure
- [x] Create `src/i18n/` directory
- [x] Create `translations.js` with zh/en/id dictionaries
- [x] Create `formatting.js` with currency/date utils
- [x] Create `index.js` module export
- [ ] Add unit tests for `t()` helper
- [ ] Add unit tests for formatting functions

### UI Pages to Translate (14 total)
- [ ] LoginScreen.jsx
- [ ] POSPage.jsx  
- [ ] DashboardPage.jsx
- [ ] InventoryPage.jsx
- [ ] MembersPage.jsx
- [ ] PurchasePage.jsx
- [ ] ReportsPage.jsx
- [ ] AccountingPage.jsx
- [ ] ShiftPage.jsx
- [ ] StocktakePage.jsx
- [ ] WastePage.jsx
- [ ] PromotionsPage.jsx
- [ ] SettingsPage.jsx
- [ ] OrdersPage.jsx

### Components to Translate
- [ ] Sidebar.jsx
- [ ] CartPanel.jsx
- [ ] RefundModal.jsx
- [ ] BarcodeScannerModal.jsx
- [ ] HeldOrdersModal.jsx
- [ ] PriceLookupModal.jsx
- [ ] ErrorBoundary.jsx
- [ ] SyncStatusBadge.jsx

### Public Menu (Customer-facing)
- [ ] public/menu/index.html
- [ ] public/menu/app.js
- [ ] public/menu/style.css

### Electron
- [ ] electron/main.js menu translation
- [ ] Electron app menu strings

### Verification
- [ ] No remaining hardcoded CJK characters in JSX
- [ ] All pages tested with language switch (zh/en/id)
- [ ] Rupiah formatting tested: "15" → "Rp 15.000"
- [ ] Date formatting tested: DD/MM/YYYY
- [ ] WhatsApp link generation tested
- [ ] First login language selection works
- [ ] Settings page language toggle works

## Notes
- Start with LoginScreen as template
- Get stakeholder approval on translation quality before bulk apply
- Indonesian translation to be reviewed by native speaker (Fiverr) before launch
- Grep for remaining CJK: `grep -r "[一-龥ぁ-ん]" src/`
