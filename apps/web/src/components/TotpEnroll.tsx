import { useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, apiErrorMessage } from '../api/client'
import { toLatinDigits } from '../format/digits'

export type TotpEnrollProps = {
  onEnabled: () => void
  onCancel: () => void
}

/** Groups the base32 secret into fours so it can be typed by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

export function TotpEnroll({ onEnabled, onCancel }: TotpEnrollProps) {
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEnroll(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await api.totpEnroll(password)
    setBusy(false)
    if (!result.ok) {
      setError(apiErrorMessage(result.error))
      return
    }
    setSecret(result.data.secret)
    setUri(result.data.otpauthUri)
    setPassword('')
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await api.totpConfirm(code)
    setBusy(false)
    if (!result.ok) {
      setError(apiErrorMessage(result.error))
      return
    }
    onEnabled()
  }

  if (secret === null) {
    return (
      <form className="totp-enroll" onSubmit={handleEnroll}>
        <p className="totp-enroll__lead">
          برای فعال کردن ورود دو مرحله‌ای، اول رمزت رو تأیید کن.
        </p>
        <label className="auth-label" htmlFor="totp-password">
          رمز عبور
        </label>
        <input
          id="totp-password"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
        />
        <div className="totp-enroll__actions">
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : 'ادامه'}
          </button>
          <button
            type="button"
            className="home-add-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            انصراف
          </button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    )
  }

  return (
    <form className="totp-enroll" onSubmit={handleConfirm}>
      <p className="totp-enroll__lead">
        این کد رو با برنامهٔ اعتبارسنجی اسکن کن.
      </p>
      <div className="totp-enroll__qr">
        <QRCodeSVG value={uri} size={180} />
      </div>
      <p className="totp-enroll__secret" dir="ltr">
        {groupSecret(secret)}
      </p>
      <p className="totp-enroll__lead">
        بعد کد شش‌رقمی رو اینجا بزن تا فعال بشه.
      </p>
      <label className="auth-label" htmlFor="totp-code">
        کد دو مرحله‌ای
      </label>
      <input
        id="totp-code"
        className="auth-input"
        type="text"
        inputMode="numeric"
        dir="ltr"
        autoComplete="one-time-password"
        maxLength={6}
        value={code}
        onChange={(e) =>
          setCode(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
        }
        disabled={busy}
        required
      />
      <div className="totp-enroll__actions">
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : 'فعال کردن'}
        </button>
        <button
          type="button"
          className="home-add-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          انصراف
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </form>
  )
}
