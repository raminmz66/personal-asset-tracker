import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../api/client'
import { toLatinDigits } from '../format/digits'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'رمز اشتباهه.',
  password_required: 'رمزتو وارد کن.',
  already_setup: 'قبلاً راه‌اندازی شده.',
  request_failed: 'ارتباط با سرور برقرار نشد.',
  invalid_code: 'کد اشتباهه.',
  code_required: 'کد دو مرحله‌ای رو وارد کن.',
  too_many_attempts: 'تلاش زیاد بود. چند دقیقه دیگه امتحان کن.',
}

function errorMessage(code: string) {
  return ERROR_MESSAGES[code] ?? 'یه مشکلی پیش اومد. دوباره امتحان کن.'
}

export function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeRequired, setCodeRequired] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.status().then((result) => {
      if (result.ok) {
        setSetupRequired(result.data.setupRequired)
        setAuthenticated(result.data.authenticated)
      }
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="page auth-loading">
        <p>در حال بارگذاری…</p>
      </div>
    )
  }

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    if (setupRequired) {
      const setupResult = await api.setup(password)
      if (!setupResult.ok) {
        setError(errorMessage(setupResult.error))
        setSubmitting(false)
        return
      }
    }

    const loginResult = await api.login(
      password,
      codeRequired ? code : undefined,
    )
    setSubmitting(false)

    if (!loginResult.ok) {
      if (loginResult.error === 'totp_required') {
        // Not a failure — the password was accepted, we just need the code.
        setCodeRequired(true)
        setError(null)
        return
      }
      setError(errorMessage(loginResult.error))
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>{setupRequired ? 'راه‌اندازی اولیه' : 'ورود'}</h1>
        <p className="auth-lead">
          {setupRequired
            ? 'برای شروع یه رمز برای این دستگاه بذار.'
            : 'رمزتو وارد کن.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="password">
            رمز عبور
          </label>
          <input
            id="password"
            className="auth-input"
            type="password"
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={1}
            disabled={submitting}
          />

          {codeRequired && (
            <>
              <label className="auth-label" htmlFor="auth-code">
                کد دو مرحله‌ای
              </label>
              <input
                id="auth-code"
                className="auth-input"
                type="text"
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-password"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(
                    toLatinDigits(e.target.value)
                      .replace(/\D/g, '')
                      .slice(0, 6),
                  )
                }
                autoFocus
                required
                disabled={submitting}
              />
            </>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'یه لحظه…'
              : setupRequired
                ? 'ذخیره و ورود'
                : 'ورود'}
          </button>
        </form>
      </div>
    </div>
  )
}
