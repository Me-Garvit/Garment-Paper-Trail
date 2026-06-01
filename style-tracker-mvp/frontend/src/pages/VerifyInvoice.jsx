import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSupplierInvoice, listSupplierPOs, verifyInvoice } from '../api/client'
import DiscrepancyFlags from '../components/DiscrepancyFlags'
import { VerificationBadge } from '../components/StatusBadge'

export default function VerifyInvoice() {
  const { styleNumber, supplierId, invoiceId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [invoice, setInvoice] = useState(null)
  const [pos, setPOs] = useState([])
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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
      })
      .catch(() => setError('Failed to load invoice'))

    listSupplierPOs(decoded, supplierId).then(setPOs).catch(() => {})
  }, [decoded, supplierId, invoiceId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await verifyInvoice(decoded, supplierId, invoiceId, {
        invoice_number: form.invoice_number,
        taxable_value: form.taxable_value !== '' ? Number(form.taxable_value) : null,
        invoice_rate: form.invoice_rate !== '' ? Number(form.invoice_rate) : null,
        invoice_quantity: form.invoice_quantity !== '' ? Number(form.invoice_quantity) : null,
        supplier_po_id: form.supplier_po_id !== '' ? Number(form.supplier_po_id) : null,
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
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
              <input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} className="input" />
            </Field>

            <Field label="Link to Supplier PO">
              <select
                value={form.supplier_po_id}
                onChange={e => set('supplier_po_id', e.target.value)}
                className="input"
              >
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
              <input type="number" value={form.taxable_value} onChange={e => set('taxable_value', e.target.value)} className="input" />
            </Field>

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

            {/* AI metadata */}
            {invoice.metadata_ && Object.keys(invoice.metadata_).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">AI-Extracted Additional Fields</p>
                <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(invoice.metadata_, null, 2)}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100 flex gap-3">
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
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700">
            Original Invoice Document
          </div>
          {invoice.document_url ? (
            <iframe
              src={invoice.document_url}
              className="flex-1 w-full"
              title="Invoice document"
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
