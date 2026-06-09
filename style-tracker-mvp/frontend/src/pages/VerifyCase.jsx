import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCase, verifyCase, createCase } from '../api/client'
import { VerificationBadge } from '../components/StatusBadge'
import UploadModal from '../components/UploadModal'

export default function VerifyCase() {
  const { styleNumber } = useParams()
  const navigate = useNavigate()
  const decoded = decodeURIComponent(styleNumber)

  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState({})
  // sizeBreakdown: { [sizeToken]: string (editable input value) }
  const [sizeBreakdown, setSizeBreakdown] = useState({})
  const [subBuyer, setSubBuyer] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showReupload, setShowReupload] = useState(false)
  const [replacingDoc, setReplacingDoc] = useState(false)

  const handleReplaceDoc = async (file) => {
    setReplacingDoc(true)
    try {
      const updated = await createCase(file)
      setShowReupload(false)
      navigate(`/cases/${encodeURIComponent(updated.style_number)}/verify`)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Re-upload failed')
    } finally {
      setReplacingDoc(false)
    }
  }

  useEffect(() => {
    getCase(decoded).then(d => {
      setDraft(d)
      setForm({
        style_number: d.style_number,
        buyer_name: d.buyer_name,
        total_order_quantity: d.total_order_quantity ?? '',
        total_order_value: d.total_order_value ?? '',
      })
      // Seed sub-buyer and size breakdown from AI-extracted metadata
      setSubBuyer(d.metadata_?.sub_buyer_name ?? '')
      const bd = d.metadata_?.size_breakdown
      if (bd && typeof bd === 'object' && !Array.isArray(bd) && Object.keys(bd).length > 0) {
        setSizeBreakdown(
          Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, String(v ?? '')]))
        )
      }
    }).catch(() => setError('Failed to load case.'))
  }, [decoded])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const setSizeQty = (size, value) =>
    setSizeBreakdown(prev => ({ ...prev, [size]: value }))

  const addSizeRow = () => {
    const token = prompt('Enter size token (e.g. S, M, L, XL, 38, 40)')?.trim().toUpperCase()
    if (token && !sizeBreakdown[token]) {
      setSizeBreakdown(prev => ({ ...prev, [token]: '' }))
    }
  }

  const removeSizeRow = (size) =>
    setSizeBreakdown(prev => {
      const next = { ...prev }
      delete next[size]
      return next
    })

  // Live total computed from size breakdown inputs
  const sizeTotal = Object.values(sizeBreakdown).reduce((acc, v) => {
    const n = parseInt(v, 10)
    return acc + (isNaN(n) ? 0 : n)
  }, 0)

  const hasSizeBreakdown = Object.keys(sizeBreakdown).length > 0

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      // Build metadata patch: preserve existing metadata, overlay new values
      const existingMeta = draft.metadata_ || {}
      const metaPatch = {
        ...existingMeta,
        sub_buyer_name: subBuyer.trim() || null,
      }
      if (hasSizeBreakdown) {
        const cleanBreakdown = Object.fromEntries(
          Object.entries(sizeBreakdown)
            .filter(([, v]) => v !== '')
            .map(([k, v]) => [k, parseInt(v, 10)])
        )
        metaPatch.size_breakdown = cleanBreakdown
      }

      const totalQty = hasSizeBreakdown && sizeTotal > 0
        ? sizeTotal
        : (form.total_order_quantity ? Number(form.total_order_quantity) : null)

      await verifyCase(decoded, {
        style_number: form.style_number,
        buyer_name: form.buyer_name,
        total_order_quantity: totalQty,
        total_order_value: form.total_order_value ? Number(form.total_order_value) : null,
        metadata_: metaPatch,
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
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
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
                value={form.style_number ?? ''}
                onChange={e => set('style_number', e.target.value)}
                className="input"
                placeholder="e.g. SS26_ZRA_PRT_BOXYF_NW_2"
              />
            </Field>

            <Field label="Buyer Name" required>
              <input
                value={form.buyer_name ?? ''}
                onChange={e => set('buyer_name', e.target.value)}
                className="input"
              />
            </Field>

            {/* Sub-Buyer / Agent — optional */}
            <Field label="Sub-Buyer / Agent">
              <input
                value={subBuyer}
                onChange={e => setSubBuyer(e.target.value)}
                className="input"
                placeholder="Third-party brand, buying agent, or middleman (optional)"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={hasSizeBreakdown ? 'Total Order Qty (auto-summed)' : 'Total Order Qty (pcs)'}>
                <input
                  type="number"
                  value={hasSizeBreakdown ? sizeTotal : form.total_order_quantity}
                  onChange={e => !hasSizeBreakdown && set('total_order_quantity', e.target.value)}
                  readOnly={hasSizeBreakdown}
                  className={`input ${hasSizeBreakdown ? 'bg-indigo-50 text-indigo-700 font-semibold cursor-default' : ''}`}
                />
              </Field>
              <Field label="Total Order Value (₹)">
                <input
                  type="number"
                  value={form.total_order_value ?? ''}
                  onChange={e => set('total_order_value', e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            {/* ── Size Breakdown ─────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">
                  Size-wise Quantity Breakdown
                  {hasSizeBreakdown && (
                    <span className="ml-2 text-gray-400 font-normal">
                      Total:{' '}
                      <span className="text-indigo-600 font-semibold">
                        {sizeTotal.toLocaleString('en-IN')} pcs
                      </span>
                    </span>
                  )}
                </p>
                <button
                  onClick={addSizeRow}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Size
                </button>
              </div>

              {hasSizeBreakdown ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[80px_1fr_32px] bg-gray-50 border-b border-gray-200 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide font-medium">
                    <span>Size</span>
                    <span className="text-right pr-3">Quantity (pcs)</span>
                    <span />
                  </div>

                  {Object.entries(sizeBreakdown).map(([size, qty]) => {
                    const numQty = parseInt(qty, 10)
                    const pct = sizeTotal > 0 && !isNaN(numQty)
                      ? ((numQty / sizeTotal) * 100).toFixed(1)
                      : null

                    return (
                      <div
                        key={size}
                        className="grid grid-cols-[80px_1fr_32px] items-center px-3 py-2 border-b border-gray-100 last:border-0 gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold">
                            {size}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pr-1">
                          <input
                            type="number"
                            min="0"
                            value={qty}
                            onChange={e => setSizeQty(size, e.target.value)}
                            className="input text-right text-sm font-mono flex-1"
                          />
                          {pct !== null && (
                            <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">
                              {pct}%
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeSizeRow(size)}
                          className="text-gray-300 hover:text-red-400 text-sm leading-none transition"
                          title="Remove size"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}

                  {/* Live total footer */}
                  <div className="grid grid-cols-[80px_1fr_32px] px-3 py-2.5 bg-indigo-50 border-t border-indigo-100 text-xs">
                    <span className="text-gray-500 font-medium">Total</span>
                    <span className="text-right pr-12 font-bold text-indigo-700 font-mono text-sm">
                      {sizeTotal.toLocaleString('en-IN')}
                      <span className="text-xs font-normal text-indigo-400 ml-1">pcs</span>
                    </span>
                    <span />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center">
                  <p className="text-xs text-gray-400">No size breakdown extracted.</p>
                  <button onClick={addSizeRow} className="mt-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                    Add manually →
                  </button>
                </div>
              )}
            </div>

            {/* Other AI-extracted metadata (scalar fields only) */}
            {draft.metadata_ && Object.keys(draft.metadata_).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Additional AI-Extracted Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries({
                    ...draft.metadata_,
                    ...(draft.metadata_.extra_fields || {}),
                  })
                    .filter(([k, v]) =>
                      k !== 'extra_fields' &&
                      k !== 'sub_buyer_name' &&
                      k !== 'size_breakdown' &&
                      v !== null && v !== undefined && v !== '' &&
                      !Array.isArray(v) && typeof v !== 'object'
                    )
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

          <div className="p-6 border-t border-gray-100 flex gap-3 shrink-0">
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
          <div className="px-4 py-2.5 bg-gray-900 text-xs text-gray-400 font-medium border-b border-gray-700 shrink-0 flex items-center justify-between">
            <span>Original Document</span>
            <button onClick={() => setShowReupload(true)} className="text-gray-500 hover:text-white text-[10px] font-medium transition">
              ↑ Replace
            </button>
          </div>
          {draft.document_url ? (
            <iframe
              src={draft.document_url}
              className="flex-1 w-full border-0"
              title="Source document"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              No document preview available
            </div>
          )}
        </div>
      </div>

      {showReupload && (
        <UploadModal
          title="Replace Buyer PO Document"
          description="Upload the correct Buyer PO. AI will re-parse and refresh the form."
          onUpload={handleReplaceDoc}
          onClose={() => setShowReupload(false)}
          loading={replacingDoc}
        />
      )}
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
