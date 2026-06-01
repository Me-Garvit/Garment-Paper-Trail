export default function DocumentPanel({ isOpen, onClose, url, title, loading }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-[52%] bg-gray-900 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-700 shrink-0">
          <span className="text-xs text-gray-300 font-medium truncate">{title || 'Document'}</span>
          <button
            onClick={onClose}
            className="ml-4 text-gray-500 hover:text-gray-200 text-xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Loading document…
          </div>
        ) : url ? (
          <iframe src={url} className="flex-1 w-full border-0" title={title} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            No document available
          </div>
        )}
      </div>
    </div>
  )
}
