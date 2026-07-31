import { useState, type FormEvent } from 'react'
import {
  formatGregorianToJalali,
  parseJalaliToGregorian,
  todayJalali,
} from '../dates/jalali'
import { canonicalAmount, parseAmountInput } from '../format/digits'
import { AmountField } from './AmountField'
import { JalaliDateField } from './JalaliDateField'
import { SegmentedControl } from './SegmentedControl'

export type TransactionFormValues = {
  type: 'deposit' | 'return'
  amount: number
  date: string
  note: string | null
}

type TransactionFormProps = {
  mode: 'deposit' | 'return' | 'edit'
  initialType?: 'deposit' | 'return'
  initialAmount?: number
  initialDate?: string
  initialNote?: string | null
  submitting?: boolean
  error?: string | null
  onSubmit: (values: TransactionFormValues) => void
  onCancel: () => void
}

export function TransactionForm({
  mode,
  initialType = 'deposit',
  initialAmount,
  initialDate,
  initialNote = null,
  submitting = false,
  error = null,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [type, setType] = useState<'deposit' | 'return'>(initialType)
  const [amount, setAmount] = useState(
    initialAmount !== undefined ? canonicalAmount(String(initialAmount)) : '',
  )
  const [jalaliDate, setJalaliDate] = useState(
    initialDate ? formatGregorianToJalali(initialDate) : todayJalali(),
  )
  const [note, setNote] = useState(initialNote ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = parseAmountInput(amount)
    const gregorianDate = parseJalaliToGregorian(jalaliDate)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setLocalError('مبلغ درست وارد کن.')
      return
    }
    if (!gregorianDate) {
      setLocalError('تاریخ درست نیست.')
      return
    }
    setLocalError(null)
    onSubmit({
      type: mode === 'edit' ? type : mode,
      amount: parsedAmount,
      date: gregorianDate,
      note: note.trim() || null,
    })
  }

  const title =
    mode === 'deposit'
      ? 'واریز'
      : mode === 'return'
        ? 'برگشت'
        : 'ویرایش تراکنش'

  return (
    <form className="tx-form" onSubmit={handleSubmit}>
      <div className="tx-form-title">{title}</div>

      {mode === 'edit' && (
        <SegmentedControl
          name="tx-type"
          value={type}
          disabled={submitting}
          onChange={setType}
          options={[
            { value: 'deposit', label: 'واریز' },
            { value: 'return', label: 'برگشت' },
          ]}
        />
      )}

      <AmountField
        className="tx-form-input"
        value={amount}
        onChange={setAmount}
        placeholder="مبلغ"
        disabled={submitting}
        required
        autoFocus
      />

      <JalaliDateField
        value={jalaliDate}
        onChange={setJalaliDate}
        disabled={submitting}
      />

      <input
        className="tx-form-input"
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="یادداشت (اختیاری)"
        disabled={submitting}
      />

      <div className="tx-form-actions">
        <button type="submit" className="tx-form-submit" disabled={submitting}>
          {submitting ? '…' : 'ذخیره'}
        </button>
        <button
          type="button"
          className="tx-form-cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          انصراف
        </button>
      </div>

      {error && <p className="tx-form-error">{error}</p>}
      {!error && localError && <p className="tx-form-error">{localError}</p>}
    </form>
  )
}
