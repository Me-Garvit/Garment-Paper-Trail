import { useRef, useState } from 'react'

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const ALLOWED_EXT = /\.(pdf|png|jpe?g|xlsx?)$/i

function isAllowed(f) {
  return ALLOWED_MIME.has(f.type) || ALLOWED_EXT.test(f.name)
}

export default function UploadModal({ title, description, onUpload, onClose, loading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [typeError, setTypeError] = useState(false)

  const handleFile = (f) => {
    if (!f) return
    if (!isAllowed(f)) { setTypeError(true); return }
    setTypeError(false)
    setFile(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    handleFile(f)
  }

  const handleSubmit = () => {
    if (file) onUpload(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {file ? (
            <div className="space-y-1">
              <div className="text-2xl">{file.type.startsWith('image/') ? '🖼' : '📄'}</div>
              <p className="text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-3xl text-gray-300">⬆️</div>
              <p className="text-sm text-gray-500">
                Drag &amp; drop or <span className="text-indigo-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400">PDF, PNG, JPG, Excel — including hardcopy phone photos</p>
              {typeError && (
                <p className="text-xs text-red-500 font-medium">Unsupported file type. Please upload a PDF, JPG, PNG, or Excel file.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || loading}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Uploading…' : 'Upload & Parse'}
          </button>
        </div>
      </div>
    </div>
  )
}
