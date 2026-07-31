import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { JalaliDateField } from './JalaliDateField'

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /۱۴۰۵/ }))
}

describe('JalaliDateField', () => {
  afterEach(() => cleanup())

  it('shows the field value in Persian digits', () => {
    render(<JalaliDateField value="1405/05/09" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /۱۴۰۵\/۰۵\/۰۹/ })).toBeTruthy()
    // The Latin form must not be on screen.
    expect(screen.queryByText('1405/05/09')).toBe(null)
  })

  it('renders day numbers in Persian digits', () => {
    render(<JalaliDateField value="1405/05/09" onChange={() => {}} />)
    openPicker()
    expect(screen.getByRole('button', { name: '۹' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '9' })).toBe(null)
  })

  it('still reports the picked date to onChange in Latin digits', () => {
    const onChange = vi.fn()
    render(<JalaliDateField value="1405/05/09" onChange={onChange} />)
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '۱۵' }))
    // Display is Persian, but the value contract stays Latin so parsing works.
    expect(onChange).toHaveBeenCalledWith('1405/05/15')
  })
})
