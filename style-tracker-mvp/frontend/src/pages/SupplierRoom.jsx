import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listSupplierPOs, uploadSupplierPO, getSupplierPO,
  listGRNs, uploadGRN,
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
  const [showGRNUpload, setShowGRNUpload] = useState(false)
  const [uploadingGRN, setUploadingGRN] = useState(false)
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

  const loadPOs = () =>
    listSupplierPOs(decoded, supplierId).then(setPOs).catch(() => {})

  const loadInvoices = () =>
    listInvoices(decoded, supplierId).then(setInvoices).catch(() => {})

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

  const handleGRNUpload = async (file) => {
    if (!selectedPO) return
    setUploadingGRN(true)
    try {
      const grn = await uploadGRN(decoded, supplierId, selectedPO.id, file)
      setShowGRNUpload(false)
      loadGRNs(selectedPO.id)
      navigate(`/cases/${styleNumber}/suppliers/${supplierId}/pos/${selectedPO.id}/grns/${grn.id}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'GRN upload failed')
      setUploadingGRN(false)
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

  const handleAddGRN = async () => {
    if (!selectedPO || !grnForm.grn_number || !grnForm.received_date) return
    setSavingGRN(true)
    try {
      await createGRN(decoded, supplierId, selectedPO.id, {
        grn_number: grnForm.grn_number,
        received_date: new Date(grnForm.received_date).toISOString(),
        received_quantity: grnForm.received_quantity ? Number(grnForm.received_quantity) : null,
      })
      setGRNForm({ grn_number: '', received_date: '', received_quantity: '' })
      setShowAddGRN(false)
      loadGRNs(selectedPO.id)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to log GRN')
    } finally {
      setSavingGRN(false)
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
                    Budget: {selectedPO.ordered_quantity ?? '—'} units @ ₹{selectedPO.agreed_rate ?? '—'}
                  </p>
                </div>
                <button
                  onClick={() => setShowGRNUpload(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Upload GRN
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
                        <td className="px-4 py-2.5 font-mono text-gray-700">{g.grn_number}</td>
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
                      <td />
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
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
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

      {showGRNUpload && selectedPO && (
        <UploadModal
          title="Upload Delivery Challan / GRN"
          description={`PO: ${selectedPO.supplier_po_number}. AI will extract challan number, vehicle, and all line items.`}
          onUpload={handleGRNUpload}
          onClose={() => setShowGRNUpload(false)}
          loading={uploadingGRN}
        />
      )}

      <DocumentPanel
        isOpen={docPanel.open}
        onClose={() => setDocPanel(p => ({ ...p, open: false }))}
        url={docPanel.url}
        title={docPanel.title}
        loading={docPanel.loading}
      />

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
    </div>
  )
}
