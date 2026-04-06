import type { ReactElement } from 'react'
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
  const { status, lastSyncMessage, clearSyncMessage } = useAuth()

  if (status === 'loading') {
    return (
      <main className="page page--fill flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (status === 'ready') {
    return <Navigate to="/app/transactions" replace />
  }
  if (status === 'need_pin_setup') {
    return <Navigate to="/setup-pin" replace />
  }
  if (status === 'need_unlock') {
    return <Navigate to="/unlock" replace />
  }

  return (
    <main className="page page--fill flex min-h-0 flex-1 flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="space-y-4 pb-2 text-center">
            <div className="flex justify-center">
              <img
                src="/pwa-512x512.png"
                alt=""
                width={96}
                height={96}
                className="size-24 object-contain"
                decoding="async"
              />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Budget Tracker
              </CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Sign in with Google to use your budget on any device. Accounts,
                transactions, trips, and budgets stay in sync on our servers - link
                your bank after you sign in.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-2">
            {lastSyncMessage ? (
              <p
                role="alert"
                className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-center text-sm text-muted-foreground"
              >
                {lastSyncMessage}{' '}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
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
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              You will set a short app code or passkey next so only you can open
              your finances on this device. Sessions use a secure cookie, not
              passwords stored in the browser.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
