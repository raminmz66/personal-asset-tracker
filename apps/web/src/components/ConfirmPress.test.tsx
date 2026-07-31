import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ConfirmPress } from './ConfirmPress'

describe('ConfirmPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('calls onConfirm only on the second click', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmPress
        label="حذف تراکنش"
        confirmLabel="مطمئنی؟ دوباره بزن"
        onConfirm={onConfirm}
      />,
    )
    const btn = screen.getByRole('button', { name: 'حذف تراکنش' })
    fireEvent.click(btn)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'مطمئنی؟ دوباره بزن' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disarms after timeout', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmPress
        label="حذف تراکنش"
        confirmLabel="مطمئنی؟ دوباره بزن"
        onConfirm={onConfirm}
        armTimeoutMs={3000}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'حذف تراکنش' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: 'حذف تراکنش' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف تراکنش' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
