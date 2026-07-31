import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../api/client'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'رمز عبور اشتباه است.',
  password_required: 'رمز عبور را وارد کنید.',
  already_setup: 'راه‌اندازی قبلاً انجام شده است.',
  request_failed: 'خطا در ارتباط با سرور.',
}

function errorMessage(code: string) {
  return ERROR_MESSAGES[code] ?? 'خطایی رخ داد. دوباره تلاش کنید.'
}

export function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
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

    const loginResult = await api.login(password)
    setSubmitting(false)

    if (!loginResult.ok) {
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
            ? 'برای شروع، یک رمز عبور برای این دستگاه تعیین کنید.'
            : 'رمز عبور را وارد کنید.'}
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

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'لطفاً صبر کنید…'
              : setupRequired
                ? 'ذخیره و ورود'
                : 'ورود'}
          </button>
        </form>
      </div>
    </div>
  )
}
