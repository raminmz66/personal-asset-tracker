import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const { enrollMock, confirmMock } = vi.hoisted(() => ({
  enrollMock: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: { totpEnroll: enrollMock, totpConfirm: confirmMock },
  apiErrorMessage: (code: string) => code,
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr" data-value={value} />
  ),
}))

import { TotpEnroll } from './TotpEnroll'

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('TotpEnroll', () => {
  beforeEach(() => {
    enrollMock.mockReset().mockResolvedValue({
      ok: true,
      data: { secret: SECRET, otpauthUri: `otpauth://totp/x?secret=${SECRET}` },
    })
    confirmMock.mockReset()
  })
  afterEach(() => cleanup())

  async function reachScanStep() {
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'dev1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toBeTruthy())
  }

  it('asks for the password before revealing a secret', () => {
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('رمز عبور')).toBeTruthy()
    expect(screen.queryByTestId('qr')).toBe(null)
  })

  it('shows the QR and the secret after enrolling', async () => {
    await reachScanStep()
    expect(screen.getByTestId('qr').getAttribute('data-value')).toContain(SECRET)
    // Secret is shown in groups of four for manual entry.
    expect(screen.getByText(/GEZD/)).toBeTruthy()
  })

  it('surfaces a wrong password without advancing', async () => {
    enrollMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'invalid_credentials',
    })
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() =>
      expect(screen.getByText('invalid_credentials')).toBeTruthy(),
    )
    expect(screen.queryByTestId('qr')).toBe(null)
  })

  it('calls onEnabled after a valid code', async () => {
    const onEnabled = vi.fn()
    render(<TotpEnroll onEnabled={onEnabled} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'dev1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toBeTruthy())

    confirmMock.mockResolvedValue({ ok: true, data: { ok: true } })
    fireEvent.change(screen.getByLabelText('کد دو مرحله‌ای'), {
      target: { value: '287082' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'فعال کردن' }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('287082'))
    expect(onEnabled).toHaveBeenCalled()
  })

  it('stays on the confirm step when the code is wrong', async () => {
    await reachScanStep()
    confirmMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'invalid_code',
    })
    fireEvent.change(screen.getByLabelText('کد دو مرحله‌ای'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'فعال کردن' }))
    await waitFor(() => expect(screen.getByText('invalid_code')).toBeTruthy())
    expect(screen.getByTestId('qr')).toBeTruthy()
  })
})
