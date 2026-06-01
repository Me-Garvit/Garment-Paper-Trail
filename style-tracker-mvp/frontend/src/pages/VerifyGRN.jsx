import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGRN, verifyGRN } from '../api/client'

const UOM_OPTIONS = ['CONE', 'BOX', 'GRS', 'PCS', 'MTR', 'KG', 'SET', 'ROLL']

export default function VerifyGRN() {
  const { styleNumber, supplierId, poId, grnId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [draft, setDraft] = useState(null)
  const [header, setHeader] = useState({ grn_number: '', challan_no: '', challan_date: '', vehicle_no: '', supplier_name: '' })
  const [lineItems, setLineItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getGRN(decoded, supplierId, poId, grnId)
      .then(d => {
        setDraft(d)
        const meta = d.metadata_ || {}
        setHeader({
          grn_number: d.grn_number || '',
          challan_no: meta.challan_no || '',
          challan_date: meta.challan_date || '',
          vehicle_no: meta.vehicle_no || '',
          supplier_name: meta.supplier_name || '',
        })
        const items = Array.isArray(meta.line_items) ? meta.line_items : []
        // Normalise: map expected_challan_qty → incoming_qty for the edit grid (backward compat)
        const normalised = items.map(item => ({
          ...item,
          incoming_qty: item.incoming_qty ?? item.expected_challan_qty ?? '',
          uom: item.uom ?? item.unit ?? 'PCS',
        }))
        setLineItems(normalised.length > 0 ? normalised : [{ item_name: '', incoming_qty: '', uom: 'PCS' }])
      })
      .catch(() => setError('Failed to load GRN.'))
  }, [decoded, supplierId, poId, grnId])

  const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }))

  const setItem = (i, k, v) =>
    setLineItems(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))

  const addRow = () => setLineItems(rows => [...rows, { item_name: '', incoming_qty: '', uom: 'PCS' }])

  const removeRow = (i) => setLineItems(rows => rows.filter((_, idx) => idx !== i))

  const totalQty = lineItems.reduce((acc, r) => acc + (parseFloat(r.incoming_qty) || 0), 0)

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const items = lineItems.map(r => ({
        item_name: r.item_name || null,
        incoming_qty: r.incoming_qty !== '' ? parseFloat(r.incoming_qty) : null,
        uom: r.uom || null,
      }))
      await verifyGRN(decoded, supplierId, poId, grnId, {
        grn_number: header.grn_number || null,
        challan_no: header.challan_no || null,
        challan_date: header.challan_date || null,
        vehicle_no: header.vehicle_no || null,
        supplier_name: header.supplier_name || null,
        line_items: items,
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

  const isVerified = draft.metadata_?.verification_status === 'VERIFIED'

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
        <span className="text-sm font-medium text-gray-700">Verify GRN</span>
        <span className="ml-auto">
          {isVerified
            ? <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">VERIFIED</span>
            : <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">PENDING VERIFICATION</span>
          }
        </span>
      </header>

      {/* Split screen */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Left — editable form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">GRN / Delivery Challan</h2>
            <p className="text-xs text-gray-400 mt-1">Review AI-extracted data against the document. Edit and confirm.</p>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="GRN Number" required>
                <input value={header.grn_number} onChange={e => setH('grn_number', e.target.value)} className="input font-mono" placeholder="e.g. GRN-001" />
              </Field>
              <Field label="Challan Number">
                <input value={header.challan_no} onChange={e => setH('challan_no', e.target.value)} className="input font-mono" />
              </Field>
              <Field label="Challan Date">
                <input type="date" value={header.challan_date} onChange={e => setH('challan_date', e.target.value)} className="input" />
              </Field>
              <Field label="Vehicle No.">
                <input value={header.vehicle_no} onChange={e => setH('vehicle_no', e.target.value)} className="input" placeholder="e.g. DL01AB1234" />
              </Field>
              <Field label="Supplier Name" className="col-span-2">
                <input value={header.supplier_name} onChange={e => setH('supplier_name', e.target.value)} className="input" />
              </Field>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">
                  Line Items
                  {totalQty > 0 && (
                    <span className="ml-2 text-gray-400 font-normal">
                      Total: <span className="text-indigo-600 font-semibold">{totalQty.toLocaleString('en-IN')}</span>
                    </span>
                  )}
                </p>
                <button
                  onClick={addRow}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Row
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_80px_32px] bg-gray-50 border-b border-gray-200 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium">
                  <span>Item Name</span>
                  <span className="text-right">Qty</span>
                  <span className="text-center">UOM</span>
                  <span />
                </div>

                {lineItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] items-center px-2 py-1.5 border-b border-gray-100 last:border-0 gap-1">
                    <input
                      value={item.item_name || ''}
                      onChange={e => setItem(i, 'item_name', e.target.value)}
                      placeholder="Item description"
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 w-full"
                    />
                    <input
                      type="number"
                      value={item.incoming_qty ?? ''}
                      onChange={e => setItem(i, 'incoming_qty', e.target.value)}
                      placeholder="0"
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-right w-full"
                    />
                    <select
                      value={item.uom || 'PCS'}
                      onChange={e => setItem(i, 'uom', e.target.value)}
                      className="text-xs px-1 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-center w-full"
                    >
                      {UOM_OPTIONS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <button
                      onClick={() => removeRow(i)}
                      disabled={lineItems.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-20 text-sm leading-none transition"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Total row */}
                <div className="grid grid-cols-[1fr_80px_80px_32px] px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs font-semibold text-gray-700">
                  <span className="text-gray-400 font-normal">Total Received Qty</span>
                  <span className="text-right text-indigo-700">{totalQty.toLocaleString('en-IN')}</span>
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-5 border-t border-gray-100 flex gap-3 shrink-0">
            <button
              onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Save as Draft
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !header.grn_number}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : isVerified ? 'Update GRN' : 'Confirm & Save GRN'}
            </button>
          </div>
        </div>

        {/* Right — PDF / image viewer */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0">
            Original Document
          </div>
          {draft.document_url ? (
            <iframe
              src={draft.document_url}
              className="flex-1 w-full border-0"
              title="GRN document"
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
