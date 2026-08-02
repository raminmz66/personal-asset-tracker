import { useSync } from '../sync/SyncContext'

export function SyncBanner() {
  const { online, pendingCount, failedCount } = useSync()

  // A failure needs attention more than a pending sync does, so it wins.
  const message =
    failedCount > 0
      ? `${failedCount.toLocaleString('fa-IR')} تغییر ثبت نشد — تو تنظیمات ببین`
      : !online
        ? 'آفلاینی — تغییرات اینجا می‌مونه'
        : pendingCount > 0
          ? `${pendingCount.toLocaleString('fa-IR')} تغییر در انتظار همگام‌سازی`
          : null

  if (!message) return null

  return (
    <div
      className={`sync-banner${failedCount > 0 ? ' sync-banner--failed' : ''}`}
      role="status"
    >
      {message}
    </div>
  )
}
