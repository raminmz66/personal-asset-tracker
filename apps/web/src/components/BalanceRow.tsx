import { Link } from 'react-router'

type BalanceRowProps = {
  id: string
  label: string
  /**
   * The number to display. Callers choose which one: the person screen
   * shows the remaining quantity, the settled screen shows what passed
   * through — so this component stays ignorant of settled-ness.
   */
  amount: number
}

export function BalanceRow({ id, label, amount }: BalanceRowProps) {
  return (
    <Link to={`/balances/${id}`} className="balance-row">
      <span className="balance-row__label">{label}</span>
      <strong className="balance-row__qty">
        {amount.toLocaleString('fa-IR')}
      </strong>
    </Link>
  )
}
