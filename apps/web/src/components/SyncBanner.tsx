import { useSync } from '../sync/SyncContext'

export function SyncBanner() {
  const { online, pendingCount } = useSync()

  if (online && pendingCount === 0) return null

  const message = !online
    ? 'آفلاینی — تغییرات اینجا می‌مونه'
    : `${pendingCount.toLocaleString('fa-IR')} تغییر در انتظار همگام‌سازی`

  return (
    <div className="sync-banner" role="status">
      {message}
    </div>
  )
}
