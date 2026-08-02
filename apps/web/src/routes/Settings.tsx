import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { api, apiErrorMessage } from '../api/client'
import { BackButton } from '../components/BackButton'
import { ConfirmPress } from '../components/ConfirmPress'
import { SyncBanner } from '../components/SyncBanner'
import { TotpEnroll } from '../components/TotpEnroll'
import { todayGregorian } from '../dates/jalali'
import { formatRelativeFa } from '../dates/relative-fa'
import { toLatinDigits } from '../format/digits'
import { clearLocalData } from '../sync/cache'
import { describeEntry } from '../sync/describe-entry'
import { useSync } from '../sync/SyncContext'

/** Keeps only digits, capped at six — shared by both code inputs here. */
function sixDigits(value: string): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, 6)
}

export function Settings() {
  const navigate = useNavigate()
  const {
    online,
    lastSyncedAt,
    refresh,
    clearOutbox,
    pendingCount,
    failedEntries,
    discardFailed,
    discardAllFailed,
  } = useSync()
  const unsyncedCount = pendingCount + failedEntries.length
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordCode, setPasswordCode] = useState('')

  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [totpError, setTotpError] = useState<string | null>(null)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  const [loggingOut, setLoggingOut] = useState(false)

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('رمز جدید و تکرارش یکی نیست.')
      return
    }
    if (newPassword.length < 1) {
      setPasswordError('رمز جدید رو وارد کن.')
      return
    }

    setPasswordSubmitting(true)
    // With 2FA on the API requires a code here too.
    const result = await api.changePassword(
      currentPassword,
      newPassword,
      totpEnabled ? passwordCode : undefined,
    )
    setPasswordSubmitting(false)

    if (!result.ok) {
      setPasswordError(apiErrorMessage(result.error))
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordCode('')
    setPasswordSuccess('رمز عوض شد.')
  }

  const loadTotp = useCallback(async () => {
    const result = await api.totpStatus()
    setTotpEnabled(result.ok ? result.data.enabled : false)
  }, [])

  useEffect(() => {
    void loadTotp()
  }, [loadTotp])

  async function handleDisableTotp() {
    setTotpError(null)
    const result = await api.totpDisable(disablePassword, disableCode)
    if (!result.ok) {
      setTotpError(apiErrorMessage(result.error))
      return
    }
    setDisablePassword('')
    setDisableCode('')
    await loadTotp()
  }

  async function handleExport() {
    setExportError(null)
    setExporting(true)

    const result = await api.exportBackup()
    setExporting(false)

    if (!result.ok) {
      setExportError(apiErrorMessage(result.error))
      return
    }

    const date = todayGregorian().replace(/-/g, '')
    const url = URL.createObjectURL(result.data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `pat-export-${date}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    setImportError(null)
    setImportSuccess(null)
    fileInputRef.current?.click()
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImportError(null)
    setImportSuccess(null)
    setImporting(true)

    try {
      const text = await file.text()
      const doc = JSON.parse(text) as unknown
      const result = await api.importBackup(doc)

      if (!result.ok) {
        setImportError(apiErrorMessage(result.error))
        return
      }

      await clearOutbox()
      await refresh()
      setImportSuccess('پشتیبان اومد تو.')
    } catch {
      setImportError('این فایل پشتیبان به درد نمی‌خوره.')
    } finally {
      setImporting(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    await api.logout()
    // Deliberate logout, so the cached ledger goes too — a logged-out phone
    // should not still hold every balance in IndexedDB.
    await clearLocalData()
    navigate('/login', { replace: true })
  }

  const settingsCap = !online
    ? 'ذخیره محلی'
    : lastSyncedAt
      ? `همگام · ${formatRelativeFa(lastSyncedAt)}`
      : 'همگام'

  return (
    <div className="settings">
      <SyncBanner />

      <header className="settings-bar">
        <BackButton fallbackTo="/" />
        <h1 className="settings-title">تنظیمات</h1>
        <span aria-hidden="true" />
      </header>

      <div className="settings-body">
        <section className="settings-section">
          <h2 className="settings-sec-title">تغییر رمز عبور</h2>
          <form className="settings-form" onSubmit={handlePasswordSubmit}>
            <label className="settings-label" htmlFor="current-password">
              رمز فعلی
            </label>
            <input
              id="current-password"
              className="settings-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={passwordSubmitting}
            />

            <label className="settings-label" htmlFor="new-password">
              رمز جدید
            </label>
            <input
              id="new-password"
              className="settings-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={passwordSubmitting}
            />

            <label className="settings-label" htmlFor="confirm-password">
              تکرار رمز جدید
            </label>
            <input
              id="confirm-password"
              className="settings-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={passwordSubmitting}
            />

            {totpEnabled && (
              <>
                <label className="settings-label" htmlFor="password-code">
                  کد دو مرحله‌ای
                </label>
                <input
                  id="password-code"
                  className="settings-input"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="one-time-password"
                  maxLength={6}
                  value={passwordCode}
                  onChange={(e) => setPasswordCode(sixDigits(e.target.value))}
                  required
                  disabled={passwordSubmitting}
                />
              </>
            )}

            {passwordError && (
              <p className="settings-error">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="settings-success">{passwordSuccess}</p>
            )}

            <button
              type="submit"
              className="settings-btn"
              disabled={passwordSubmitting}
            >
              {passwordSubmitting ? '…' : 'ذخیره رمز'}
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h2 className="settings-sec-title">ورود دو مرحله‌ای</h2>

          {totpEnabled === null ? (
            <p className="settings-lead">…</p>
          ) : enrolling ? (
            <TotpEnroll
              onEnabled={async () => {
                setEnrolling(false)
                setTotpError(null)
                await loadTotp()
              }}
              onCancel={() => setEnrolling(false)}
            />
          ) : totpEnabled ? (
            <>
              <p className="settings-lead">
                فعاله. برای ورود، هم رمز لازمه هم کد.
              </p>

              <label className="settings-label" htmlFor="totp-off-password">
                رمز عبور
              </label>
              <input
                id="totp-off-password"
                className="settings-input"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />

              <label className="settings-label" htmlFor="totp-off-code">
                کد دو مرحله‌ای
              </label>
              <input
                id="totp-off-code"
                className="settings-input"
                type="text"
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-password"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(sixDigits(e.target.value))}
              />

              <ConfirmPress
                label="غیرفعال کردن"
                confirmLabel="مطمئنی؟ دوباره بزن"
                onConfirm={handleDisableTotp}
                className="settings-btn settings-btn--ghost"
              />
            </>
          ) : (
            <>
              <p className="settings-lead">
                یه لایهٔ امنیت بیشتر با برنامهٔ اعتبارسنجی.
              </p>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setTotpError(null)
                  setEnrolling(true)
                }}
              >
                فعال کردن
              </button>
            </>
          )}

          {totpError && <p className="settings-error">{totpError}</p>}
        </section>

        <section className="settings-section">
          <h2 className="settings-sec-title">پشتیبان‌گیری</h2>
          <p className="settings-lead">
            یه فایل JSON از همهٔ اشخاص، موجودی‌ها و تراکنش‌ها.
          </p>
          {exportError && <p className="settings-error">{exportError}</p>}
          <button
            type="button"
            className="settings-btn settings-btn--ghost"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '…' : 'دریافت فایل پشتیبان'}
          </button>
        </section>

        <section className="settings-section">
          <h2 className="settings-sec-title">بازیابی</h2>
          <p className="settings-lead">
            داده‌ها رو کامل با فایل پشتیبان عوض می‌کنه.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="settings-file"
            onChange={handleImportFile}
          />
          {importError && <p className="settings-error">{importError}</p>}
          {importSuccess && <p className="settings-success">{importSuccess}</p>}
          <ConfirmPress
            label={importing ? '…' : 'انتخاب فایل و وارد کردن'}
            confirmLabel="همه داده پاک می‌شه — تأیید"
            onConfirm={handleImportClick}
            disabled={importing}
            className="settings-btn settings-btn--ghost"
          />
        </section>

        {failedEntries.length > 0 && (
          <section className="settings-section">
            <h2 className="settings-sec-title">تغییرات ثبت‌نشده</h2>
            <p className="settings-lead">
              اینا به سرور نرسیدن و دوباره هم تلاش نمی‌شن.
            </p>
            <ul className="settings-failed">
              {failedEntries.map((entry) => (
                <li key={entry.id} className="settings-failed-row">
                  <span className="settings-failed-what">
                    {describeEntry(entry)}
                  </span>
                  <span className="settings-failed-when">
                    {formatRelativeFa(entry.failedAt)}
                  </span>
                  <button
                    type="button"
                    className="settings-failed-discard"
                    onClick={() => void discardFailed(entry.id)}
                  >
                    پاک کن
                  </button>
                </li>
              ))}
            </ul>
            <ConfirmPress
              label="همه رو پاک کن"
              confirmLabel="مطمئنی؟ دوباره بزن"
              onConfirm={() => void discardAllFailed()}
              className="settings-btn settings-btn--ghost"
            />
          </section>
        )}

        <section className="settings-section settings-section--last">
          {unsyncedCount > 0 ? (
            <>
              <p className="settings-lead">
                {`${unsyncedCount.toLocaleString('fa-IR')} تغییر هنوز همگام نشده. خارج بشی پاک می‌شه.`}
              </p>
              <ConfirmPress
                label={loggingOut ? '…' : 'خروج از حساب'}
                confirmLabel="به‌هرحال خارج شو"
                onConfirm={() => void handleLogout()}
                disabled={loggingOut}
                className="settings-logout"
              />
            </>
          ) : (
            <button
              type="button"
              className="settings-logout"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? '…' : 'خروج از حساب'}
            </button>
          )}
        </section>
      </div>

      <footer className="settings-cap">{settingsCap}</footer>
    </div>
  )
}
