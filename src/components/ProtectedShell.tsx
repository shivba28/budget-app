import type { ReactElement } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BankAutoSync } from '@/components/BankAutoSync'
import { NavBar } from '@/components/NavBar'
import { PasskeyPostLoginPrompt } from '@/components/PasskeyPostLoginPrompt'
import { NavScrollProvider } from '@/contexts/NavScrollContext'
import { useAuth } from '@/contexts/AuthContext'
import '../App.css'

export function ProtectedShell(): ReactElement {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="app-shell flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  if (status === 'need_pin_setup') {
    return <Navigate to="/setup-pin" replace />
  }
  if (status === 'need_unlock') {
    return <Navigate to="/unlock" replace />
  }

  return (
    <NavScrollProvider>
      <div className="app-shell">
        <BankAutoSync enabled />
        <PasskeyPostLoginPrompt />
        <div className="app-main">
          <Outlet />
        </div>
        <NavBar />
      </div>
    </NavScrollProvider>
  )
}
