// Screen 3 of 3 — Debit Note Window
// Comparison of confirmed challan vs actual GRN. Debit note draft auto-computed by backend.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGRN } from '../api/client'

export default function DebitNote() {
  const { styleNumber, supplierId, poId, grnId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [grn, setGrn] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getGRN(decoded, supplierId, poId, grnId)
      .then(setGrn)
      .catch(() => setError('Failed to load GRN.'))
  }, [decoded, supplierId, poId, grnId])

  if (!grn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        {error ?? 'Loading…'}
      </div>
    )
  }

  const meta = grn.metadata_ || {}
  const lineItems = Array.isArray(meta.line_items) ? meta.line_items : []
  const dn = meta.debit_note_draft || {}
  const shortageItems = dn.shortage_items || []
  const rateInflatedItems = dn.rate_inflated_items || []
  const hasShortage = shortageItems.length > 0
  const hasRateInflation = rateInflatedItems.length > 0
  const totalPenalty = Number(dn.total_penalty_amount) || 0
  const totalOvercharge = Number(dn.total_overcharge_amount) || 0
  const grandTotal = totalPenalty + totalOvercharge

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/grn-entry`)}
          className="text-gray-400 hover:text-gray-700 text-sm"
        >
          ← Back to GRN Entry
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-700">Step 3 — Debit Note</span>
        <span className="ml-auto flex items-center gap-2">
          {meta.challan_no && <span className="text-xs text-gray-400 font-mono">Challan #{meta.challan_no}</span>}
          <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">3 of 3</span>
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* DN Header card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Debit Note Draft</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {dn.party_name && <span className="font-medium text-gray-600">{dn.party_name}</span>}
                {dn.challan_no && <span> · Challan #{dn.challan_no}</span>}
                {dn.raised_on_style && <span> · Style {dn.raised_on_style}</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-red-700 font-mono">
                −₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Total deduction</p>
            </div>
          </div>
          {dn.status === 'DRAFT' && (
            <div className="mt-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                DRAFT — Pending Acknowledgement
              </span>
            </div>
          )}
        </div>

        {/* Comparison table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Challan vs. GRN Comparison</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Item</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Challan Qty</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Received Qty</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Variance</th>
                <th className="text-center px-4 py-2.5 text-gray-400 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((r, i) => {
                const challanQty = Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? 0)
                const actualQty = Number(r.actual_received_qty ?? challanQty)
                const v = r.variance ?? (actualQty - challanQty)
                const unit = r.qty_unit || r.unit || r.uom || ''
                return (
                  <tr key={i} className={`border-b border-gray-50 ${v < 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-800 font-medium">
                      {r.item_name || '—'}
                      {unit && <span className="ml-1 text-[10px] text-gray-400">{unit}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-indigo-700 font-mono">{challanQty.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-violet-700 font-mono">{actualQty.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">
                      {v < 0 ? (
                        <span className="font-mono font-bold text-red-600">{v.toLocaleString('en-IN')}</span>
                      ) : v > 0 ? (
                        <span className="font-mono text-amber-600">+{v.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-green-600">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {r.is_qty_discrepancy && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-bold">SHORT</span>
                        )}
                        {r.is_rate_discrepancy && (
                          <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[9px] font-bold">RATE↑</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                <td className="px-4 py-2.5 text-right text-xs text-indigo-700 font-mono font-semibold">
                  {lineItems.reduce((acc, r) => acc + (Number(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? 0)), 0).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-violet-700 font-mono font-semibold">
                  {lineItems.reduce((acc, r) => acc + (Number(r.actual_received_qty ?? r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? 0)), 0).toLocaleString('en-IN')}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Shortage penalties */}
        {hasShortage && (
          <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
            <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-800">Shortage Penalty</h2>
              <span className="text-sm font-bold text-red-700 font-mono">−₹{totalPenalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-4 space-y-2">
              {shortageItems.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800">{s.item_name}</span>
                    <span className="ml-2 text-gray-400">
                      {s.shortage_qty} {s.qty_unit} short × ₹{s.po_rate}/unit
                    </span>
                  </div>
                  <span className="font-mono text-red-600 font-semibold shrink-0 ml-4">
                    ₹{Number(s.penalty_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rate inflation overcharges */}
        {hasRateInflation && (
          <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
            <div className="px-5 py-3 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-yellow-800">Rate Inflation Overcharge</h2>
              <span className="text-sm font-bold text-yellow-700 font-mono">−₹{totalOvercharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-4 space-y-2">
              {rateInflatedItems.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800">{r.item_name}</span>
                    <span className="ml-2 text-gray-400">
                      ₹{r.challan_rate}/unit vs PO ₹{r.po_rate}/unit · {r.challan_qty} {r.qty_unit}
                    </span>
                  </div>
                  <span className="font-mono text-yellow-700 font-semibold shrink-0 ml-4">
                    ₹{Number(r.overcharge_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Justification */}
        {dn.justification && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Justification / Gatekeeper Note</p>
            <p className="text-sm text-gray-700 leading-relaxed">{dn.justification}</p>
          </div>
        )}

        {/* Grand total */}
        {grandTotal > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-red-800">Total Debit Amount</p>
              <p className="text-xs text-red-500 mt-0.5">To be deducted from supplier payment</p>
            </div>
            <p className="text-2xl font-bold font-mono text-red-700">
              ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Action */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
            className="flex-1 px-6 py-3 rounded-xl bg-gray-800 text-white font-medium hover:bg-gray-900 transition"
          >
            Acknowledge & Return to Supplier Room
          </button>
        </div>
      </main>
    </div>
  )
}
