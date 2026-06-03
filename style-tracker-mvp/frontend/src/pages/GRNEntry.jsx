// Screen 2 of 3 — Actual GRN Entry
// Confirmed challan items are locked. Storekeeper enters actual received quantities.
// On save → navigates to /debit-note if discrepancy, else back to Supplier Room.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGRN, verifyGRN } from '../api/client'

export default function GRNEntry() {
  const { styleNumber, supplierId, poId, grnId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [grn, setGrn] = useState(null)
  const [lineItems, setLineItems] = useState([])   // { ...challan fields, actual_received_qty: '' }
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getGRN(decoded, supplierId, poId, grnId)
      .then(d => {
        setGrn(d)
        const meta = d.metadata_ || {}
        const raw = Array.isArray(meta.line_items) ? meta.line_items : []
        // Default actual = challan qty so operator only edits rows with shortages
        setLineItems(raw.map(r => ({
          ...r,
          actual_received_qty: String(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? ''),
        })))
      })
      .catch(() => setError('Failed to load GRN.'))
  }, [decoded, supplierId, poId, grnId])

  const setActual = (i, val) =>
    setLineItems(rows => rows.map((r, idx) => idx === i ? { ...r, actual_received_qty: val } : r))

  const variance = (r) => {
    const challan = Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? 0)
    const actual = Number(r.actual_received_qty)
    if (isNaN(actual) || r.actual_received_qty === '') return null
    return actual - challan
  }

  const challanTotal = lineItems.reduce((acc, r) => acc + (Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty) || 0), 0)
  const actualTotal = lineItems.reduce((acc, r) => acc + (Number(r.actual_received_qty) || 0), 0)
  const shortageRows = lineItems.filter(r => { const v = variance(r); return v !== null && v < 0 })
  const hasShortage = shortageRows.length > 0

  const rateInflatedRows = lineItems.filter(r => {
    const cr = Number(r.challan_rate) || 0
    const pr = Number(r.po_rate) || 0
    return pr > 0 && cr > pr
  })
  const hasDiscrepancy = hasShortage || rateInflatedRows.length > 0

  const handleLogGRN = async () => {
    setSaving(true)
    setError(null)
    try {
      const items = lineItems.map(r => ({
        item_name: r.item_name ?? null,
        qty_unit: r.qty_unit || r.unit || r.uom || null,
        qty_value: Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty) || 0,
        challan_rate: r.challan_rate != null ? Number(r.challan_rate) : null,
        po_rate: r.po_rate != null ? Number(r.po_rate) : null,
        po_item_idx: r.po_item_idx != null ? Number(r.po_item_idx) : null,
        actual_received_qty: r.actual_received_qty !== '' ? Number(r.actual_received_qty) : null,
      }))

      await verifyGRN(decoded, supplierId, poId, grnId, {
        line_items: items,                                  // actual_received_qty present → full verify mode
        justification: justification.trim() || undefined,
      })

      if (hasDiscrepancy) {
        navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/debit-note`)
      } else {
        navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)
      }
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to log GRN')
      setSaving(false)
    }
  }

  if (!grn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        {error ?? 'Loading…'}
      </div>
    )
  }

  const meta = grn.metadata_ || {}
  const fileMime = meta.file_mime || 'application/pdf'

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/challan`)}
          className="text-gray-400 hover:text-gray-700 text-sm"
        >
          ← Back to Challan
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-700">Step 2 — Log Actual GRN</span>
        <span className="ml-auto flex items-center gap-2">
          {meta.challan_no && <span className="text-xs text-gray-400 font-mono">Challan #{meta.challan_no}</span>}
          <span className="px-2 py-0.5 text-xs rounded-full bg-violet-100 text-violet-700 font-medium">2 of 3</span>
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Left — GRN entry form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Actual Gate Count Entry</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Challan items are locked. Enter what was physically received at the gate.
            </p>
          </div>

          <div className="p-5 flex-1 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {lineItems.length === 0 ? (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-4 text-sm text-orange-700">
                No challan items found. Please go back and confirm the challan first.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium gap-2"
                  style={{ gridTemplateColumns: '1fr 75px 110px 80px' }}>
                  <span>Item</span>
                  <span className="text-right">Challan Qty</span>
                  <span className="text-center">Actual Received</span>
                  <span className="text-right">Variance</span>
                </div>

                {lineItems.map((r, i) => {
                  const v = variance(r)
                  const challanQty = Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? 0)
                  const isShortage = v !== null && v < 0
                  const isExcess = v !== null && v > 0
                  const unit = r.qty_unit || r.unit || r.uom || ''
                  return (
                    <div key={i}
                      className={`grid items-center px-2 py-2.5 border-b border-gray-100 last:border-0 gap-2 ${isShortage ? 'bg-red-50/60' : ''}`}
                      style={{ gridTemplateColumns: '1fr 75px 110px 80px' }}
                    >
                      <div>
                        <p className="text-xs text-gray-800 font-medium leading-tight">{r.item_name || '—'}</p>
                        <p className="text-[10px] text-gray-400">{unit}</p>
                      </div>
                      <p className="text-xs text-right text-indigo-700 font-mono font-medium pr-1">
                        {challanQty.toLocaleString('en-IN')}
                      </p>
                      <input
                        type="number"
                        min="0"
                        value={r.actual_received_qty}
                        onChange={e => setActual(i, e.target.value)}
                        className={`text-xs px-2 py-1.5 border rounded focus:outline-none text-right w-full font-mono ${isShortage ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-200 focus:border-violet-400'}`}
                      />
                      <div className="text-right pr-1">
                        {v === null ? (
                          <span className="text-[10px] text-gray-300">—</span>
                        ) : isShortage ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                            {v.toLocaleString('en-IN')}
                          </span>
                        ) : isExcess ? (
                          <span className="text-[10px] text-amber-600 font-mono">+{v.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-[10px] text-green-600">✓</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Totals */}
                <div className="grid items-center px-3 py-2 bg-gray-50 border-t border-gray-200 gap-2"
                  style={{ gridTemplateColumns: '1fr 75px 110px 80px' }}>
                  <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Totals</span>
                  <span className="text-xs text-right text-indigo-700 font-semibold font-mono">{challanTotal.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-right text-violet-700 font-semibold font-mono">{actualTotal.toLocaleString('en-IN')}</span>
                  <span className="text-right pr-1">
                    {challanTotal > 0 && (
                      <span className={`text-xs font-mono font-semibold ${actualTotal - challanTotal < 0 ? 'text-red-600' : actualTotal - challanTotal > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {actualTotal - challanTotal > 0 ? '+' : ''}{(actualTotal - challanTotal).toLocaleString('en-IN')}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Gatekeeper justification — only shown when discrepancy detected */}
            {hasDiscrepancy && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Gatekeeper Note / Justification
                  <span className="ml-1 text-orange-500 font-normal">(optional — will be included in debit note)</span>
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Enter reason for shortage or rate discrepancy..."
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none text-gray-700"
                />
              </div>
            )}
          </div>

          <div className="p-5 border-t border-gray-100 flex gap-3 shrink-0">
            <button
              onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/challan`)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              ← Back
            </button>
            <button
              onClick={handleLogGRN}
              disabled={saving || lineItems.length === 0}
              className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition ${hasDiscrepancy ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {saving ? 'Saving…' : hasDiscrepancy ? 'Log GRN & View Debit Note →' : 'Confirm & Log GRN'}
            </button>
          </div>
        </div>

        {/* Right — challan document (reference while entering counts) */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0">
            Challan Reference Document
          </div>
          {grn.document_url ? (
            fileMime.startsWith('image/') ? (
              <img src={grn.document_url} alt="Challan" className="flex-1 w-full object-contain bg-gray-900" style={{ maxHeight: 'calc(100vh - 100px)' }} />
            ) : (
              <iframe src={grn.document_url} className="flex-1 w-full border-0" title="Challan document" />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">No document preview</div>
          )}
        </div>
      </div>
    </div>
  )
}
