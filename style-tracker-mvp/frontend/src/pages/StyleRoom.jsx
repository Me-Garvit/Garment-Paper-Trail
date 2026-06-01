import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCase, getFinancials, listSuppliers, createSupplier, updateLifecycle } from '../api/client'
import { LifecycleBadge, VerificationBadge } from '../components/StatusBadge'
import DocumentPanel from '../components/DocumentPanel'

const LIFECYCLE_STEPS = ['INITIATED', 'PRODUCTION_READY', 'SHIPPED', 'CLOSED']

export default function StyleRoom() {
  const { styleNumber } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [caseData, setCaseData] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [error, setError] = useState(null)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [docPanel, setDocPanel] = useState({ open: false, url: null, loading: false, title: '' })

  const openDocPanel = async (fetchFn, title) => {
    setDocPanel({ open: true, url: null, loading: true, title })
    try {
      const data = await fetchFn()
      setDocPanel(p => ({ ...p, loading: false, url: data.document_url || null }))
    } catch {
      setDocPanel(p => ({ ...p, loading: false }))
    }
  }

  const load = () => {
    Promise.all([
      getCase(decoded),
      getFinancials(decoded).catch(() => null),
      listSuppliers(decoded).catch(() => []),
    ]).then(([c, f, s]) => {
      setCaseData(c)
      setFinancials(f)
      setSuppliers(s)
    }).catch(() => setError('Failed to load style room.'))
  }

  useEffect(() => { load() }, [decoded])

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return
    setAddingSupplier(true)
    try {
      await createSupplier(decoded, { name: newSupplierName.trim() })
      setNewSupplierName('')
      setShowAddSupplier(false)
      load()
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to add supplier')
    } finally {
      setAddingSupplier(false)
    }
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        {error ?? 'Loading…'}
      </div>
    )
  }

  const profitColor = financials?.net_profit_pct == null
    ? 'text-gray-400'
    : financials.net_profit_pct >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700 text-sm">
              ← Dashboard
            </button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm font-semibold text-indigo-700">{decoded}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{caseData.buyer_name}</h1>
              <p className="text-xs text-gray-400 mt-0.5">Master Style Suite</p>
            </div>
            <div className="flex items-center gap-3">
              <VerificationBadge status={caseData.verification_status} />
              <LifecycleBadge status={caseData.lifecycle_status} />
              {caseData.is_draft && (
                <button
                  onClick={() => navigate(`/cases/${styleNumber}/verify`)}
                  className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg font-medium hover:bg-orange-200 transition"
                >
                  Complete Verification →
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Order Qty" value={caseData.total_order_quantity?.toLocaleString() ?? '—'} unit="pcs" />
          <StatCard
            label="Total Order Value"
            value={caseData.total_order_value != null
              ? `₹${Number(caseData.total_order_value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
              : '—'}
          />
          <StatCard
            label="Live Expenses"
            value={financials ? `₹${financials.total_expenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
          />
          <StatCard
            label="Net Profit Margin"
            value={financials?.net_profit_pct != null ? `${financials.net_profit_pct}%` : '—'}
            valueClass={profitColor}
          />
        </div>

        {/* Lifecycle stepper */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Lifecycle Stage</p>
          <div className="flex items-center gap-0">
            {LIFECYCLE_STEPS.map((step, i) => {
              const current = caseData.lifecycle_status === step
              const passed = LIFECYCLE_STEPS.indexOf(caseData.lifecycle_status) > i
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center flex-1 ${i > 0 ? '' : ''}`}>
                    {i > 0 && (
                      <div className={`h-px flex-1 mb-1 ${passed || current ? 'bg-indigo-300' : 'bg-gray-200'}`} style={{ width: '100%', display: 'block', marginBottom: 0 }} />
                    )}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      current ? 'bg-indigo-600 text-white shadow-sm' :
                      passed ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {passed && <span>✓</span>}
                      {step.replace(/_/g, ' ')}
                    </div>
                  </div>
                  {i < LIFECYCLE_STEPS.length - 1 && (
                    <div className={`h-px w-6 mx-1 ${passed ? 'bg-indigo-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Buyer PO details + Size breakdown side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* PO details card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Buyer PO Details</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Style Number" value={caseData.style_number} mono />
              <Detail label="Buyer" value={caseData.buyer_name} />
              {caseData.metadata_?.sub_buyer_name && (
                <Detail label="Sub-Buyer / Agent" value={caseData.metadata_.sub_buyer_name} />
              )}
              <Detail label="File" value={caseData.file_url ? (
                <button
                  onClick={() => openDocPanel(() => getCase(decoded), `Buyer PO — ${caseData.style_number}`)}
                  className="text-indigo-600 hover:underline text-xs"
                >
                  View Document ↗
                </button>
              ) : '—'} />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => openDocPanel(() => getCase(decoded), `Buyer PO — ${caseData.style_number}`)}
                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                View PDF
              </button>
              <button
                onClick={() => navigate(`/cases/${styleNumber}/verify`)}
                className="px-3 py-1.5 text-xs border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition"
              >
                Edit PO Details
              </button>
            </div>
          </div>

          {/* Size breakdown card */}
          <SizeBreakdownCard
            breakdown={caseData.metadata_?.size_breakdown}
            totalQty={caseData.total_order_quantity}
          />
        </div>

        {/* Supplier Rooms */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Procurement Zone</p>
              <p className="text-xs text-gray-400 mt-0.5">Supplier rooms for this style</p>
            </div>
            <button
              onClick={() => setShowAddSupplier(v => !v)}
              className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition"
            >
              + Add Supplier Room
            </button>
          </div>

          {showAddSupplier && (
            <div className="p-4 border-b border-gray-100 bg-indigo-50/40 flex gap-3">
              <input
                value={newSupplierName}
                onChange={e => setNewSupplierName(e.target.value)}
                placeholder="Supplier name (e.g. Khanna Fabrics)"
                className="input flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAddSupplier()}
              />
              <button
                onClick={handleAddSupplier}
                disabled={addingSupplier || !newSupplierName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {addingSupplier ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => setShowAddSupplier(false)}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}

          {suppliers.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No supplier rooms yet. Add a supplier to start tracking procurement.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {suppliers.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/cases/${styleNumber}/suppliers/${s.id}`)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-indigo-50/40 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                      {s.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Supplier Room</p>
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <DocumentPanel
        isOpen={docPanel.open}
        onClose={() => setDocPanel(p => ({ ...p, open: false }))}
        url={docPanel.url}
        title={docPanel.title}
        loading={docPanel.loading}
      />
    </div>
  )
}

function StatCard({ label, value, unit, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass}`}>
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
    </div>
  )
}

function SizeBreakdownCard({ breakdown, totalQty }) {
  const hasBreakdown = breakdown && typeof breakdown === 'object' && Object.keys(breakdown).length > 0
  const total = hasBreakdown
    ? Object.values(breakdown).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : totalQty

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
        Size-wise Order Breakdown
      </p>

      {hasBreakdown ? (
        <>
          <div className="space-y-1.5">
            {Object.entries(breakdown).map(([size, qty]) => {
              const pct = total > 0 ? ((Number(qty) / total) * 100).toFixed(1) : 0
              return (
                <div key={size} className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-indigo-50 text-indigo-700 text-xs font-bold shrink-0">
                    {size}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-700 w-12 text-right shrink-0">
                    {Number(qty).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>

          {/* Total footer */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Total Order Qty</span>
            <span className="text-base font-bold text-indigo-700 font-mono">
              {Number(total).toLocaleString('en-IN')}
              <span className="text-xs font-normal text-gray-400 ml-1">pcs</span>
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-gray-400">No size breakdown on file.</p>
          {totalQty && (
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Total: {Number(totalQty).toLocaleString('en-IN')} pcs
            </p>
          )}
        </div>
      )}
    </div>
  )
}
