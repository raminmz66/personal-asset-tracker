import { useEffect, useId, useRef, useState } from 'react'
import {
  buildJalaliMonthGrid,
  jalaliMonthLabel,
  parseJalaliParts,
  shiftJalaliMonth,
  todayJalali,
} from '../dates/jalali'
import { toFaDigits } from '../format/digits'

type JalaliDateFieldProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

function monthAnchor(jalali: string): string {
  const parts = parseJalaliParts(jalali)
  if (!parts) return shiftJalaliMonth(todayJalali(), 0)
  return `${parts.year}/${String(parts.month).padStart(2, '0')}/01`
}

export function JalaliDateField({
  value,
  onChange,
  disabled,
  id,
}: JalaliDateFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthAnchor(value))

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle() {
    if (disabled) return
    setOpen((prev) => {
      const next = !prev
      if (next) setViewMonth(monthAnchor(value))
      return next
    })
  }

  function pick(jalali: string) {
    onChange(jalali)
    setOpen(false)
  }

  const cells = buildJalaliMonthGrid(viewMonth)

  return (
    <div className="jalali-date" ref={rootRef}>
      <button
        id={fieldId}
        type="button"
        className="jalali-date-field"
        dir="ltr"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {/* Displayed in Persian digits; `value` stays Latin for parsing. */}
        <span>{toFaDigits(value)}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && !disabled && (
        <div className="jalali-date-popover" role="dialog" aria-label="تقویم">
          <div className="jalali-date-nav">
            <button
              type="button"
              aria-label="ماه بعد"
              onClick={() => setViewMonth(shiftJalaliMonth(viewMonth, 1))}
            >
              ‹
            </button>
            <span>{jalaliMonthLabel(viewMonth)}</span>
            <button
              type="button"
              aria-label="ماه قبل"
              onClick={() => setViewMonth(shiftJalaliMonth(viewMonth, -1))}
            >
              ›
            </button>
          </div>

          <div className="jalali-date-weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="jalali-date-grid">
            {cells.map((cell) => {
              const selected = cell.jalali === value
              return (
                <button
                  key={cell.jalali + String(cell.inMonth)}
                  type="button"
                  className={[
                    'jalali-date-day',
                    cell.inMonth ? '' : 'jalali-date-day--muted',
                    selected ? 'jalali-date-day--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(cell.jalali)}
                >
                  {toFaDigits(cell.day)}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className="jalali-date-today"
            onClick={() => pick(todayJalali())}
          >
            امروز
          </button>
        </div>
      )}
    </div>
  )
}
