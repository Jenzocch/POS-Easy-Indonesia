import { useState, useMemo, useEffect } from 'react'
import { Plus, Search, X, AlertCircle } from 'lucide-react'
import { t, fmtMoney } from '../i18n'
import { isElectron, loadKastonRecords, createKasbon, recordKastonPayment, getKastonAgingReport } from '../utils/dataAccess'
import { friendlyError } from '../utils/friendlyError'

const TABS = [
  { id: 'active', label: 'kasbon.active' },
  { id: 'settled', label: 'kasbon.settled' },
  { id: 'reports', label: 'kasbon.reports' },
]

export default function KastonPage({ store, session }) {
  const [activeTab, setActiveTab] = useState('active')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchMember, setSearchMember] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [error, setError] = useState(null)
  const [agingReport, setAgingReport] = useState(null)

  // Load kasbon records（瀏覽器模式無 SQLite，直接跳過）
  useEffect(() => {
    if (isElectron) loadRecords()
  }, [])

  const loadRecords = async () => {
    try {
      setLoading(true)
      const data = await loadKastonRecords()
      if (data.success) {
        setRecords(data.data || [])
      }
    } catch (err) {
      console.error('[Kasbon] loadRecords failed:', err)
      setError(friendlyError(err, 'kasbon'))
    } finally {
      setLoading(false)
    }
  }

  const loadAgingReport = async () => {
    try {
      const data = await getKastonAgingReport()
      if (data.success) {
        setAgingReport(data.data)
      }
    } catch (err) {
      console.error('[Kasbon] loadAgingReport failed:', err)
      setError(friendlyError(err, 'kasbon'))
    }
  }

  // Filter records based on active tab and search
  const filteredRecords = useMemo(() => {
    let filtered = records

    // Filter by tab
    if (activeTab === 'active') {
      filtered = filtered.filter(r => r.status !== 'closed')
    } else if (activeTab === 'settled') {
      filtered = filtered.filter(r => r.status === 'closed')
    }

    // Filter by search
    if (searchMember) {
      const q = searchMember.toLowerCase()
      filtered = filtered.filter(r =>
        r.memberName?.toLowerCase().includes(q) ||
        r.memberId?.toLowerCase().includes(q)
      )
    }

    // Filter by status
    if (selectedStatus) {
      filtered = filtered.filter(r => r.status === selectedStatus)
    }

    return filtered
  }, [records, activeTab, searchMember, selectedStatus])

  // Load aging report when reports tab is opened
  useEffect(() => {
    if (isElectron && activeTab === 'reports' && !agingReport) {
      loadAgingReport()
    }
  }, [activeTab])

  // 瀏覽器模式：Kasbon 需要本機 SQLite，顯示桌面版提示（同 OrdersPage 的 orders.desktop_only 模式）
  if (!isElectron) {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <div style={s.titleSection}>
            <h1 style={s.title}>{t('kasbon.title')}</h1>
          </div>
        </div>
        <div style={s.content}>
          <div style={{ ...s.noRecords, background: 'var(--bg-raised)', border: '1px solid var(--border-dim)', borderRadius: 'var(--r3)' }}>
            {t('kasbon.desktop_only')}
          </div>
        </div>
      </div>
    )
  }

  const handleNewKasbon = async (formData) => {
    try {
      const response = await createKasbon(formData)
      if (response.success) {
        setRecords([...records, response.data])
        setShowNewModal(false)
      } else {
        setError(response.error || t('kasbon.create_failed'))
      }
    } catch (err) {
      console.error('[Kasbon] createKasbon failed:', err)
      setError(friendlyError(err, 'kasbon'))
    }
  }

  const handleRecordPayment = async (formData) => {
    try {
      const response = await recordKastonPayment(selectedRecord.id, formData)
      if (response.success) {
        // Update record in list
        setRecords(records.map(r =>
          r.id === selectedRecord.id ? response.data.record : r
        ))
        setShowPaymentModal(false)
        setSelectedRecord(null)
      } else {
        setError(response.error || t('kasbon.payment_failed'))
      }
    } catch (err) {
      console.error('[Kasbon] recordKastonPayment failed:', err)
      setError(friendlyError(err, 'kasbon'))
    }
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.titleSection}>
          <h1 style={s.title}>{t('kasbon.title')}</h1>
          {activeTab !== 'reports' && (
            <button onClick={() => setShowNewModal(true)} className="btn btn-primary btn-sm">
              <Plus size={16}/>
              {t('kasbon.new_kasbon')}
            </button>
          )}
        </div>
        {error && (
          <div style={s.errorBanner}>
            <AlertCircle size={14}/>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{background:'none', border:'none', color:'inherit', cursor:'pointer'}}>
              <X size={14}/>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...s.tabBtn,
              borderBottomColor: activeTab === tab.id ? 'var(--blue)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 500,
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={s.content}>
        {activeTab === 'reports' ? (
          <ReportsTab data={agingReport} loading={loading}/>
        ) : (
          <RecordsTab
            records={filteredRecords}
            loading={loading}
            searchMember={searchMember}
            onSearchChange={setSearchMember}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            onPaymentClick={(record) => {
              setSelectedRecord(record)
              setShowPaymentModal(true)
            }}
          />
        )}
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewKastonModal
          members={store.members}
          onClose={() => setShowNewModal(false)}
          onSubmit={handleNewKasbon}
        />
      )}

      {showPaymentModal && selectedRecord && (
        <PaymentModal
          record={selectedRecord}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedRecord(null)
          }}
          onSubmit={handleRecordPayment}
        />
      )}
    </div>
  )
}

