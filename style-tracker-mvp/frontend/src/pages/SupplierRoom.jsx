import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listSupplierPOs, uploadSupplierPO, getSupplierPO,
  listGRNs, ingestDetailedGRN,
  listInvoices, uploadInvoice, getSupplierInvoice,
} from '../api/client'
import DiscrepancyFlags from '../components/DiscrepancyFlags'
import { VerificationBadge } from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'
import DocumentPanel from '../components/DocumentPanel'

// Route the edit icon to the correct screen based on GRN state
function grnDestination(styleNumber, supplierId, poId, grn) {
  const base = `/cases/${styleNumber}/suppliers/${supplierId}/pos/${poId}/grns/${grn.id}`
  // Old-style GRNs (created via /upload route before Session 15) → legacy verify page
  if (!grn.metadata_?.file_mime) return `${base}/verify`
  const status = grn.metadata_?.verification_status
  if (status === 'VERIFIED') {
    return grn.metadata_?.is_discrepancy ? `${base}/debit-note` : `${base}/grn-entry`
  }
  if (status === 'CHALLAN_CONFIRMED') return `${base}/grn-entry`
  return `${base}/challan`
}

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

  const loadGRNs = (poId) => listGRNs(decoded, supplierId, poId).then(setGRNs).catch(() => {})

  const selectPO = (po) => {
    setSelectedPO(po)
    loadGRNs(po.id)
  }

  const handleChallanUpload = async (file) => {
    if (!selectedPO) return
    setUploadingChallan(true)
    setError(null)
    try {
      const grn = await ingestDetailedGRN(decoded, supplierId, selectedPO.id, file)
      setShowChallanUpload(false)
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${selectedPO.id}/grns/${grn.id}/challan`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Challan ingest failed')
    } finally {
      setUploadingChallan(false)
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

  const existingGRNTotal = grns.reduce((acc, g) => acc + (Number(g.received_quantity) || 0), 0)

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
              <button onClick={() => setShowPOUpload(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
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
                    <p className="text-xs text-gray-400 mt-0.5">{po.material_category} · Qty {po.ordered_quantity ?? '—'}</p>
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
                    Budget: {selectedPO.ordered_quantity ?? '—'} units
                    {existingGRNTotal > 0 && ` · Received: ${existingGRNTotal.toLocaleString()}`}
                  </p>
                </div>
                <button
                  onClick={() => setShowChallanUpload(true)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition"
                >
                  + Ingest Gate Challan
                </button>
              </div>

              {grns.length === 0 ? (
                <p className="p-6 text-xs text-gray-400 text-center">No GRNs logged for this PO yet</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-gray-400 font-medium">GRN #</th>
                      <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Status</th>
                      <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Qty</th>
                      <th className="text-right px-4 py-2.5 text-gray-400 font-medium">Date</th>
                      <th className="px-2 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grns.map(g => {
                      const status = g.metadata_?.verification_status
                      return (
                        <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-gray-700">
                            {g.grn_number}
                            {g.metadata_?.is_discrepancy && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[10px] font-semibold">SHORTAGE</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {status === 'VERIFIED' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-medium">VERIFIED</span>
                            ) : status === 'CHALLAN_CONFIRMED' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">CHALLAN CONFIRMED</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 font-medium">PENDING</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{g.received_quantity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">
                            {g.received_date ? new Date(g.received_date).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <button
                              title="Open GRN"
                              onClick={() => navigate(grnDestination(styleNumber, supplierId, selectedPO.id, g))}
                              className="p-1 text-gray-300 hover:text-indigo-500 transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-600" colSpan={2}>Total Received</td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-800">{existingGRNTotal.toLocaleString()}</td>
                      <td colSpan={2} />
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

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Supplier Invoices</p>
              <button onClick={() => setShowInvoiceUpload(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
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
                      <td className="px-4 py-3 text-center"><VerificationBadge status={inv.verification_status} /></td>
                      <td className="px-4 py-3"><DiscrepancyFlags flags={inv.discrepancy_flags} /></td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {inv.file_url && (
                          <button
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

      {showChallanUpload && selectedPO && (
        <UploadModal
          title="Ingest Gate Challan"
          description={`PO: ${selectedPO.supplier_po_number}. Upload the supplier's delivery challan — PDF or phone photo (JPG/PNG). AI extracts header & items; you verify in the next step.`}
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
    </div>
  )
}
