import { useEffect, useRef, useState } from 'react'

export type ConfirmPressProps = {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
  armTimeoutMs?: number
}

export function ConfirmPress({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
  armTimeoutMs = 3000,
}: ConfirmPressProps) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function disarm() {
    clearTimer()
    setArmed(false)
  }

  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (disabled) disarm()
    // Intentionally only react to disabled becoming true.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- disarm on disable only
  }, [disabled])

  function handleClick() {
    if (disabled) return
    if (!armed) {
      setArmed(true)
      clearTimer()
      timerRef.current = setTimeout(() => setArmed(false), armTimeoutMs)
      return
    }
    disarm()
    onConfirm()
  }

  const classes = [
    'confirm-press',
    armed ? 'confirm-press--armed' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-expanded={armed}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
