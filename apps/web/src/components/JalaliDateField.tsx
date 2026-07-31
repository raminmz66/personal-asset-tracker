type JalaliDateFieldProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}

export function JalaliDateField({
  value,
  onChange,
  disabled,
  id,
}: JalaliDateFieldProps) {
  return (
    <input
      id={id}
      className="jalali-date-field"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="۱۴۰۴/۰۵/۱۰"
      dir="ltr"
      disabled={disabled}
      required
    />
  )
}
