const FLAG_COLORS = {
  '[RATE_MISMATCH]': 'bg-red-100 text-red-700 border border-red-300',
  '[BILLING_MISMATCH]': 'bg-red-100 text-red-700 border border-red-300',
  '[EXCESS_DELIVERY]': 'bg-yellow-100 text-yellow-700 border border-yellow-300',
}

export default function DiscrepancyFlags({ flags = [] }) {
  if (!flags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map(f => (
        <span key={f} className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${FLAG_COLORS[f] ?? 'bg-gray-100 text-gray-600'}`}>
          {f}
        </span>
      ))}
    </div>
  )
}
