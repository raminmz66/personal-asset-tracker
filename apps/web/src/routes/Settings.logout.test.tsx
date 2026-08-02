import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const {
  logoutMock,
  totpStatusMock,
  clearLocalDataMock,
  navigateMock,
  syncValue,
} = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  totpStatusMock: vi.fn(),
  clearLocalDataMock: vi.fn(),
  navigateMock: vi.fn(),
  syncValue: { current: {} as Record<string, unknown> },
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../api/client', () => ({
  api: {
    logout: logoutMock,
    totpStatus: totpStatusMock,
    changePassword: vi.fn(),
    totpDisable: vi.fn(),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
  },
  apiErrorMessage: (code: string) => code,
}))

vi.mock('../sync/cache', () => ({ clearLocalData: clearLocalDataMock }))

vi.mock('../sync/SyncContext', () => ({
  useSync: () => syncValue.current,
}))

vi.mock('../components/BackButton', () => ({ BackButton: () => null }))
vi.mock('../components/SyncBanner', () => ({ SyncBanner: () => null }))
vi.mock('../components/TotpEnroll', () => ({ TotpEnroll: () => null }))

import { Settings } from './Settings'

const LOGOUT = 'خروج از حساب'
const ANYWAY = 'به‌هرحال خارج شو'

function setSync(over: Record<string, unknown> = {}) {
  syncValue.current = {
    online: true,
    lastSyncedAt: null,
    refresh: vi.fn(),
    clearOutbox: vi.fn(),
    pendingCount: 0,
    failedEntries: [],
    discardFailed: vi.fn(),
    discardAllFailed: vi.fn(),
    ...over,
  }
}

describe('Settings logout', () => {
  beforeEach(() => {
    logoutMock.mockReset().mockResolvedValue({ ok: true, data: { ok: true } })
    totpStatusMock
      .mockReset()
      .mockResolvedValue({ ok: true, data: { enabled: false } })
    clearLocalDataMock.mockReset().mockResolvedValue(undefined)
    navigateMock.mockReset()
    setSync()
  })
  afterEach(() => cleanup())

  it('clears the cached ledger on a clean logout', async () => {
    render(<Settings />)

    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: LOGOUT })))

    await waitFor(() => expect(clearLocalDataMock).toHaveBeenCalled())
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('warns before discarding unsynced work, and does nothing on one tap', async () => {
    setSync({ pendingCount: 2 })
    render(<Settings />)

    const warning = await waitFor(() =>
      screen.getByText('۲ تغییر هنوز همگام نشده. خارج بشی پاک می‌شه.'),
    )
    expect(warning).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: LOGOUT }))
    expect(logoutMock).not.toHaveBeenCalled()
    expect(clearLocalDataMock).not.toHaveBeenCalled()
  })

  it('logs out on the second tap once warned', async () => {
    setSync({ pendingCount: 1 })
    render(<Settings />)

    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: LOGOUT })))
    fireEvent.click(screen.getByRole('button', { name: ANYWAY }))

    await waitFor(() => expect(clearLocalDataMock).toHaveBeenCalled())
  })

  it('counts parked failures as unsynced work too', async () => {
    setSync({
      pendingCount: 0,
      failedEntries: [
        {
          id: 'f1',
          method: 'POST',
          path: '/people',
          body: null,
          status: 400,
          error: 'invalid_name',
          failedAt: new Date().toISOString(),
        },
      ],
    })
    render(<Settings />)

    await waitFor(() =>
      expect(
        screen.getByText('۱ تغییر هنوز همگام نشده. خارج بشی پاک می‌شه.'),
      ).toBeTruthy(),
    )
  })
})
