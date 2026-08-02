import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const {
  statusMock,
  getLocalSessionMock,
  setLocalSessionMock,
  clearLocalSessionMock,
  navigateSpy,
} = vi.hoisted(() => ({
  statusMock: vi.fn(),
  getLocalSessionMock: vi.fn(),
  setLocalSessionMock: vi.fn(),
  clearLocalSessionMock: vi.fn(),
  navigateSpy: vi.fn(),
}))

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  Navigate: ({ to }: { to: string }) => {
    navigateSpy(to)
    return null
  },
}))

vi.mock('../api/client', () => ({
  api: { status: statusMock },
  OFFLINE_STATUS: 0,
  isFetchFailure: (r: { ok: boolean }) => !r.ok,
}))

// jsdom has no IndexedDB; isSessionValid stays real because it is the logic
// under test here.
vi.mock('./local-session', async () => {
  const actual =
    await vi.importActual<typeof import('./local-session')>('./local-session')
  return {
    isSessionValid: actual.isSessionValid,
    getLocalSession: getLocalSessionMock,
    setLocalSession: setLocalSessionMock,
    clearLocalSession: clearLocalSessionMock,
  }
})

import { AuthGate } from './AuthGate'

const OFFLINE_COPY = 'آفلاینی — برای ورود باید به اینترنت وصل بشی'
const CHILD_COPY = 'ledger'

function unreachable() {
  return { ok: false as const, status: 0, error: 'offline' }
}

function future() {
  return { expiresAt: new Date(Date.now() + 60_000).toISOString() }
}

function past() {
  return { expiresAt: new Date(Date.now() - 60_000).toISOString() }
}

function renderGate() {
  return render(
    <AuthGate>
      <p>{CHILD_COPY}</p>
    </AuthGate>,
  )
}

describe('AuthGate', () => {
  beforeEach(() => {
    statusMock.mockReset()
    getLocalSessionMock.mockReset().mockResolvedValue(undefined)
    setLocalSessionMock.mockReset().mockResolvedValue(undefined)
    clearLocalSessionMock.mockReset().mockResolvedValue(undefined)
    navigateSpy.mockReset()
  })
  afterEach(() => cleanup())

  it('renders the app offline when the marker is still valid', async () => {
    statusMock.mockResolvedValue(unreachable())
    getLocalSessionMock.mockResolvedValue(future())

    renderGate()

    await waitFor(() => expect(screen.getByText(CHILD_COPY)).toBeTruthy())
    expect(screen.queryByText(OFFLINE_COPY)).toBe(null)
  })

  it('locks offline when there is no marker', async () => {
    statusMock.mockResolvedValue(unreachable())
    getLocalSessionMock.mockResolvedValue(undefined)

    renderGate()

    await waitFor(() => expect(screen.getByText(OFFLINE_COPY)).toBeTruthy())
    expect(screen.queryByText(CHILD_COPY)).toBe(null)
    // Not a redirect: /login cannot authenticate anyone without a network.
    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('locks offline when the marker has expired', async () => {
    statusMock.mockResolvedValue(unreachable())
    getLocalSessionMock.mockResolvedValue(past())

    renderGate()

    await waitFor(() => expect(screen.getByText(OFFLINE_COPY)).toBeTruthy())
  })

  it('writes a marker when the server confirms the session', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: { setupRequired: false, authenticated: true },
    })

    renderGate()

    await waitFor(() => expect(screen.getByText(CHILD_COPY)).toBeTruthy())
    expect(setLocalSessionMock).toHaveBeenCalled()
  })

  it('clears the marker and redirects when the server says signed out', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: { setupRequired: false, authenticated: false },
    })
    getLocalSessionMock.mockResolvedValue(future())

    renderGate()

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'))
    expect(clearLocalSessionMock).toHaveBeenCalled()
  })

  it('does not unlock on a server error — only on an unreachable server', async () => {
    statusMock.mockResolvedValue({ ok: false, status: 500, error: 'boom' })
    getLocalSessionMock.mockResolvedValue(future())

    renderGate()

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'))
    expect(screen.queryByText(CHILD_COPY)).toBe(null)
  })
})
