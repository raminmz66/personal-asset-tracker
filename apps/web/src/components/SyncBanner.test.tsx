import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { useSyncMock } = vi.hoisted(() => ({ useSyncMock: vi.fn() }))

vi.mock('../sync/SyncContext', () => ({ useSync: useSyncMock }))

import { SyncBanner } from './SyncBanner'

function state(over: Partial<Record<string, unknown>>) {
  useSyncMock.mockReturnValue({
    online: true,
    pendingCount: 0,
    failedCount: 0,
    ...over,
  })
}

describe('SyncBanner', () => {
  afterEach(() => cleanup())

  it('renders nothing when everything is synced', () => {
    state({})
    const { container } = render(<SyncBanner />)
    expect(container.firstChild).toBe(null)
  })

  it('says offline when there is no connection', () => {
    state({ online: false })
    render(<SyncBanner />)
    expect(screen.getByText('آفلاینی — تغییرات اینجا می‌مونه')).toBeTruthy()
  })

  it('counts pending changes in Persian digits', () => {
    state({ pendingCount: 3 })
    render(<SyncBanner />)
    expect(screen.getByText('۳ تغییر در انتظار همگام‌سازی')).toBeTruthy()
  })

  it('reports failures ahead of anything else', () => {
    // Failures win over both offline and pending: they need attention.
    state({ online: false, pendingCount: 5, failedCount: 2 })
    render(<SyncBanner />)
    expect(screen.getByText('۲ تغییر ثبت نشد — تو تنظیمات ببین')).toBeTruthy()
    expect(screen.queryByText('آفلاینی — تغییرات اینجا می‌مونه')).toBe(null)
  })
})
