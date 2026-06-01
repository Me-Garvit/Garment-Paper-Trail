import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCase, verifyCase } from '../api/client'
import { VerificationBadge } from '../components/StatusBadge'

const LIFECYCLE_OPTIONS = ['INITIATED', 'PRODUCTION_READY', 'SHIPPED']

export default function VerifyCase() {
  const { styleNumber } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCase(decoded).then(d => {
      setDraft(d)
      setForm({
        style_number: d.style_number,
        buyer_name: d.buyer_name,
        total_order_quantity: d.total_order_quantity ?? '',
        total_order_value: d.total_order_value ?? '',
      })
    }).catch(() => setError('Failed to load case.'))
  }, [decoded])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await verifyCase(decoded, {
        style_number: form.style_number,
        buyer_name: form.buyer_name,
        total_order_quantity: form.total_order_quantity ? Number(form.total_order_quantity) : null,
        total_order_value: form.total_order_value ? Number(form.total_order_value) : null,
      })
      navigate(`/cases/${encodeURIComponent(form.style_number)}`)
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-gray-700 text-sm"
        >
          ← Dashboard
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">Verify Buyer PO</span>
        <span className="ml-auto">
          <VerificationBadge status={draft.verification_status} />
        </span>
      </header>

      {/* Split screen */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Left — editable form */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">AI Extracted Data</h2>
            <p className="text-xs text-gray-400 mt-1">
              Review against the original document. Correct any misreads, then confirm.
            </p>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <Field label="Style Number" required>
              <input
                value={form.style_number}
                onChange={e => set('style_number', e.target.value)}
                className="input"
                placeholder="e.g. SS26_ZRA_PRT_BOXYF_NW_2"
              />
            </Field>

            <Field label="Buyer Name" required>
              <input
                value={form.buyer_name}
                onChange={e => set('buyer_name', e.target.value)}
                className="input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Total Order Quantity (pcs)">
                <input
                  type="number"
                  value={form.total_order_quantity}
                  onChange={e => set('total_order_quantity', e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Total Order Value (₹)">
                <input
                  type="number"
                  value={form.total_order_value}
                  onChange={e => set('total_order_value', e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            {/* Metadata key-value cards */}
            {draft.metadata_ && Object.keys(draft.metadata_).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Additional AI-Extracted Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries({
                    ...draft.metadata_,
                    ...(draft.metadata_.extra_fields || {}),
                  })
                    .filter(([k, v]) => k !== 'extra_fields' && v !== null && v !== undefined && v !== '' && !Array.isArray(v) && typeof v !== 'object')
                    .map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-700 font-medium truncate" title={String(v)}>{String(v)}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Save as Draft
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !form.style_number || !form.buyer_name}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>

        {/* Right — PDF viewer */}
        <div className="w-1/2 bg-gray-800 flex flex-col">
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700">
            Original Document
          </div>
          {draft.document_url ? (
            <iframe
              src={draft.document_url}
              className="flex-1 w-full"
              title="Source document"
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
