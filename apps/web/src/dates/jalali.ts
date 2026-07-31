import dayjs from 'dayjs'
import jalaliday from 'jalaliday'

dayjs.extend(jalaliday)

/** Returns today's date as Gregorian YYYY-MM-DD. */
export function todayGregorian(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** Formats a Gregorian ISO date (YYYY-MM-DD) as Jalali YYYY/MM/DD. */
export function formatGregorianToJalali(isoDate: string): string {
  return dayjs(isoDate).calendar('jalali').format('YYYY/MM/DD')
}
