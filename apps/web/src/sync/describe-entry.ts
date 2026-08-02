import type { OutboxEntry } from './outbox'

type Rule = { method: string; pattern: RegExp; label: string }

const RULES: Rule[] = [
  { method: 'POST', pattern: /^\/people$/, label: 'افزودن نفر' },
  { method: 'POST', pattern: /^\/people\/[^/]+\/balances$/, label: 'افزودن امانت' },
  { method: 'PATCH', pattern: /^\/people\/[^/]+$/, label: 'ویرایش نفر' },
  { method: 'DELETE', pattern: /^\/people\/[^/]+$/, label: 'حذف نفر' },
  {
    method: 'POST',
    pattern: /^\/balances\/[^/]+\/transactions$/,
    label: 'افزودن تراکنش',
  },
  { method: 'DELETE', pattern: /^\/balances\/[^/]+$/, label: 'حذف امانت' },
  { method: 'PATCH', pattern: /^\/transactions\/[^/]+$/, label: 'ویرایش تراکنش' },
  { method: 'DELETE', pattern: /^\/transactions\/[^/]+$/, label: 'حذف تراکنش' },
]

/** Names a queued write in Persian, so a failure list reads as changes. */
export function describeEntry(entry: OutboxEntry): string {
  const path = entry.path.split('?')[0]
  const match = RULES.find(
    (rule) => rule.method === entry.method && rule.pattern.test(path),
  )
  return match?.label ?? 'تغییر'
}
