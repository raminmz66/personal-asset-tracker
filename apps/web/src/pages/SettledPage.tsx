import { useParams } from 'react-router'

export function SettledPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="page">
      <h1>تسویه</h1>
      <p>شناسه شخص: {id}</p>
    </div>
  )
}
