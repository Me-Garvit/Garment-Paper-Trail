const LIFECYCLE_COLORS = {
  INITIATED: 'bg-blue-100 text-blue-700',
  PRODUCTION_READY: 'bg-yellow-100 text-yellow-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  CLOSED: 'bg-green-100 text-green-700',
}

const VERIFICATION_COLORS = {
  PENDING_VERIFICATION: 'bg-orange-100 text-orange-700',
  VERIFIED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

export function LifecycleBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LIFECYCLE_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

export function VerificationBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${VERIFICATION_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}
