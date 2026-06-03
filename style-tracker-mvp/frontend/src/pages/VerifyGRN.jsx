// Screen 1 of 3 — Challan Confirm
// AI-extracted challan header + line items. PO dropdown fallback for item matching.
// On confirm → navigates to /grn-entry (Screen 2).

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGRN, getSupplierPO, verifyGRN } from '../api/client'

const UOM_OPTIONS = ['CONE', 'BOX', 'GRS', 'PCS', 'MTR', 'KG', 'SET', 'ROLL']

const poItemName = (item) => item.item_name || ''
const poItemUnit = (item) => item.qty_unit || item.uom || 'PCS'
const poItemRate = (item) => Number(item.rate) || 0

export default function VerifyGRN() {
  const { styleNumber, supplierId, poId, grnId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [grn, setGrn] = useState(null)
  const [spo, setSpo] = useState(null)
  const [header, setHeader] = useState({ grn_number: '', challan_no: '', challan_date: '', vehicle_no: '', supplier_name: '' })
  const [lineItems, setLineItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const poLineItems = spo?.metadata_?.line_items || []

  useEffect(() => {
    Promise.all([
      getGRN(decoded, supplierId, poId, grnId),
      getSupplierPO(decoded, supplierId, poId),
    ]).then(([grnData, spoData]) => {
      setGrn(grnData)
      setSpo(spoData)
      const meta = grnData.metadata_ || {}
      setHeader({
        grn_number: grnData.grn_number || '',
        challan_no: meta.challan_no || '',
        challan_date: meta.challan_date || '',
        vehicle_no: meta.vehicle_no || '',
        supplier_name: meta.party_name || meta.supplier_name || '',
      })
      const raw = Array.isArray(meta.line_items) ? meta.line_items : []
      setLineItems(
        raw.length > 0
          ? raw.map(r => ({
              item_name: r.item_name || '',
              qty_value: String(r.qty_value ?? r.expected_challan_qty ?? r.incoming_qty ?? ''),
              qty_unit: r.qty_unit || r.unit || r.uom || 'PCS',
              challan_rate: String(r.challan_rate ?? ''),
              po_rate: r.po_rate ?? null,
              po_item_idx: '',
            }))
          : [emptyRow()]
      )
    }).catch(() => setError('Failed to load GRN.'))
  }, [decoded, supplierId, poId, grnId])

  const emptyRow = () => ({ item_name: '', qty_value: '', qty_unit: 'PCS', challan_rate: '', po_rate: null, po_item_idx: '' })

  const setH = (k, v) => setHeader(h => ({ ...h, [k]: v }))
  const setItem = (i, k, v) => setLineItems(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))

  const handleSelectPOItem = (rowIdx, val) => {
    if (val === '') { setItem(rowIdx, 'po_item_idx', ''); return }
    const poi = poLineItems[Number(val)]
    if (!poi) return
    setLineItems(rows => rows.map((r, i) => i !== rowIdx ? r : {
      ...r,
      po_item_idx: val,
      item_name: poItemName(poi),
      qty_unit: poItemUnit(poi),
      po_rate: poItemRate(poi),
    }))
  }

  const addRow = () => setLineItems(rows => [...rows, emptyRow()])
  const removeRow = (i) => setLineItems(rows => rows.filter((_, idx) => idx !== i))

  const totalQty = lineItems.reduce((acc, r) => acc + (parseFloat(r.qty_value) || 0), 0)

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      const items = lineItems.map(r => ({
        item_name: r.item_name || null,
        qty_value: r.qty_value !== '' ? parseFloat(r.qty_value) : null,
        qty_unit: r.qty_unit || null,
        challan_rate: r.challan_rate !== '' ? parseFloat(r.challan_rate) : null,
        po_rate: r.po_rate ?? null,
        po_item_idx: r.po_item_idx !== '' ? Number(r.po_item_idx) : null,
      }))
      await verifyGRN(decoded, supplierId, poId, grnId, {
        grn_number: header.grn_number || null,
        challan_no: header.challan_no || null,
        challan_date: header.challan_date || null,
        vehicle_no: header.vehicle_no || null,
        supplier_name: header.supplier_name || null,
        line_items: items,   // no actual_received_qty → challan-confirm mode
      })
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grnId}/grn-entry`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Save failed')
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

  const parseFailed = grn.metadata_?.parse_failed === true
  const fileMime = grn.metadata_?.file_mime || 'application/pdf'

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)} className="text-gray-400 hover:text-gray-700 text-sm">
          ← Supplier Room
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-700">Step 1 — Confirm Challan</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-medium">1 of 3</span>
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

        {/* Left — challan form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Challan Details</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Verify AI-extracted header and line items. Match each row to a PO item using the dropdown.
            </p>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {parseFailed && (
              <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3 flex items-start gap-2.5">
                <span className="text-red-600 text-xl leading-none shrink-0">⚠</span>
                <div>
                  <p className="text-sm font-bold text-red-700">Data is too messy to read, fill details manually</p>
                  <p className="text-xs text-red-500 mt-0.5">AI could not parse the challan. Enter all fields from the original document.</p>
                </div>
              </div>
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
                <input value={header.vehicle_no} onChange={e => setH('vehicle_no', e.target.value)} className="input" placeholder="e.g. MH 04 AB 1234" />
              </Field>
              <Field label="Supplier / Party Name" className="col-span-2">
                <input value={header.supplier_name} onChange={e => setH('supplier_name', e.target.value)} className="input" />
              </Field>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">
                  Line Items
                  {totalQty > 0 && (
                    <span className="ml-2 text-gray-400 font-normal">Total: <span className="text-indigo-600 font-semibold">{totalQty.toLocaleString('en-IN')}</span></span>
                  )}
                </p>
                <button onClick={addRow} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add Row</button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium gap-1.5"
                  style={{ gridTemplateColumns: '1.5fr 70px 65px 70px 28px' }}>
                  <span>Item (match to PO)</span>
                  <span className="text-right">Challan Qty</span>
                  <span className="text-center">Unit</span>
                  <span className="text-right">Rate ₹</span>
                  <span />
                </div>

                {lineItems.map((item, i) => (
                  <div key={i} className="grid items-start px-2 py-2 border-b border-gray-100 last:border-0 gap-1.5"
                    style={{ gridTemplateColumns: '1.5fr 70px 65px 70px 28px' }}>
                    <div className="space-y-1">
                      {/* PO item selector */}
                      {poLineItems.length > 0 && (
                        <select
                          value={String(item.po_item_idx)}
                          onChange={e => handleSelectPOItem(i, e.target.value)}
                          className="w-full text-[10px] px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-white text-gray-500"
                        >
                          <option value="">— Match to PO item —</option>
                          {poLineItems.map((poi, idx) => (
                            <option key={idx} value={idx}>{poItemName(poi)} ({poItemUnit(poi)})</option>
                          ))}
                        </select>
                      )}
                      <input
                        value={item.item_name}
                        onChange={e => setItem(i, 'item_name', e.target.value)}
                        placeholder="Item description"
                        className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                    <input
                      type="number"
                      value={item.qty_value}
                      onChange={e => setItem(i, 'qty_value', e.target.value)}
                      placeholder="0"
                      className="text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-right w-full"
                    />
                    <select
                      value={item.qty_unit}
                      onChange={e => setItem(i, 'qty_unit', e.target.value)}
                      className="text-xs px-1 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 w-full"
                    >
                      {UOM_OPTIONS.map(u => <option key={u}>{u}</option>)}
                      {item.qty_unit && !UOM_OPTIONS.includes(item.qty_unit) && (
                        <option value={item.qty_unit}>{item.qty_unit}</option>
                      )}
                    </select>
                    <input
                      type="number"
                      value={item.challan_rate}
                      onChange={e => setItem(i, 'challan_rate', e.target.value)}
                      placeholder="—"
                      className="text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-right w-full"
                    />
                    <button
                      onClick={() => removeRow(i)}
                      disabled={lineItems.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-20 text-sm leading-none transition pt-1"
                    >×</button>
                  </div>
                ))}

                <div className="grid px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs font-semibold text-gray-700 gap-1.5"
                  style={{ gridTemplateColumns: '1.5fr 70px 65px 70px 28px' }}>
                  <span className="text-gray-400 font-normal">Total Challan Qty</span>
                  <span className="text-right text-indigo-700">{totalQty.toLocaleString('en-IN')}</span>
                  <span /><span /><span />
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-gray-100 flex gap-3 shrink-0">
            <button
              onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}`)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Save Draft
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !header.grn_number}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Confirm Challan →'}
            </button>
          </div>
        </div>

        {/* Right — challan document */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0">
            Original Challan Document
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

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
