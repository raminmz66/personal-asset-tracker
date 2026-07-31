import { Link } from 'react-router'

type BalanceRowProps = {
  id: string
  label: string
  quantity: number
}

export function BalanceRow({ id, label, quantity }: BalanceRowProps) {
  return (
    <Link to={`/balances/${id}`} className="balance-row">
      <span className="balance-row__label">{label}</span>
      <strong className="balance-row__qty">
        {quantity.toLocaleString('fa-IR')}
      </strong>
    </Link>
  )
}
