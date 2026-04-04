import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { BankAutoSync } from '@/components/BankAutoSync'
import { NavBar } from '@/components/NavBar'
import { PasskeyPostLoginPrompt } from '@/components/PasskeyPostLoginPrompt'
import { NavScrollProvider } from '@/contexts/NavScrollContext'
import { useAuth } from '@/contexts/AuthContext'
import { collectLocalBackup } from '@/lib/cloudBackup/collect'
import { pushBackupToServer } from '@/lib/syncApi'
import '../App.css'

export function ProtectedShell(): ReactElement {
  const { status } = useAuth()

  useEffect(() => {
    if (status !== 'ready') return
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const local = await collectLocalBackup()
          await pushBackupToServer(local)
        } catch {
          // offline or locked out
        }
      })()
    }, 120_000)
    return () => window.clearInterval(id)
  }, [status])

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