// Records tab component
function RecordsTab({ records, loading, searchMember, onSearchChange, selectedStatus, onStatusChange, onPaymentClick }) {
  if (loading) {
    return <div style={{padding:20, color:'var(--text-secondary)'}}>{t('common.loading')}</div>
  }

  return (
    <div style={s.recordsTab}>
      {/* Filters */}
      <div style={s.filters}>
        <div style={s.searchBox}>
          <Search size={14}/>
          <input
            type="text"
            placeholder={t('kasbon.search_member')}
            value={searchMember}
            onChange={(e) => onSearchChange(e.target.value)}
            style={s.searchInput}
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          style={s.statusFilter}
        >
          <option value="">{t('kasbon.filter')}</option>
          <option value="open">{t('kasbon.open')}</option>
          <option value="partial">{t('kasbon.partial')}</option>
          <option value="closed">{t('kasbon.closed')}</option>
        </select>
        {(searchMember || selectedStatus) && (
          <button
            onClick={() => {
              onSearchChange('')
              onStatusChange('')
            }}
            style={s.clearBtn}
          >
            <X size={14}/>
            {t('kasbon.clear_filter')}
          </button>
        )}
      </div>

      {/* Records table */}
      {records.length === 0 ? (
        <div style={s.noRecords}>{t('kasbon.no_records')}</div>
      ) : (
        <div style={s.table}>
          {/* TABLE-01：欄寬總和（500px 固定欄 + 200px 會員欄）超出窄視窗時，外層 overflowX:auto
              取代原本 s.table 的 overflow:hidden，確保「記錄付款」欄位一律可捲動到達，不被裁切 */}
          <div style={s.tableScroll}>
            <div style={s.tableHeader}>
              <div style={{flex:1, minWidth:200}}>{t('kasbon.member')}</div>
              <div style={{width:120, flexShrink:0}}>{t('kasbon.amount')}</div>
              <div style={{width:100, flexShrink:0}}>{t('kasbon.balance')}</div>
              <div style={{width:100, flexShrink:0}}>{t('kasbon.date')}</div>
              <div style={{width:80, flexShrink:0}}>{t('kasbon.status')}</div>
              <div style={{width:150, flexShrink:0}}>{t('kasbon.actions')}</div>
            </div>
            <div style={s.tableBody}>
              {records.map(r => (
                <div key={r.id} style={s.tableRow}>
                  <div style={{flex:1, minWidth:200}}>
                    <div style={{fontWeight:500}}>{r.memberName || r.memberId}</div>
                    <div style={{fontSize:12, color:'var(--text-tertiary)'}}>{r.memberPhone}</div>
                  </div>
                  <div style={{width:120, flexShrink:0, textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13}}>
                    {fmtMoney(r.principalAmount)}
                  </div>
                  <div style={{width:100, flexShrink:0, textAlign:'right', fontFamily:'var(--font-mono)', fontSize:13, color:r.balanceDue > 0 ? 'var(--red)' : 'var(--text-secondary)'}}>
                    {fmtMoney(r.balanceDue)}
                  </div>
                  <div style={{width:100, flexShrink:0, fontSize:12, color:'var(--text-secondary)'}}>
                    {new Date(r.transactionDate).toLocaleDateString('id-ID')}
                  </div>
                  <div style={{width:80, flexShrink:0, fontSize:12}}>
                    <span style={{...s.statusBadge(r.status)}}>{t(`kasbon.${r.status}`)}</span>
                  </div>
                  <div style={{width:150, flexShrink:0}}>
                    {r.status !== 'closed' && (
                      <button
                        onClick={() => onPaymentClick(r)}
                        className="btn btn-primary btn-sm"
                      >
                        {t('kasbon.record_payment')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Reports tab component
function ReportsTab({ data, loading }) {
  if (loading || !data) {
    return <div style={{padding:20, color:'var(--text-secondary)'}}>{t('common.loading')}</div>
  }

  const { summary, detail } = data

  return (
    <div style={s.reportsTab}>
      {/* Summary cards */}
      <div style={s.summaryCards}>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.total_ar')}</div>
          <div style={s.summaryValue}>{fmtMoney(summary.totalAR)}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.total_records')}</div>
          <div style={s.summaryValue}>{summary.totalRecords}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.current')}</div>
          <div style={s.summaryValue}>
            {summary.buckets.current.count} ({fmtMoney(summary.buckets.current.amount)})
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.overdue_30')}</div>
          <div style={s.summaryValue}>
            {summary.buckets.overdue30.count} ({fmtMoney(summary.buckets.overdue30.amount)})
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.overdue_60')}</div>
          <div style={s.summaryValue}>
            {summary.buckets.overdue60.count} ({fmtMoney(summary.buckets.overdue60.amount)})
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>{t('kasbon.overdue_90')}</div>
          <div style={s.summaryValue}>
            {summary.buckets.overdue90.count} ({fmtMoney(summary.buckets.overdue90.amount)})
          </div>
        </div>
      </div>

      {/* Aging buckets */}
      <div style={s.agingBuckets}>
        {[
          { key: 'current', label: 'kasbon.current', records: detail.current },
          { key: 'overdue30', label: 'kasbon.overdue_30', records: detail.overdue30 },
          { key: 'overdue60', label: 'kasbon.overdue_60', records: detail.overdue60 },
          { key: 'overdue90', label: 'kasbon.overdue_90', records: detail.overdue90 },
        ].map(bucket => (
          <div key={bucket.key} style={s.agingBucket}>
            <h3 style={s.bucketTitle}>{t(bucket.label)} ({bucket.records.length})</h3>
            {bucket.records.length === 0 ? (
              <div style={{padding:12, color:'var(--text-tertiary)', fontSize:13}}>{t('kasbon.no_records')}</div>
            ) : (
              <div style={s.bucketTable}>
                {bucket.records.slice(0, 10).map(r => (
                  <div key={r.id} style={s.bucketRow}>
                    <div style={{flex:1, fontSize:13}}>
                      <div>{r.memberName}</div>
                      <div style={{fontSize:11, color:'var(--text-tertiary)'}}>{r.notes}</div>
                    </div>
                    <div style={{width:120, textAlign:'right', fontSize:13, fontFamily:'var(--font-mono)'}}>
                      {fmtMoney(r.balanceDue)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// New Kasbon modal
function NewKastonModal({ members, onClose, onSubmit }) {
  const [memberId, setMemberId] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!memberId || !amount) {
      setError(t('kasbon.required_fields'))
      return
    }

    setLoading(true)
    try {
      await onSubmit({ memberId, amount: parseFloat(amount), dueDate, notes })
      setError(null)
    } catch (err) {
      console.error('[Kasbon] NewKastonModal submit failed:', err)
      setError(friendlyError(err, 'kasbon'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{t('kasbon.new_kasbon')}</h2>
          <button onClick={onClose} style={s.closeBtn}>
            <X size={18}/>
          </button>
        </div>

        <div style={s.modalBody}>
          {error && <div style={s.formError}>{error}</div>}

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.member')} *</label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} style={s.input}>
              <option value="">{t('kasbon.select_placeholder')}</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.amount')} (IDR) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={s.input}
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.due_date')}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={s.input}
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{...s.input, minHeight:60}}
            />
          </div>
        </div>

        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.secondaryBtn}>
            {t('kasbon.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={loading} className="btn btn-primary" style={{flex:1}}>
            {loading ? t('common.saving') : t('kasbon.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Payment modal
function PaymentModal({ record, onClose, onSubmit }) {
  // 幂等 id：開啟視窗時產生一次，連點「儲存」重送同一 id，DB 層只會入帳一次
  const [paymentId] = useState(() => 'KP' + Date.now() + Math.random().toString(36).slice(2, 8))
  const [amount, setAmount] = useState(String(record.balanceDue))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt > record.balanceDue) {
      setError(t('kasbon.invalid_amount'))
      return
    }

    setLoading(true)
    try {
      await onSubmit({ id: paymentId, amount: amt, paymentDate, paymentMethod, referenceNumber, notes })
      setError(null)
    } catch (err) {
      console.error('[Kasbon] PaymentModal submit failed:', err)
      setError(friendlyError(err, 'kasbon'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{t('kasbon.record_payment')}</h2>
          <button onClick={onClose} style={s.closeBtn}>
            <X size={18}/>
          </button>
        </div>

        <div style={s.modalBody}>
          {error && <div style={s.formError}>{error}</div>}

          <div style={s.infoBox}>
            <div>{t('kasbon.member')}: <strong>{record.memberName}</strong></div>
            <div>{t('kasbon.principal')}: <strong>{fmtMoney(record.principalAmount)}</strong></div>
            <div>{t('kasbon.paid')}: <strong>{fmtMoney(record.paidAmount)}</strong></div>
            <div>{t('kasbon.remaining')}: <strong>{fmtMoney(record.balanceDue)}</strong></div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.amount')} (IDR) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={s.input}
              max={record.balanceDue}
            />
            <div style={{fontSize:12, color:'var(--text-tertiary)', marginTop:4}}>
              {t('common.max')}: {fmtMoney(record.balanceDue)}
            </div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.payment_date')} *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              style={s.input}
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.payment_method')} *</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={s.input}>
              <option value="cash">{t('kasbon.cash')}</option>
              <option value="transfer">{t('kasbon.transfer')}</option>
              <option value="check">{t('kasbon.check')}</option>
              <option value="other">{t('kasbon.other')}</option>
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.reference')}</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={t('kasbon.reference_placeholder')}
              style={s.input}
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>{t('kasbon.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{...s.input, minHeight:60}}
            />
          </div>
        </div>

        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.secondaryBtn}>
            {t('kasbon.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={loading} className="btn btn-primary" style={{flex:1}}>
            {loading ? t('common.saving') : t('kasbon.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Styles
const s = {
  root: {
    flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
    background: 'var(--bg-base)',
  },
  header: {
    padding: '20px 24px', background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border-dim)', flexShrink: 0,
  },
  titleSection: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  title: {
    fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0,
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 'var(--r2)',
    marginTop: 12, fontSize: 13,
  },
  tabs: {
    display: 'flex', gap: 0, padding: '0 24px',
    borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-raised)',
    flexShrink: 0,
  },
  tabBtn: {
    padding: '12px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent',
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'all 0.2s',
  },
  content: {
    flex: 1, overflow: 'auto', padding: '20px 24px',
  },
  recordsTab: {
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  filters: {
    display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
    background: 'var(--bg-raised)', border: '1px solid var(--border-dim)',
    borderRadius: 'var(--r2)', flex: 1, minWidth: 200,
    color: 'var(--text-secondary)',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)',
    outline: 'none', fontSize: 13,
  },
  statusFilter: {
    padding: '6px 12px', background: 'var(--bg-raised)', border: '1px solid var(--border-dim)',
    borderRadius: 'var(--r2)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
  },
  clearBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: 'transparent', border: '1px solid var(--border-dim)', borderRadius: 'var(--r2)',
    color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
  },
  table: {
    background: 'var(--bg-raised)', borderRadius: 'var(--r3)',
    border: '1px solid var(--border-dim)',
  },
  tableScroll: {
    overflowX: 'auto',
  },
  tableHeader: {
    display: 'flex', padding: '12px 16px', background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border-dim)', fontSize: 12, fontWeight: 600,
    color: 'var(--text-tertiary)', gap: 12, minWidth: 750, borderRadius: 'var(--r3) var(--r3) 0 0',
  },
  tableBody: {
    display: 'flex', flexDirection: 'column',
  },
  tableRow: {
    display: 'flex', padding: '12px 16px', borderBottom: '1px solid var(--border-dim)',
    alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-primary)', minWidth: 750,
    '&:last-child': { borderBottom: 'none' },
  },
  statusBadge: (status) => ({
    display: 'inline-block', padding: '4px 8px', borderRadius: 'var(--r1)',
    fontSize: 11, fontWeight: 600,
    background: status === 'open' ? 'var(--red-dim)' : status === 'partial' ? 'var(--amber-dim)' : 'var(--green-dim)',
    color: status === 'open' ? 'var(--red)' : status === 'partial' ? 'var(--amber)' : 'var(--green)',
  }),
  noRecords: {
    padding: '40px 24px', textAlign: 'center', color: 'var(--text-tertiary)',
    fontSize: 13,
  },
  reportsTab: {
    display: 'flex', flexDirection: 'column', gap: 24,
  },
  summaryCards: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  },
  summaryCard: {
    padding: '16px', background: 'var(--bg-raised)', borderRadius: 'var(--r3)',
    border: '1px solid var(--border-dim)',
  },
  summaryLabel: {
    fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: 8,
  },
  summaryValue: {
    fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
  },
  agingBuckets: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  },
  agingBucket: {
    background: 'var(--bg-raised)', borderRadius: 'var(--r3)',
    border: '1px solid var(--border-dim)', overflow: 'hidden',
  },
  bucketTitle: {
    padding: '12px 16px', borderBottom: '1px solid var(--border-dim)',
    fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text-primary)',
  },
  bucketTable: {
    display: 'flex', flexDirection: 'column',
  },
  bucketRow: {
    display: 'flex', padding: '10px 16px', borderBottom: '1px solid var(--border-dim)',
    gap: 12, fontSize: 12, alignItems: 'center',
    '&:last-child': { borderBottom: 'none' },
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(44,42,38,0.4)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--bg-raised)', borderRadius: 'var(--r4)',
    border: '1px solid var(--border-dim)', boxShadow: 'var(--shadow-lg)',
    maxWidth: 420, width: '90%', maxHeight: '90vh', overflow: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid var(--border-dim)',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-secondary)',
    cursor: 'pointer', padding: 4, display: 'flex',
  },
  modalBody: {
    flex: 1, padding: '20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
  },
  formError: {
    padding: '8px 12px', background: 'var(--red-dim)', color: 'var(--red)',
    borderRadius: 'var(--r2)', fontSize: 12,
  },
  formGroup: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  label: {
    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
  },
  input: {
    padding: '8px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-dim)',
    borderRadius: 'var(--r2)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
    fontFamily: 'inherit',
  },
  infoBox: {
    padding: '12px', background: 'var(--bg-base)', borderRadius: 'var(--r2)',
    border: '1px solid var(--border-dim)', fontSize: 12, color: 'var(--text-secondary)',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  modalFooter: {
    display: 'flex', gap: 8, padding: '16px 20px',
    borderTop: '1px solid var(--border-dim)', flexShrink: 0,
  },
  secondaryBtn: {
    flex: 1, padding: '8px 12px', background: 'var(--bg-base)', color: 'var(--text-primary)',
    border: '1px solid var(--border-dim)', borderRadius: 'var(--r2)', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
}
