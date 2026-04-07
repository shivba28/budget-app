import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { unlockWithPasskeyFlow } from '@/lib/passkeyFlow'
import { logoutSync, startGoogleSignIn, verifyPinRequest } from '@/lib/syncApi'
import { webAuthnSupported } from '@/lib/webauthnClient'
import './Page.css'

const PIN_RE = /^\d{4}$/

export function UnlockPinPage(): ReactElement {
  const { status, refresh, onUnlocked, hasPasskeys, hasPin } = useAuth()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const autoPasskeyAttempted = useRef(false)

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

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  if (status === 'need_pin_setup') {
    return <Navigate to="/setup-pin" replace />
  }

  if (status === 'ready') {
    return <Navigate to="/app/transactions" replace />
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!PIN_RE.test(pin)) {
      setError('Enter your 4-digit code.')
      return
    }
    setBusy(true)
    try {
      await verifyPinRequest(pin)
      await refresh()
      await onUnlocked()
      navigate('/app/transactions', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  async function onForgotPin(): Promise<void> {
    setBusy(true)
    try {
      await logoutSync()
      await refresh()
      startGoogleSignIn('pin_reset')
    } finally {
      setBusy(false)
    }
  }

  async function onPasskeyUnlock(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await unlockWithPasskeyFlow()
      await refresh()
      await onUnlocked()
      navigate('/app/transactions', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const canPasskey = hasPasskeys && webAuthnSupported()

  useEffect(() => {
    if (status !== 'need_unlock') return
    if (!canPasskey) return
    if (busy) return
    if (autoPasskeyAttempted.current) return
    autoPasskeyAttempted.current = true
    void onPasskeyUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canPasskey])

  return (
    <main className="page page--fill flex min-h-0 flex-1 flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-xl">Unlock the app</CardTitle>
            <CardDescription>
              {canPasskey && hasPin
                ? 'Use your passkey or 4-digit app code. Your Google session is already active.'
                : canPasskey
                  ? 'Use your passkey to open the app.'
                  : 'Your Google session is active. Enter your 4-digit code to open the app.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {canPasskey ? (
              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onPasskeyUnlock()}
                >
                  {busy
                    ? 'Waiting…'
                    : error
                      ? 'Try passkey again'
                      : 'Unlock with passkey'}
                </Button>
              </div>
            ) : null}
            {canPasskey && hasPin ? (
              <p className="text-center text-xs text-muted-foreground">or</p>
            ) : null}
            {hasPin ? (
              <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="pin-enter">
                    App code
                  </label>
                  <Input
                    id="pin-enter"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="current-password"
                    className="text-center text-2xl tracking-[0.5em]"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Checking…' : 'Unlock with code'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onForgotPin()}
                >
                  Forgot code — reset with Google
                </Button>
                <p className="text-center text-xs text-muted-foreground leading-relaxed">
                  Reset signs you out here, then Google verifies you again before
                  clearing the code. Anyone with your Google account could do
                  this—use a strong Google password and 2-Step Verification.
                </p>
              </form>
            ) : !canPasskey ? (
              <p className="text-sm text-destructive">
                No unlock method available. Sign out and sign in with Google again.
              </p>
            ) : null}
            {error ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
