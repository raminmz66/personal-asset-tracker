import { formatJalali } from './jalali'

function toFaDigits(value: string): string {
  return value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!)
}

function toJalaliDateKey(iso: string): string {
  return iso.slice(0, 10)
}

/** Relative Persian time for freshness footers. */
export function formatRelativeFa(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (Number.isNaN(then.getTime()) || Number.isNaN(diffMs) || diffMs < 0) {
    return formatJalali(toJalaliDateKey(iso))
  }

  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'همین الان'

  const min = Math.floor(sec / 60)
  if (min < 60) return `${toFaDigits(String(min))} دقیقه پیش`

  const hr = Math.floor(min / 60)
  if (hr < 24) return `${toFaDigits(String(hr))} ساعت پیش`

  const dayMs = 24 * 60 * 60 * 1000
  if (diffMs < 2 * dayMs) return 'دیروز'

  return formatJalali(toJalaliDateKey(iso))
}
