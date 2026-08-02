import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, isFetchFailure, OFFLINE_STATUS } from '../api/client'
import {
  clearLocalSession,
  getLocalSession,
  isSessionValid,
  setLocalSession,
} from './local-session'

type Props = {
  children: React.ReactNode
}

type GateState =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'setup'
  | 'offline-locked'

/**
 * Decides what to render, including when the server cannot be asked.
 *
 * Only OFFLINE_STATUS takes the offline branch. A 500 from the Worker is a
 * server problem, not an offline device, and must not silently unlock the app.
 */
async function resolveState(): Promise<GateState> {
  const result = await api.status()

  if (isFetchFailure(result)) {
    if (result.status === OFFLINE_STATUS) {
      const session = await getLocalSession()
      return isSessionValid(session, new Date())
        ? 'authenticated'
        : 'offline-locked'
    }
    await clearLocalSession()
    return 'unauthenticated'
  }

  const { setupRequired, authenticated } = result.data
  if (setupRequired) {
    await clearLocalSession()
    return 'setup'
  }
  if (authenticated) {
    await setLocalSession(new Date())
    return 'authenticated'
  }
  await clearLocalSession()
  return 'unauthenticated'
}

export function AuthGate({ children }: Props) {
  const location = useLocation()
  const [state, setState] = useState<GateState>('loading')

  // Checked on mount and when the tab returns to the foreground — deliberately
  // not on every navigation. A per-route round trip would make a flaky
  // connection flicker the app between online and offline modes as you move.
  const check = useCallback(async (isCancelled: () => boolean) => {
    const next = await resolveState()
    if (!isCancelled()) setState(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    void check(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [check])

  useEffect(() => {
    let cancelled = false

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void check(() => cancelled)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [check])

  const retry = useCallback(() => {
    setState('loading')
    void check(() => false)
  }, [check])

  if (state === 'loading') {
    return (
      <div className="page auth-loading">
        <p>در حال بارگذاری…</p>
      </div>
    )
  }

  if (state === 'offline-locked') {
    return (
      <div className="page auth-offline">
        <p>آفلاینی — برای ورود باید به اینترنت وصل بشی</p>
        <button type="button" className="auth-retry" onClick={retry}>
          دوباره امتحان کن
        </button>
      </div>
    )
  }

  if (state === 'setup' || state === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
