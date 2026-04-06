import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { BudgetAlertHost } from './components/BudgetAlertHost'
import { SwipeNavigationWrapper } from './components/SwipeNavigationWrapper'
import { ProtectedShell } from './components/ProtectedShell'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { hasSeenLanding } from './lib/storage'
import { LoginPage } from './pages/LoginPage'
import { SetupPasskeyPage } from './pages/SetupPasskeyPage'
import { SetupPinPage } from './pages/SetupPinPage'
import { UnlockPinPage } from './pages/UnlockPinPage'
import { Insights } from './pages/Insights'
import { Landing } from './pages/Landing'
import { Settings } from './pages/Settings'
import { TripDetail } from './pages/TripDetail'
import { Transactions } from './pages/Transactions'
import { Trips } from './pages/Trips'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

function RootEntry(): ReactElement {
  const { status } = useAuth()

  if (!hasSeenLanding()) {
    return <Landing />
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading…
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  // need_pin_setup, need_unlock, or ready
  return <Navigate to="/app/transactions" replace />
}

export default function App(): ReactElement {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Analytics />
        <SpeedInsights />
        <BudgetAlertHost />
        <Routes>
          <Route path="/" element={<RootEntry />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-pin" element={<SetupPinPage />} />
          <Route path="/setup-passkey" element={<SetupPasskeyPage />} />
          <Route path="/unlock" element={<UnlockPinPage />} />
          <Route path="/app" element={<ProtectedShell />}>
            <Route element={<SwipeNavigationWrapper />}>
              <Route
                index
                element={<Navigate to="/app/transactions" replace />}
              />
              <Route path="transactions" element={<Transactions />} />
              <Route path="insights" element={<Insights />} />
              <Route path="trips" element={<Trips />} />
              <Route path="trips/:tripId" element={<TripDetail />} />
              <Route
                path="summary"
                element={<Navigate to="/app/insights" replace />}
              />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
