import dayjs from 'dayjs'
import jalaliday from 'jalaliday'
import { toFaDigits } from '../format/digits'

dayjs.extend(jalaliday)

/** Returns today's date as Gregorian YYYY-MM-DD. */
export function todayGregorian(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** Returns today's date as Jalali YYYY/MM/DD. */
export function todayJalali(): string {
  return dayjs().calendar('jalali').format('YYYY/MM/DD')
}

/** Formats a Gregorian ISO date (YYYY-MM-DD) as Jalali YYYY/MM/DD. */
export function formatGregorianToJalali(isoDate: string): string {
  return dayjs(isoDate).calendar('jalali').format('YYYY/MM/DD')
}

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

/** Formats a Gregorian ISO date as readable Jalali, e.g. «۱۲ تیر ۱۴۰۴». */
export function formatJalali(isoDate: string): string {
  const d = dayjs(isoDate).calendar('jalali')
  const day = d.date().toLocaleString('fa-IR')
  const month = JALALI_MONTHS[d.month()]
  const year = toFaDigits(d.year())
  return `${day} ${month} ${year}`
}

/** Parses Jalali YYYY/MM/DD to Gregorian YYYY-MM-DD, or null if invalid. */
export function parseJalaliToGregorian(jalaliDate: string): string | null {
  const trimmed = jalaliDate.trim()
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) return null
  // jalaliday parse option — not in dayjs typings
  const d = dayjs(trimmed, { jalali: true } as dayjs.OptionType)
  if (!d.isValid()) return null
  return d.format('YYYY-MM-DD')
}

export type JalaliCell = {
  jalali: string
  day: number
  inMonth: boolean
}

export function parseJalaliParts(
  jalali: string,
): { year: number; month: number; day: number } | null {
  const trimmed = jalali.trim()
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(trimmed)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function formatJalaliParts(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function jalaliDayjs(year: number, month: number, day: number) {
  return dayjs(
    formatJalaliParts(year, month, day),
    { jalali: true } as dayjs.OptionType,
  ).calendar('jalali')
}

export function shiftJalaliMonth(jalali: string, delta: number): string {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const shifted = jalaliDayjs(parts.year, parts.month, 1).add(delta, 'month')
  return formatJalaliParts(shifted.year(), shifted.month() + 1, 1)
}

export function jalaliMonthLabel(jalali: string): string {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const month = JALALI_MONTHS[parts.month - 1]!
  return `${month} ${toFaDigits(parts.year)}`
}

export function buildJalaliMonthGrid(jalali: string): JalaliCell[] {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const first = jalaliDayjs(parts.year, parts.month, 1)
  const daysInMonth = first.daysInMonth()
  // dayjs: 0=Sunday … 6=Saturday. Jalali week starts Saturday.
  const firstWeekday = first.day()
  const leading = (firstWeekday + 1) % 7

  const cells: JalaliCell[] = []

  const prev = first.subtract(1, 'month')
  const prevDays = prev.daysInMonth()
  for (let i = leading - 1; i >= 0; i--) {
    const day = prevDays - i
    cells.push({
      jalali: formatJalaliParts(prev.year(), prev.month() + 1, day),
      day,
      inMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      jalali: formatJalaliParts(parts.year, parts.month, day),
      day,
      inMonth: true,
    })
  }

  let nextDay = 1
  const next = first.add(1, 'month')
  while (cells.length % 7 !== 0) {
    cells.push({
      jalali: formatJalaliParts(next.year(), next.month() + 1, nextDay),
      day: nextDay,
      inMonth: false,
    })
    nextDay++
  }

  return cells
}
