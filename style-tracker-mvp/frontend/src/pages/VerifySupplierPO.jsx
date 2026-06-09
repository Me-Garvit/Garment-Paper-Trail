import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSupplierPO, verifySupplierPO, uploadSupplierPO } from '../api/client'
import UploadModal from '../components/UploadModal'

const MATERIAL_CATEGORIES = ['FABRIC', 'BUTTONS', 'THREAD', 'PACKING', 'LABELS']
const UOM_OPTIONS = ['GRS', 'CONE', 'BOX', 'MTR', 'PCS', 'KG', 'YDS', 'SET', 'ROLL', 'NOS', 'LTR']

export default function VerifySupplierPO() {
  const { styleNumber, supplierId, poId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState({})
  // Each item: { item_name, hsn_code, qty_value (string), qty_unit (string), rate (string) }
  const [lineItems, setLineItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showReupload, setShowReupload] = useState(false)
  const [replacingDoc, setReplacingDoc] = useState(false)

  const handleReplaceDoc = async (file) => {
    setReplacingDoc(true)
    try {
      const newPO = await uploadSupplierPO(decoded, supplierId, file)
      setShowReupload(false)
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${newPO.id}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Re-upload failed')
    } finally {
      setReplacingDoc(false)
    }
  }

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
        // Normalise existing items: accept both old (quantity/uom) and new (qty_value/qty_unit) shapes
        const raw = d.metadata_?.line_items || []
        setLineItems(raw.map(item => ({
          item_name: item.item_name || item.description || '',
          hsn_code: item.hsn_code || '',
          qty_value: String(item.qty_value ?? item.quantity ?? ''),
          qty_unit: item.qty_unit ?? item.uom ?? '',
          rate: String(item.rate ?? ''),
        })))
      })
      .catch(() => setError('Failed to load Supplier PO.'))
  }, [decoded, supplierId, poId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const setLineItem = (idx, field, value) =>
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  // Live value computation per row
  const rowValue = (item) => {
    const qty = parseFloat(item.qty_value)
    const rate = parseFloat(item.rate)
    return !isNaN(qty) && !isNaN(rate) ? qty * rate : null
  }

  const totalLineValue = lineItems.reduce((acc, item) => {
    const v = rowValue(item)
    return v !== null ? acc + v : acc
  }, 0)

  const hasLineItems = lineItems.length > 0
  const computedQty = lineItems.reduce((acc, item) => acc + (parseFloat(item.qty_value) || 0), 0)
  const showAutoQty = hasLineItems && computedQty > 0
  const displayQty = showAutoQty ? computedQty : (form.ordered_quantity ?? '')

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const existingMeta = draft.metadata_ || {}
      const cleanedItems = lineItems.map(item => ({
        item_name: item.item_name || null,
        hsn_code: item.hsn_code || null,
        qty_value: item.qty_value !== '' ? parseFloat(item.qty_value) : null,
        qty_unit: item.qty_unit || null,
        rate: item.rate !== '' ? parseFloat(item.rate) : null,
        taxable_value: rowValue(item),
      }))
      const finalQty = showAutoQty ? computedQty : (form.ordered_quantity !== '' ? Number(form.ordered_quantity) : null)
      await verifySupplierPO(decoded, supplierId, poId, {
        supplier_name: form.supplier_name,
        supplier_po_number: form.supplier_po_number,
        material_category: form.material_category,
        agreed_rate: null,
        ordered_quantity: finalQty,
        metadata_: { ...existingMeta, line_items: cleanedItems },
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
  const hsnCodes = meta.hsn_codes || []
  const extraCards = Object.entries({ ...meta, ...(meta.extra_fields || {}) })
    .filter(([k, v]) =>
      !['file_url', 'is_draft', 'verification_status', 'line_items', 'hsn_codes', 'extra_fields'].includes(k)
      && v !== null && v !== undefined && v !== ''
      && !Array.isArray(v) && typeof v !== 'object'
    )

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
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

            <Field label={showAutoQty ? "Ordered Quantity (Auto)" : "Ordered Quantity"}>
              <input
                type="number"
                value={displayQty}
                onChange={e => set('ordered_quantity', e.target.value)}
                className="input"
                readOnly={showAutoQty}
                disabled={showAutoQty}
              />
            </Field>

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

            {/* ── Line Items ──────────────────────────────────────────── */}
            {hasLineItems && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500">
                    Line Items ({lineItems.length})
                    {totalLineValue > 0 && (
                      <span className="ml-2 text-gray-400 font-normal">
                        Total:{' '}
                        <span className="text-indigo-600 font-semibold">
                          ₹{totalLineValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </span>
                    )}
                  </p>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_72px_72px_72px_80px] bg-gray-50 border-b border-gray-200 px-2 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium gap-1.5">
                    <span>Item</span>
                    <span className="text-right">Qty</span>
                    <span className="text-center">Unit</span>
                    <span className="text-right">Rate ₹</span>
                    <span className="text-right">Value ₹</span>
                  </div>

                  {lineItems.map((item, idx) => {
                    const val = rowValue(item)
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_72px_72px_72px_80px] items-center px-2 py-1.5 border-b border-gray-100 last:border-0 gap-1.5"
                      >
                        {/* Item name + HSN */}
                        <div className="min-w-0">
                          <p className="text-xs text-gray-800 truncate leading-tight">
                            {item.item_name || `Item ${idx + 1}`}
                          </p>
                          {item.hsn_code && (
                            <p className="text-[10px] text-gray-400 font-mono">{item.hsn_code}</p>
                          )}
                        </div>

                        {/* Qty — editable number */}
                        <input
                          type="number"
                          min="0"
                          value={item.qty_value}
                          onChange={e => setLineItem(idx, 'qty_value', e.target.value)}
                          className="text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-right w-full font-mono"
                        />

                        {/* Unit — select dropdown */}
                        <select
                          value={item.qty_unit || ''}
                          onChange={e => setLineItem(idx, 'qty_unit', e.target.value)}
                          className="text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-center w-full"
                        >
                          <option value="">—</option>
                          {UOM_OPTIONS.map(u => <option key={u}>{u}</option>)}
                          {item.qty_unit && !UOM_OPTIONS.includes(item.qty_unit) && (
                            <option value={item.qty_unit}>{item.qty_unit}</option>
                          )}
                        </select>

                        {/* Rate — editable number */}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={e => setLineItem(idx, 'rate', e.target.value)}
                          className="text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-right w-full font-mono"
                        />

                        {/* Value — live computed, read-only */}
                        <p className={`text-xs text-right font-mono pr-0.5 ${val !== null ? 'text-gray-800 font-medium' : 'text-gray-300'}`}>
                          {val !== null ? val.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                        </p>
                      </div>
                    )
                  })}

                  {/* Summary footer */}
                  <div className="grid grid-cols-[1fr_72px_72px_72px_80px] items-center px-2 py-2 bg-indigo-50 border-t border-indigo-100 gap-1.5">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Total</span>
                    <span className="text-xs text-right font-mono text-gray-700 font-semibold">
                      {lineItems.reduce((acc, i) => acc + (parseFloat(i.qty_value) || 0), 0).toLocaleString('en-IN')}
                    </span>
                    <span />
                    <span />
                    <span className="text-xs text-right font-mono text-indigo-700 font-bold">
                      {totalLineValue > 0
                        ? `₹${totalLineValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </span>
                  </div>
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

          <div className="p-6 border-t border-gray-100 flex gap-3 shrink-0">
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
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0 flex items-center justify-between">
            <span>Original Document</span>
            <button onClick={() => setShowReupload(true)} className="text-gray-500 hover:text-white text-[10px] font-medium transition">
              ↑ Replace
            </button>
          </div>
          {draft.document_url ? (
            <iframe
              src={draft.document_url}
              className="flex-1 w-full border-0"
              title="Supplier PO document"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              No document preview available
            </div>
          )}
        </div>
      </div>

      {showReupload && (
        <UploadModal
          title="Replace Supplier PO Document"
          description="Upload the correct Supplier PO. AI will re-parse and open a fresh verify page."
          onUpload={handleReplaceDoc}
          onClose={() => setShowReupload(false)}
          loading={replacingDoc}
        />
      )}
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
