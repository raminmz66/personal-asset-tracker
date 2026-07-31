import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { SyncProvider } from './sync/SyncContext'
import { Balance } from './routes/Balance'
import { Home } from './routes/Home'
import { Person } from './routes/Person'
import { Settled } from './routes/Settled'
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
          { path: '/', element: <Home /> },
          { path: '/people/:id/settled', element: <Settled /> },
          { path: '/people/:id', element: <Person /> },
          { path: '/balances/:id', element: <Balance /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
