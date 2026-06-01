import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listSupplierPOs, uploadSupplierPO, getSupplierPO,
  listGRNs, ingestDetailedGRN, verifyGRN,
  listInvoices, uploadInvoice, getSupplierInvoice,
} from '../api/client'
import DiscrepancyFlags from '../components/DiscrepancyFlags'
import { VerificationBadge } from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'
import DocumentPanel from '../components/DocumentPanel'

export default function SupplierRoom() {
  const { styleNumber, supplierId } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [selectedPO, setSelectedPO] = useState(null)
  const [grns, setGRNs] = useState([])
  const [showPOUpload, setShowPOUpload] = useState(false)
  const [uploadingPO, setUploadingPO] = useState(false)
  const [showChallanUpload, setShowChallanUpload] = useState(false)
  const [uploadingChallan, setUploadingChallan] = useState(false)
  // detailedGRNMode: null | { grnId, documentUrl, grnNumber, challanNo, partyName, lineItems }
  // lineItems: [{ item_name, unit, expected_challan_qty, actual_received_qty (string), agreed_rate }]
  const [detailedGRNMode, setDetailedGRNMode] = useState(null)
  const [savingGRN, setSavingGRN] = useState(false)
  const [dnJustification, setDnJustification] = useState('')
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [error, setError] = useState(null)
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

  const loadPOs = () => listSupplierPOs(decoded, supplierId).then(setPOs).catch(() => {})
  const loadInvoices = () => listInvoices(decoded, supplierId).then(setInvoices).catch(() => {})

  useEffect(() => {
    loadPOs()
    loadInvoices()
  }, [decoded, supplierId])

  const loadGRNs = (poId) => {
    listGRNs(decoded, supplierId, poId).then(setGRNs).catch(() => {})
  }

  const selectPO = (po) => {
    setSelectedPO(po)
    loadGRNs(po.id)
  }

  // Single-upload handler: uploads the Supplier Delivery Challan, AI parses it,
  // then opens the side-by-side verification layout in-page.
  const handleChallanUpload = async (file) => {
    if (!selectedPO) return
    setUploadingChallan(true)
    setError(null)
    try {
      const grn = await ingestDetailedGRN(decoded, supplierId, selectedPO.id, file)
      setShowChallanUpload(false)
      const meta = grn.metadata_ || {}
      // Default actual_received_qty = expected_challan_qty for rapid entry.
      // Operator only needs to correct rows with an actual shortage.
      const lineItems = (meta.line_items || []).map(item => ({
        item_name: item.item_name || '',
        unit: item.unit || 'PCS',
        expected_challan_qty: Number(item.expected_challan_qty) || 0,
        actual_received_qty: String(Number(item.expected_challan_qty) || 0),
        agreed_rate: item.agreed_rate ?? null,
      }))
      setDetailedGRNMode({
        grnId: grn.id,
        documentUrl: grn.document_url || null,
        grnNumber: grn.grn_number || '',
        challanNo: meta.challan_no || '',
        partyName: meta.party_name || '',
        lineItems,
      })
      setDnJustification('')
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Challan ingest failed')
    } finally {
      setUploadingChallan(false)
    }
  }

  const updateGateCount = (idx, value) => {
    setDetailedGRNMode(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) =>
        i === idx ? { ...item, actual_received_qty: value } : item
      ),
    }))
  }

  // variance = actual - expected (negative = shortage)
  const itemVariance = (item) => {
    if (item.actual_received_qty === '') return null
    const gate = Number(item.actual_received_qty)
    if (isNaN(gate)) return null
    return gate - item.expected_challan_qty
  }

  const handleLogGRN = async () => {
    if (!detailedGRNMode || !selectedPO) return
    setSavingGRN(true)
    setError(null)
    try {
      const items = detailedGRNMode.lineItems.map(item => ({
        item_name: item.item_name,
        unit: item.unit,
        expected_challan_qty: item.expected_challan_qty,
        actual_received_qty: item.actual_received_qty !== '' ? Number(item.actual_received_qty) : null,
        agreed_rate: item.agreed_rate,
      }))

      // Build the justification: user text overrides the auto-generated summary
      const shortages = detailedGRNMode.lineItems.filter(i => {
        const v = itemVariance(i)
        return v !== null && v < 0
      })
      const totalPenalty = shortages.reduce((acc, item) => {
        const shortage = item.expected_challan_qty - Number(item.actual_received_qty)
        return acc + shortage * (item.agreed_rate || selectedPO.agreed_rate || 0)
      }, 0)
      const autoJustification = shortages.length > 0
        ? `Short delivery on Challan ${detailedGRNMode.challanNo || detailedGRNMode.grnNumber}` +
          `${detailedGRNMode.partyName ? ` from ${detailedGRNMode.partyName}` : ''}. ` +
          `Physical gate count recorded ${shortages.length} item shortage(s). ` +
          `Total penalty: ₹${totalPenalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`
        : ''

      await verifyGRN(decoded, supplierId, selectedPO.id, detailedGRNMode.grnId, {
        grn_number: detailedGRNMode.grnNumber || undefined,
        challan_no: detailedGRNMode.challanNo || undefined,
        line_items: items,
        justification: (dnJustification.trim() || autoJustification) || undefined,
      })
      setDetailedGRNMode(null)
      setDnJustification('')
      loadGRNs(selectedPO.id)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to log GRN')
    } finally {
      setSavingGRN(false)
    }
  }

  const handlePOUpload = async (file) => {
    setUploadingPO(true)
    try {
      const po = await uploadSupplierPO(decoded, supplierId, file)
      setShowPOUpload(false)
      loadPOs()
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${po.id}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Upload failed')
      setUploadingPO(false)
    }
  }

  const handleInvoiceUpload = async (file) => {
    setUploadingInvoice(true)
    try {
      const inv = await uploadInvoice(decoded, supplierId, file)
      setShowInvoiceUpload(false)
      loadInvoices()
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/invoices/${inv.id}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Upload failed')
      setUploadingInvoice(false)
    }
  }

  // Derived: shortage line items where actual < challan expected
  const shortageItems = detailedGRNMode
    ? detailedGRNMode.lineItems.filter(item => {
        const v = itemVariance(item)
        return v !== null && v < 0
      })
    : []

  const poRate = selectedPO?.agreed_rate ?? 0

  const totalPenaltyAmt = shortageItems.reduce((acc, item) => {
    const shortage = item.expected_challan_qty - Number(item.actual_received_qty)
    const rate = item.agreed_rate ?? poRate
    return acc + shortage * rate
  }, 0)

  const autoJustificationText = detailedGRNMode && shortageItems.length > 0
    ? `Short delivery on Challan ${detailedGRNMode.challanNo || detailedGRNMode.grnNumber}` +
      `${detailedGRNMode.partyName ? ` from ${detailedGRNMode.partyName}` : ''}. ` +
      `Physical gate count recorded ${shortageItems.length} item shortage(s). ` +
      `Total penalty: ₹${totalPenaltyAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`
    : ''

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-1 text-sm">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700">Dashboard</button>
            <span className="text-gray-300">/</span>
            <button onClick={() => navigate(`/cases/${styleNumber}`)} className="text-gray-400 hover:text-gray-700 font-mono text-xs">{decoded}</button>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 font-medium">Supplier Room #{supplierId}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-lg font-bold text-gray-900">Supplier Room</h1>
            <button
              onClick={() => setShowInvoiceUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              + Upload Supplier Bill
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-5 gap-6">
        {error && (
          <div className="col-span-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* PO list — left 2 cols */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Supplier POs</p>
              <button
                onClick={() => setShowPOUpload(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Upload PO
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {pos.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 text-center">No POs yet</p>
              ) : pos.map(po => (
                <div
                  key={po.id}
                  onClick={() => selectPO(po)}
                  className={`flex items-center justify-between p-4 cursor-pointer hover:bg-indigo-50/40 transition ${selectedPO?.id === po.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-medium text-gray-800 truncate">{po.supplier_po_number}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{po.material_category} · Qty {po.ordered_quantity ?? '—'} · ₹{po.agreed_rate ?? '—'}/unit</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {po.metadata_?.file_url && (
                      <button
                        title="View document"
                        onClick={() => openDocPanel(() => getSupplierPO(decoded, supplierId, po.id), `PO ${po.supplier_po_number}`)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                    )}
                    <button
                      title="Edit PO"
                      onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${po.id}/verify`)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GRNs — right 3 cols */}
        <div className="col-span-3 space-y-4">
          {selectedPO ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">GRNs for {selectedPO.supplier_po_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Budget: {selectedPO.ordered_quantity ?? '—'} units @ ₹{selectedPO.agreed_rate ?? '—'}/unit
                  </p>
                </div>
                <button
                  onClick={() => setShowChallanUpload(true)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                >
                  + Ingest Detailed GRN
                </button>
              </div>

              {grns.length === 0 ? (
                <p className="p-6 text-xs text-gray-400 text-center">No GRNs logged for this PO yet</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-gray-400 font-medium">GRN #</th>
                      <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Qty Received</th>
                      <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Date</th>
                      <th className="px-2 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grns.map(g => (
                      <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-gray-700">
                          {g.grn_number}
                          {g.metadata_?.is_discrepancy && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[10px] font-semibold">SHORTAGE</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{g.received_quantity ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">
                          {g.received_date ? new Date(g.received_date).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            title="View / Edit GRN"
                            onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${selectedPO.id}/grns/${g.id}/verify`)}
                            className="p-1 text-gray-300 hover:text-indigo-500 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-600">Total Received</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-800">
                        {grns.reduce((acc, g) => acc + (Number(g.received_quantity) || 0), 0).toLocaleString()}
                      </td>
                      <td /><td />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              Select a Supplier PO to view GRNs
            </div>
          )}

          {/* Invoices section */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Supplier Invoices</p>
              <button
                onClick={() => setShowInvoiceUpload(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Upload Invoice
              </button>
            </div>
            {invoices.length === 0 ? (
              <p className="p-6 text-xs text-gray-400 text-center">No invoices uploaded yet</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Invoice #</th>
                    <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Value</th>
                    <th className="text-center px-4 py-2.5 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Flags</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/cases/${styleNumber}/suppliers/${supplierId}/invoices/${inv.id}/verify`)}
                    >
                      <td className="px-4 py-3 font-mono text-gray-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {inv.taxable_value != null ? `₹${Number(inv.taxable_value).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <VerificationBadge status={inv.verification_status} />
                      </td>
                      <td className="px-4 py-3">
                        <DiscrepancyFlags flags={inv.discrepancy_flags} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {inv.file_url && (
                          <button
                            title="View document"
                            onClick={() => openDocPanel(() => getSupplierInvoice(decoded, supplierId, inv.id), `Invoice ${inv.invoice_number}`)}
                            className="p-1 text-gray-300 hover:text-indigo-500 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 116 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {showChallanUpload && selectedPO && (
        <UploadModal
          title="Upload Supplier Delivery Challan"
          description={`PO: ${selectedPO.supplier_po_number} · ₹${selectedPO.agreed_rate ?? '—'}/unit. Upload the supplier's delivery challan PDF. AI extracts challan header and per-item expected quantities automatically.`}
          onUpload={handleChallanUpload}
          onClose={() => setShowChallanUpload(false)}
          loading={uploadingChallan}
        />
      )}

      {showPOUpload && (
        <UploadModal
          title="Upload Supplier PO"
          description="Upload the Supplier Purchase Order (PDF or Excel). AI will extract PO number, line items, HSN codes, and rates."
          onUpload={handlePOUpload}
          onClose={() => setShowPOUpload(false)}
          loading={uploadingPO}
        />
      )}

      {showInvoiceUpload && (
        <UploadModal
          title="Upload Supplier Invoice"
          description={`Context: Style ${decoded} · Supplier #${supplierId}. AI will pre-fill the form.`}
          onUpload={handleInvoiceUpload}
          onClose={() => setShowInvoiceUpload(false)}
          loading={uploadingInvoice}
        />
      )}

      <DocumentPanel
        isOpen={docPanel.open}
        onClose={() => setDocPanel(p => ({ ...p, open: false }))}
        url={docPanel.url}
        title={docPanel.title}
        loading={docPanel.loading}
      />

      {/* ── Side-by-side GRN Verification Layout ────────────────────────────── */}

      {detailedGRNMode && (
        <div className="fixed inset-0 z-50 flex bg-white" style={{ top: '65px' }}>

          {/* ── Left: Interactive logging table ── */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-y-auto bg-white">

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">GRN Verification — Gate Count Entry</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detailedGRNMode.challanNo && `Challan ${detailedGRNMode.challanNo}`}
                  {detailedGRNMode.partyName && ` · ${detailedGRNMode.partyName}`}
                  {selectedPO?.agreed_rate && ` · ₹${selectedPO.agreed_rate}/unit`}
                </p>
              </div>
              <button
                onClick={() => { setDetailedGRNMode(null); setDnJustification(''); setError(null) }}
                className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition"
              >
                ✕ Cancel
              </button>
            </div>

            <div className="p-5 flex-1 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}

              {/* Stream legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-300 inline-block" />
                  Challan Expected Qty (AI-extracted)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                  Actual Physical Count (editable)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  Variance (auto-computed)
                </span>
              </div>

              {/* Main logging table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_120px_80px] bg-gray-50 border-b border-gray-200 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium gap-2">
                  <span>Item</span>
                  <span className="text-right">Challan Qty</span>
                  <span className="text-center">Actual Count</span>
                  <span className="text-right">Variance</span>
                </div>

                {detailedGRNMode.lineItems.map((item, idx) => {
                  const variance = itemVariance(item)
                  const isShortage = variance !== null && variance < 0
                  const isExcess = variance !== null && variance > 0

                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-[1fr_100px_120px_80px] items-center px-2 py-2.5 border-b border-gray-100 last:border-0 gap-2 ${isShortage ? 'bg-red-50/60' : ''}`}
                    >
                      <div>
                        <p className="text-xs text-gray-800 font-medium leading-tight">{item.item_name || '—'}</p>
                        <p className="text-[10px] text-gray-400">{item.unit}</p>
                      </div>
                      <p className="text-xs text-right text-indigo-700 font-mono pr-1 font-medium">
                        {item.expected_challan_qty.toLocaleString('en-IN')}
                      </p>
                      <input
                        type="number"
                        min="0"
                        value={item.actual_received_qty}
                        onChange={e => updateGateCount(idx, e.target.value)}
                        className={`text-xs px-2 py-1.5 border rounded focus:outline-none text-right w-full font-mono ${isShortage ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-200 focus:border-violet-400'}`}
                      />
                      <div className="text-right pr-1">
                        {variance === null ? (
                          <span className="text-[10px] text-gray-300">—</span>
                        ) : isShortage ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                            {variance.toLocaleString('en-IN')}
                          </span>
                        ) : isExcess ? (
                          <span className="text-[10px] text-amber-600 font-mono font-medium">+{variance.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-[10px] text-green-600 font-mono">✓</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Totals row */}
                <div className="grid grid-cols-[1fr_100px_120px_80px] items-center px-3 py-2 bg-gray-50 border-t border-gray-200 gap-2">
                  <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Totals</span>
                  <span className="text-xs text-right text-indigo-700 font-semibold font-mono pr-1">
                    {detailedGRNMode.lineItems.reduce((acc, i) => acc + i.expected_challan_qty, 0).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-right text-violet-700 font-semibold font-mono">
                    {detailedGRNMode.lineItems
                      .reduce((acc, i) => acc + (i.actual_received_qty !== '' ? Number(i.actual_received_qty) || 0 : 0), 0)
                      .toLocaleString('en-IN')}
                  </span>
                  <span className="text-right pr-1">
                    {(() => {
                      const totalV = detailedGRNMode.lineItems.reduce((acc, i) => {
                        const v = itemVariance(i)
                        return v !== null ? acc + v : acc
                      }, 0)
                      const hasAny = detailedGRNMode.lineItems.some(i => itemVariance(i) !== null)
                      if (!hasAny) return null
                      return (
                        <span className={`text-xs font-mono font-semibold ${totalV < 0 ? 'text-red-600' : totalV > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {totalV > 0 ? '+' : ''}{totalV.toLocaleString('en-IN')}
                        </span>
                      )
                    })()}
                  </span>
                </div>
              </div>

              {/* Debit Note Summary card — appears automatically on any shortage */}
              {shortageItems.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden">
                  {/* DN Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-orange-100 border-b border-orange-200">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold tracking-wide uppercase">
                        Debit Note Summary
                      </span>
                      <span className="text-xs text-orange-700 font-medium">
                        {shortageItems.length} item{shortageItems.length > 1 ? 's' : ''} short
                      </span>
                    </div>
                    <span className="text-sm font-bold text-red-700 font-mono">
                      −₹{totalPenaltyAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Per-item penalty breakdown */}
                    <div className="space-y-1.5">
                      {shortageItems.map((item, i) => {
                        const shortage = item.expected_challan_qty - Number(item.actual_received_qty)
                        const rate = item.agreed_rate ?? poRate
                        const penalty = shortage * rate
                        return (
                          <div key={i} className="grid grid-cols-[1fr_auto] items-center bg-white rounded px-3 py-2 border border-orange-100 gap-4">
                            <div>
                              <p className="text-xs text-gray-800 font-medium">{item.item_name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                Received {Number(item.actual_received_qty).toLocaleString('en-IN')} of {item.expected_challan_qty.toLocaleString('en-IN')} {item.unit}
                                {rate > 0 && ` · ₹${rate}/unit`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-mono text-red-600 font-semibold">−{shortage.toLocaleString('en-IN')} {item.unit}</p>
                              {rate > 0 && (
                                <p className="text-[10px] text-red-500 font-mono mt-0.5">
                                  ₹{penalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Total penalty row */}
                    {poRate > 0 && (
                      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-2">
                        <span className="text-xs font-semibold text-red-700">Total Penalty Amount</span>
                        <span className="text-sm font-bold font-mono text-red-700">
                          ₹{totalPenaltyAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Editable justification textarea */}
                    <div>
                      <label className="block text-[10px] text-orange-600 font-medium uppercase tracking-wide mb-1.5">
                        Debit Note Justification
                      </label>
                      <textarea
                        rows={3}
                        value={dnJustification}
                        onChange={e => setDnJustification(e.target.value)}
                        placeholder={autoJustificationText}
                        className="w-full text-xs px-3 py-2 border border-orange-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 resize-none text-gray-700 placeholder-orange-300"
                      />
                      <p className="text-[10px] text-orange-400 mt-1">
                        Auto-populated. Edit to add context before committing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-5 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => { setDetailedGRNMode(null); setDnJustification(''); setError(null) }}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Discard
              </button>
              <button
                onClick={handleLogGRN}
                disabled={savingGRN}
                className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition ${shortageItems.length > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {savingGRN
                  ? 'Saving…'
                  : shortageItems.length > 0
                    ? 'Log GRN & Create Debit Note'
                    : 'Log GRN'}
              </button>
            </div>
          </div>

          {/* ── Right: Challan document viewer ── */}
          <div className="w-1/2 bg-gray-800 flex flex-col">
            <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0 flex items-center justify-between">
              <span>Supplier Delivery Challan — Original Document</span>
              {detailedGRNMode.challanNo && (
                <span className="font-mono text-gray-500">#{detailedGRNMode.challanNo}</span>
              )}
            </div>
            {detailedGRNMode.documentUrl ? (
              <iframe
                src={detailedGRNMode.documentUrl}
                className="flex-1 w-full border-0"
                title="Supplier delivery challan"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                No document preview available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
