import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { BalancePage } from './pages/BalancePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PersonPage } from './pages/PersonPage'
import { SettledPage } from './pages/SettledPage'
import { SettingsPage } from './pages/SettingsPage'

function AppShell() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <HomePage /> },
      { path: '/people/:id/settled', element: <SettledPage /> },
      { path: '/people/:id', element: <PersonPage /> },
      { path: '/balances/:id', element: <BalancePage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
