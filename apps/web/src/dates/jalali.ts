import dayjs from 'dayjs'
import jalaliday from 'jalaliday'

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

/** Parses Jalali YYYY/MM/DD to Gregorian YYYY-MM-DD, or null if invalid. */
export function parseJalaliToGregorian(jalaliDate: string): string | null {
  const trimmed = jalaliDate.trim()
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) return null
  // jalaliday parse option — not in dayjs typings
  const d = dayjs(trimmed, { jalali: true } as dayjs.OptionType)
  if (!d.isValid()) return null
  return d.format('YYYY-MM-DD')
}
