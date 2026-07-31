import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BackButton } from './BackButton'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}))

describe('BackButton', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  it('pops history when there is an in-app entry to go back to', () => {
    window.history.pushState({ idx: 2 }, '', '/people/p1')
    render(<BackButton fallbackTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('falls back to the parent route on a cold start (idx 0)', () => {
    window.history.replaceState({ idx: 0 }, '', '/people/p1')
    render(<BackButton fallbackTo="/people/p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith('/people/p1', { replace: true })
  })

  it('falls back to the parent route when history carries no idx', () => {
    window.history.replaceState(null, '', '/settings')
    render(<BackButton fallbackTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('renders an SVG chevron rather than a bidi-mirrored character', () => {
    window.history.replaceState({ idx: 1 }, '', '/')
    const { container } = render(<BackButton fallbackTo="/" />)
    const button = screen.getByRole('button', { name: 'بازگشت' })
    expect(container.querySelector('svg')).toBeTruthy()
    // The mirrored characters that caused the original bug must not appear.
    expect(button.textContent).toBe('')
  })
})
