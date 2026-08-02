import { describe, expect, it } from 'vitest'
import { describeEntry } from './describe-entry'

function entry(method: string, path: string) {
  return { id: 'x', method, path, body: null }
}

describe('describeEntry', () => {
  it.each([
    ['POST', '/people', 'افزودن نفر'],
    ['PATCH', '/people/p1', 'ویرایش نفر'],
    ['DELETE', '/people/p1', 'حذف نفر'],
    ['POST', '/people/p1/balances', 'افزودن امانت'],
    ['DELETE', '/balances/b1', 'حذف امانت'],
    ['POST', '/balances/b1/transactions', 'افزودن تراکنش'],
    ['PATCH', '/transactions/t1', 'ویرایش تراکنش'],
    ['DELETE', '/transactions/t1', 'حذف تراکنش'],
  ])('names %s %s', (method, path, expected) => {
    expect(describeEntry(entry(method, path))).toBe(expected)
  })

  it('ignores a query string', () => {
    expect(describeEntry(entry('POST', '/people?filter=active'))).toBe(
      'افزودن نفر',
    )
  })

  it('falls back for anything unrecognised', () => {
    expect(describeEntry(entry('PUT', '/whatever'))).toBe('تغییر')
  })

  it('does not confuse a person delete with a balance delete', () => {
    expect(describeEntry(entry('DELETE', '/balances/b1'))).not.toBe('حذف نفر')
  })
})
