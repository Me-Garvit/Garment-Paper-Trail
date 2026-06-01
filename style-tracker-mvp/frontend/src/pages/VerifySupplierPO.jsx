import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSupplierPO, verifySupplierPO } from '../api/client'

const MATERIAL_CATEGORIES = ['FABRIC', 'BUTTONS', 'THREAD', 'PACKING', 'LABELS']

export default function VerifySupplierPO() {
  const { styleNumber, supplierId, poId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSupplierPO(decoded, supplierId, poId)
      .then(d => {
        setDraft(d)
        setForm({
          supplier_name: d.supplier_name,
          supplier_po_number: d.supplier_po_number,
          material_category: d.material_category,
          agreed_rate: d.agreed_rate ?? '',
          ordered_quantity: d.ordered_quantity ?? '',
        })
      })
      .catch(() => setError('Failed to load Supplier PO.'))
  }, [decoded, supplierId, poId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await verifySupplierPO(decoded, supplierId, poId, {
        supplier_name: form.supplier_name,
        supplier_po_number: form.supplier_po_number,
        material_category: form.material_category,
        agreed_rate: form.agreed_rate !== '' ? Number(form.agreed_rate) : null,
        ordered_quantity: form.ordered_quantity !== '' ? Number(form.ordered_quantity) : null,
      })
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Save failed')
      setSaving(false)
    }
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        {error ?? 'Loading…'}
      </div>
    )
  }

  const meta = draft.metadata_ || {}
  const lineItems = meta.line_items || []
  const hsnCodes = meta.hsn_codes || []
  const extraCards = Object.entries({ ...meta, ...(meta.extra_fields || {}) })
    .filter(([k, v]) => !['file_url', 'is_draft', 'verification_status', 'line_items', 'hsn_codes', 'extra_fields'].includes(k)
      && v !== null && v !== undefined && v !== '' && !Array.isArray(v) && typeof v !== 'object')

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
          className="text-gray-400 hover:text-gray-700 text-sm"
        >
          ← Supplier Room
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">Verify Supplier PO</span>
        <span className="ml-auto">
          {meta.verification_status === 'VERIFIED'
            ? <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">VERIFIED</span>
            : <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">PENDING VERIFICATION</span>
          }
        </span>
      </header>

      {/* Split screen */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Left — editable form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">AI Extracted Data</h2>
            <p className="text-xs text-gray-400 mt-1">Review against the original PO document. Correct any misreads, then confirm.</p>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            <Field label="Supplier Name" required>
              <input value={form.supplier_name || ''} onChange={e => set('supplier_name', e.target.value)} className="input" />
            </Field>

            <Field label="PO Number" required>
              <input value={form.supplier_po_number || ''} onChange={e => set('supplier_po_number', e.target.value)} className="input font-mono" />
            </Field>

            <Field label="Material Category" required>
              <select value={form.material_category || 'FABRIC'} onChange={e => set('material_category', e.target.value)} className="input">
                {MATERIAL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Agreed Rate (₹/unit)">
                <input type="number" value={form.agreed_rate} onChange={e => set('agreed_rate', e.target.value)} className="input" />
              </Field>
              <Field label="Ordered Quantity">
                <input type="number" value={form.ordered_quantity} onChange={e => set('ordered_quantity', e.target.value)} className="input" />
              </Field>
            </div>

            {/* HSN Codes */}
            {hsnCodes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">HSN Codes</p>
                <div className="flex flex-wrap gap-1.5">
                  {hsnCodes.map((code, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">{code}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Line Items */}
            {lineItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Line Items ({lineItems.length})</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">Item</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">Rate</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 text-gray-700">
                            {item.item_name || item.description || `Item ${i + 1}`}
                            {item.hsn_code && <span className="ml-1 text-gray-400">({item.hsn_code})</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">{item.quantity ?? '—'} {item.uom || ''}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{item.rate != null ? `₹${item.rate}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-700 font-medium">
                            {item.taxable_value != null ? `₹${Number(item.taxable_value).toLocaleString('en-IN')}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Extra metadata cards */}
            {extraCards.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Additional Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {extraCards.map(([k, v]) => (
                    <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-gray-700 font-medium truncate" title={String(v)}>{String(v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Save as Draft
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !form.supplier_name || !form.supplier_po_number}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>

        {/* Right — PDF viewer */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700">
            Original Document
          </div>
          {draft.document_url ? (
            <iframe
              src={draft.document_url}
              className="flex-1 w-full"
              title="Supplier PO document"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              No document preview available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
