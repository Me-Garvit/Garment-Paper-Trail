import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSupplierInvoice, listSupplierPOs, verifyInvoice, uploadInvoice } from '../api/client'
import UploadModal from '../components/UploadModal'
import DiscrepancyFlags from '../components/DiscrepancyFlags'
import { VerificationBadge } from '../components/StatusBadge'

const UOM_OPTIONS = ['GRS', 'CONE', 'BOX', 'MTR', 'PCS', 'KG', 'YDS', 'SET', 'ROLL', 'NOS', 'LTR']

export default function VerifyInvoice() {
  const { styleNumber, supplierId, invoiceId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [invoice, setInvoice] = useState(null)
  const [pos, setPOs] = useState([])
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
      const newInv = await uploadInvoice(decoded, supplierId, file)
      setShowReupload(false)
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/invoices/${newInv.id}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Re-upload failed')
    } finally {
      setReplacingDoc(false)
    }
  }

  useEffect(() => {
    getSupplierInvoice(decoded, supplierId, invoiceId)
      .then(inv => {
        setInvoice(inv)
        setForm({
          invoice_number: inv.invoice_number,
          taxable_value: inv.taxable_value ?? '',
          invoice_rate: inv.invoice_rate ?? '',
          invoice_quantity: inv.invoice_quantity ?? '',
          supplier_po_id: inv.supplier_po_id || '',
        })
        // Normalise line items: accept old (quantity/uom) and new (qty_value/qty_unit) shapes
        const raw = inv.metadata_?.line_items || []
        setLineItems(raw.map(item => ({
          item_name: item.item_name || item.description || '',
          hsn_code: item.hsn_code || '',
          qty_value: String(item.qty_value ?? item.quantity ?? ''),
          qty_unit: item.qty_unit ?? item.uom ?? '',
          rate: String(item.rate ?? item.invoice_rate ?? ''),
        })))
      })
      .catch(() => setError('Failed to load invoice'))

    listSupplierPOs(decoded, supplierId).then(setPOs).catch(() => {})
  }, [decoded, supplierId, invoiceId])

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

  // When line items have computable totals, auto-sync taxable_value
  const computedTaxable = totalLineValue > 0 ? totalLineValue.toFixed(2) : null

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const existingMeta = invoice.metadata_ || {}
      const cleanedItems = lineItems.map(item => ({
        item_name: item.item_name || null,
        hsn_code: item.hsn_code || null,
        qty_value: item.qty_value !== '' ? parseFloat(item.qty_value) : null,
        qty_unit: item.qty_unit || null,
        rate: item.rate !== '' ? parseFloat(item.rate) : null,
        taxable_value: rowValue(item),
      }))

      // Use line-item computed total as taxable_value if available, else use form value
      const finalTaxableValue = computedTaxable !== null
        ? Number(computedTaxable)
        : (form.taxable_value !== '' ? Number(form.taxable_value) : null)

      await verifyInvoice(decoded, supplierId, invoiceId, {
        invoice_number: form.invoice_number,
        taxable_value: finalTaxableValue,
        invoice_rate: form.invoice_rate !== '' ? Number(form.invoice_rate) : null,
        invoice_quantity: form.invoice_quantity !== '' ? Number(form.invoice_quantity) : null,
        supplier_po_id: form.supplier_po_id !== '' ? Number(form.supplier_po_id) : null,
        metadata_: { ...existingMeta, line_items: cleanedItems },
      })
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Save failed')
      setSaving(false)
    }
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        {error ?? 'Loading…'}
      </div>
    )
  }

  const meta = invoice.metadata_ || {}
  const extraCards = Object.entries({ ...meta, ...(meta.extra_fields || {}) })
    .filter(([k, v]) =>
      !['file_url', 'is_draft', 'verification_status', 'line_items', 'extra_fields',
        'sub_buyer_name', 'size_breakdown'].includes(k)
      && v !== null && v !== undefined && v !== ''
      && !Array.isArray(v) && typeof v !== 'object'
    )

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
          className="text-gray-400 hover:text-gray-700 text-sm"
        >
          ← Supplier Room
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">Verify Invoice</span>
        <span className="ml-2">
          <VerificationBadge status={invoice.verification_status} />
        </span>
        {invoice.discrepancy_flags?.length > 0 && (
          <span className="ml-2">
            <DiscrepancyFlags flags={invoice.discrepancy_flags} />
          </span>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Left — form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Invoice Details</h2>
            <p className="text-xs text-gray-400 mt-1">
              Style <span className="font-mono text-indigo-600">{decoded}</span> · Supplier #{supplierId}
            </p>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            <Field label="Invoice Number" required>
              <input value={form.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} className="input" />
            </Field>

            <Field label="Link to Supplier PO">
              <select value={form.supplier_po_id} onChange={e => set('supplier_po_id', e.target.value)} className="input">
                <option value="">— Select PO —</option>
                {pos.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.supplier_po_number} ({po.material_category})
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice Rate (₹/unit)">
                <input type="number" value={form.invoice_rate} onChange={e => set('invoice_rate', e.target.value)} className="input" />
              </Field>
              <Field label="Invoice Quantity">
                <input type="number" value={form.invoice_quantity} onChange={e => set('invoice_quantity', e.target.value)} className="input" />
              </Field>
            </div>

            <Field label="Taxable Value (₹)" required>
              <div className="relative">
                <input
                  type="number"
                  value={computedTaxable !== null ? computedTaxable : form.taxable_value}
                  onChange={e => {
                    // Only allow manual override when no line items compute a total
                    if (computedTaxable === null) set('taxable_value', e.target.value)
                  }}
                  readOnly={computedTaxable !== null}
                  className={`input ${computedTaxable !== null ? 'bg-indigo-50 text-indigo-700 font-semibold cursor-default' : ''}`}
                />
                {computedTaxable !== null && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-indigo-400 font-medium">
                    auto
                  </span>
                )}
              </div>
            </Field>

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

            {/* 3-way match preview */}
            {form.supplier_po_id && form.invoice_rate && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs font-medium text-amber-800 mb-2">3-Way Match Preview</p>
                <p className="text-xs text-amber-700">
                  Saving will run: PO agreed rate × cumulative GRN qty vs. invoice values.
                  Any mismatches will generate discrepancy flags automatically.
                </p>
              </div>
            )}

            {/* Extra AI metadata */}
            {extraCards.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">AI-Extracted Additional Fields</p>
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
              Keep as Draft
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !form.invoice_number}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving & Matching…' : 'Confirm & Run 3-Way Match'}
            </button>
          </div>
        </div>

        {/* Right — PDF viewer */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0 flex items-center justify-between">
            <span>Original Invoice Document</span>
            <button onClick={() => setShowReupload(true)} className="text-gray-500 hover:text-white text-[10px] font-medium transition">
              ↑ Replace
            </button>
          </div>
          {invoice.document_url ? (
            <iframe
              src={invoice.document_url}
              className="flex-1 w-full border-0"
              title="Invoice document"
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
          title="Replace Invoice Document"
          description="Upload the correct invoice. AI will re-parse and open a fresh verify page."
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
