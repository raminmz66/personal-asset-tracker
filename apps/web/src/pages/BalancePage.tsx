import { useParams } from 'react-router'

export function BalancePage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="page">
      <h1>موجودی</h1>
      <p>شناسه: {id}</p>
    </div>
  )
}
