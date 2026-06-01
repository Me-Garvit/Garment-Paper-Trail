import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, createCase } from '../api/client'
import { LifecycleBadge, VerificationBadge } from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'

export default function Dashboard() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listCases()
      .then(setCases)
      .catch(() => setError('Failed to load cases. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  const handleUpload = async (file) => {
    setUploading(true)
    try {
      const newCase = await createCase(file)
      setShowModal(false)
      navigate(`/cases/${encodeURIComponent(newCase.style_number)}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Upload failed')
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Manufacturing Paper Trail
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Style-Anchored Garment Tracking System</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
          >
            <span className="text-base leading-none">+</span>
            Initiate a New Case
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
            Loading cases…
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="text-5xl">🧵</div>
            <p className="text-gray-500 text-sm">No cases yet. Upload a Buyer PO to get started.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              Initiate a New Case
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Style Number</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Buyer</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Ordered Pcs</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Order Value</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Lifecycle</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Verification</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-gray-100 hover:bg-indigo-50/40 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                    onClick={() => navigate(`/cases/${encodeURIComponent(c.style_number)}`)}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-indigo-700 text-xs">
                      {c.style_number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{c.buyer_name}</p>
                      {c.metadata_?.sub_buyer_name && (
                        <p className="text-[10px] text-indigo-500 font-medium mt-0.5">
                          via {c.metadata_.sub_buyer_name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {c.total_order_quantity?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {c.total_order_value != null
                        ? `₹${Number(c.total_order_value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LifecycleBadge status={c.lifecycle_status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <VerificationBadge status={c.verification_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-400 text-xs">→</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
              {cases.length} case{cases.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <UploadModal
          title="Initiate a New Case"
          description="Upload the Buyer's Purchase Order (PDF or Excel). AI will extract the details for your review."
          onUpload={handleUpload}
          onClose={() => setShowModal(false)}
          loading={uploading}
        />
      )}
    </div>
  )
}
