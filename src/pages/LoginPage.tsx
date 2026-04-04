import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { startGoogleSignIn } from '@/lib/syncApi'
import './Page.css'

export function LoginPage(): ReactElement {
  const { status, refresh, lastSyncMessage, clearSyncMessage } = useAuth()

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (status === 'loading') {
    return (
      <main className="page page--fill flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (status === 'ready') {
    return <Navigate to="/" replace />
  }
  if (status === 'need_pin_setup') {
    return <Navigate to="/setup-pin" replace />
  }
  if (status === 'need_unlock') {
    return <Navigate to="/unlock" replace />
  }

  return (
    <main className="page page--fill flex min-h-0 flex-1 flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <Card className="shadow-xs">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Budget Tracker</CardTitle>
            <CardDescription>
              Sign in with Google to sync your data to your Google Drive (app
              data folder). Your bank link tokens stay on this device unless you
              include them in backup keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lastSyncMessage ? (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">
                {lastSyncMessage}
                <button
                  type="button"
                  className="ml-2 text-foreground underline"
                  onClick={clearSyncMessage}
                >
                  Dismiss
                </button>
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={() => startGoogleSignIn()}
            >
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
