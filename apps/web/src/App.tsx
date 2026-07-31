import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { SyncProvider } from './sync/SyncContext'
import { BalancePage } from './pages/BalancePage'
import { HomePage } from './pages/HomePage'
import { PersonPage } from './pages/PersonPage'
import { SettledPage } from './pages/SettledPage'
import { SettingsPage } from './pages/SettingsPage'
import { Login } from './routes/Login'

function AppShell() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  )
}

function ProtectedLayout() {
  return (
    <AuthGate>
      <SyncProvider>
        <Outlet />
      </SyncProvider>
    </AuthGate>
  )
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/login', element: <Login /> },
      {
        element: <ProtectedLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/people/:id/settled', element: <SettledPage /> },
          { path: '/people/:id', element: <PersonPage /> },
          { path: '/balances/:id', element: <BalancePage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
