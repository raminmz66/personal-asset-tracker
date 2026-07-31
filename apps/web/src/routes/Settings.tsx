import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, apiErrorMessage } from '../api/client'
import { SyncBanner } from '../components/SyncBanner'
import { todayGregorian } from '../dates/jalali'
import { formatRelativeFa } from '../dates/relative-fa'
import { useSync } from '../sync/SyncContext'

const IMPORT_CONFIRM =
  'همهٔ داده‌های فعلی حذف و با فایل پشتیبان جایگزین می‌شن.\n\nاین کار برگشت نداره. ادامه می‌دی؟'

export function Settings() {
  const navigate = useNavigate()
  const { online, lastSyncedAt, refresh, clearOutbox } = useSync()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
    const result = await api.changePassword(currentPassword, newPassword)
    setPasswordSubmitting(false)

    if (!result.ok) {
      setPasswordError(apiErrorMessage(result.error))
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSuccess('رمز عوض شد.')
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

    if (!window.confirm(IMPORT_CONFIRM)) return

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
        <Link to="/" className="settings-back" aria-label="بازگشت">
          ←
        </Link>
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
          <button
            type="button"
            className="settings-btn settings-btn--ghost"
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? '…' : 'انتخاب فایل و وارد کردن'}
          </button>
        </section>

        <section className="settings-section settings-section--last">
          <button
            type="button"
            className="settings-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? '…' : 'خروج از حساب'}
          </button>
        </section>
      </div>

      <footer className="settings-cap">{settingsCap}</footer>
    </div>
  )
}
