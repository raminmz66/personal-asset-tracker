import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api } from '../api/client'

type Props = {
  children: React.ReactNode
}

export function AuthGate({ children }: Props) {
  const location = useLocation()
  const [state, setState] = useState<
    'loading' | 'authenticated' | 'unauthenticated' | 'setup'
  >('loading')

  useEffect(() => {
    let cancelled = false

    api.status().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setState('unauthenticated')
        return
      }
      const { setupRequired, authenticated } = result.data
      if (setupRequired) {
        setState('setup')
      } else if (authenticated) {
        setState('authenticated')
      } else {
        setState('unauthenticated')
      }
    })

    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (state === 'loading') {
    return (
      <div className="page auth-loading">
        <p>در حال بارگذاری…</p>
      </div>
    )
  }

  if (state === 'setup' || state === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
