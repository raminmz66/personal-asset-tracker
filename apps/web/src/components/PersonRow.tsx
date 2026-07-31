import { Link } from 'react-router'
import { personShortStatus } from '@pat/domain'

type PersonRowProps = {
  id: string
  name: string
  activeCount: number
}

export function PersonRow({ id, name, activeCount }: PersonRowProps) {
  return (
    <Link to={`/people/${id}`} className="person-row">
      <div className="person-row__name">{name}</div>
      <div className="person-row__meta">{personShortStatus(activeCount)}</div>
    </Link>
  )
}
