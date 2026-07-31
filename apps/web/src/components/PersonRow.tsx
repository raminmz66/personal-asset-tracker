import { Link } from 'react-router'
import { personShortStatus } from '@pat/domain'

type PersonRowProps = {
  id: string
  name: string
  activeCount: number
}

function formatStatus(activeCount: number): string {
  if (activeCount > 0) {
    return `${activeCount.toLocaleString('fa-IR')} موجودی فعال`
  }
  return personShortStatus(activeCount)
}

export function PersonRow({ id, name, activeCount }: PersonRowProps) {
  return (
    <Link to={`/people/${id}`} className="person-row">
      <div className="person-row__name">{name}</div>
      <div className="person-row__meta">{formatStatus(activeCount)}</div>
    </Link>
  )
}
