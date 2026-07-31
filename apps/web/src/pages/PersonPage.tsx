import { useParams } from 'react-router'

export function PersonPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="page">
      <h1>شخص</h1>
      <p>شناسه: {id}</p>
    </div>
  )
}
