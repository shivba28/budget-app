import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SwipeNavigationWrapper } from './components/SwipeNavigationWrapper'
import { ProtectedShell } from './components/ProtectedShell'
import { AuthProvider } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { SetupPasskeyPage } from './pages/SetupPasskeyPage'
import { SetupPinPage } from './pages/SetupPinPage'
import { UnlockPinPage } from './pages/UnlockPinPage'
import { Insights } from './pages/Insights'
import { Settings } from './pages/Settings'
import { Transactions } from './pages/Transactions'

export default function App(): ReactElement {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-pin" element={<SetupPinPage />} />
          <Route path="/setup-passkey" element={<SetupPasskeyPage />} />
          <Route path="/unlock" element={<UnlockPinPage />} />
          <Route element={<ProtectedShell />}>
            <Route element={<SwipeNavigationWrapper />}>
              <Route index element={<Transactions />} />
              <Route path="insights" element={<Insights />} />
              <Route path="summary" element={<Navigate to="/insights" replace />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
