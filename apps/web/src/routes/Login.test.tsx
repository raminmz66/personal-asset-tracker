import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const { statusMock, loginMock, navigateMock, setLocalSessionMock } = vi.hoisted(
  () => ({
    statusMock: vi.fn(),
    loginMock: vi.fn(),
    navigateMock: vi.fn(),
    setLocalSessionMock: vi.fn(),
  }),
)

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
  Navigate: () => null,
}))

vi.mock('../api/client', () => ({
  api: { status: statusMock, login: loginMock, setup: vi.fn() },
  OFFLINE_STATUS: 0,
  isFetchFailure: (r: { ok: boolean }) => !r.ok,
}))

// jsdom has no IndexedDB, so the marker is stubbed out here.
vi.mock('../auth/local-session', () => ({
  setLocalSession: setLocalSessionMock,
}))

import { Login } from './Login'

const CODE_LABEL = 'کد دو مرحله‌ای'

describe('Login with 2FA', () => {
  beforeEach(() => {
    statusMock.mockReset().mockResolvedValue({
      ok: true,
      data: { setupRequired: false, authenticated: false },
    })
    loginMock.mockReset()
    navigateMock.mockReset()
    setLocalSessionMock.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => cleanup())

  async function typePassword(value: string) {
    const field = await waitFor(
      () => screen.getByLabelText('رمز عبور') as HTMLInputElement,
    )
    fireEvent.change(field, { target: { value } })
    return field
  }

  it('does not show the code field before the server asks for it', async () => {
    render(<Login />)
    await typePassword('secret')
    expect(screen.queryByLabelText(CODE_LABEL)).toBe(null)
  })

  it('reveals the code field on totp_required and keeps the password', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    render(<Login />)
    const password = await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = await waitFor(() => screen.getByLabelText(CODE_LABEL))
    expect(code).toBeTruthy()
    expect(password.value).toBe('secret')
    // totp_required is a normal step, not an error to shout about.
    expect(screen.queryByText('کد اشتباهه.')).toBe(null)
  })

  it('sends password and code together on the second submit', async () => {
    loginMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    render(<Login />)
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = await waitFor(() => screen.getByLabelText(CODE_LABEL))
    loginMock.mockResolvedValueOnce({ ok: true, data: { ok: true } })
    fireEvent.change(code, { target: { value: '287082' } })
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    await waitFor(() =>
      expect(loginMock).toHaveBeenLastCalledWith('secret', '287082'),
    )
  })

  it('shows a message when attempts are throttled', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'too_many_attempts',
    })
    render(<Login />)
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() =>
      expect(
        screen.getByText('تلاش زیاد بود. چند دقیقه دیگه امتحان کن.'),
      ).toBeTruthy(),
    )
  })

  it('keeps only digits in the code field', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    render(<Login />)
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = (await waitFor(() =>
      screen.getByLabelText(CODE_LABEL),
    )) as HTMLInputElement
    fireEvent.change(code, { target: { value: '۱۲۳abc۴' } })
    expect(code.value).toBe('1234')
  })
})
