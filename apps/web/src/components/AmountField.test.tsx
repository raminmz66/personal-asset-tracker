import { useState } from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AmountField } from './AmountField'

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <AmountField value={value} onChange={setValue} placeholder="مبلغ" />
      <output data-testid="canonical">{value}</output>
    </>
  )
}

function getInput(): HTMLInputElement {
  return screen.getByPlaceholderText('مبلغ') as HTMLInputElement
}

describe('AmountField', () => {
  afterEach(() => cleanup())

  it('uses a numeric keypad without a decimal key', () => {
    render(<Harness />)
    expect(getInput().getAttribute('inputMode')).toBe('numeric')
  })

  it('groups Persian digits as the value grows', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(input.value).toBe('۱٬۲۳۴٬۵۶۷')
    expect(screen.getByTestId('canonical').textContent).toBe('1234567')
  })

  it('rejects letters, punctuation, and a decimal separator', () => {
    render(<Harness initial="123" />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '۱۲۳a' } })
    expect(input.value).toBe('۱۲۳')
    fireEvent.change(input, { target: { value: '۱۲۳.' } })
    expect(input.value).toBe('۱۲۳')
    expect(screen.getByTestId('canonical').textContent).toBe('123')
  })

  it('accepts Persian digits typed directly', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '۴۵۶' } })
    expect(input.value).toBe('۴۵۶')
    expect(screen.getByTestId('canonical').textContent).toBe('456')
  })

  it('renders an existing value already grouped', () => {
    render(<Harness initial="1234567" />)
    expect(getInput().value).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('keeps the caret in place when inserting a digit mid-number', () => {
    render(<Harness initial="1234567" />)
    const input = getInput()
    // Display is '۱٬۲۳۴٬۵۶۷'. Insert '8' after '۱٬۲۳۴' (offset 5), so the
    // raw value carries 5 digits to the left of a caret at offset 6.
    fireEvent.change(input, {
      target: { value: '۱٬۲۳۴8٬۵۶۷', selectionStart: 6 },
    })
    // Canonical becomes '12348567' → display '۱۲٬۳۴۸٬۵۶۷'. The caret must
    // land just past the 5th digit, which is offset 6.
    expect(input.value).toBe('۱۲٬۳۴۸٬۵۶۷')
    expect(input.selectionStart).toBe(6)
  })

  it('strips leading zeros', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '007' } })
    expect(input.value).toBe('۷')
    expect(screen.getByTestId('canonical').textContent).toBe('7')
  })
})
