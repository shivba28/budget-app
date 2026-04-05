import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
import { setPinRequest } from '@/lib/syncApi'
import { webAuthnSupported } from '@/lib/webauthnClient'
import './Page.css'

const PIN_RE = /^\d{4}$/

export function SetupPinPage(): ReactElement {
  const { status, refresh, onUnlocked } = useAuth()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  if (status === 'need_unlock') {
    return <Navigate to="/unlock" replace />
  }

  if (status === 'ready') {
    return <Navigate to="/app/transactions" replace />
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!PIN_RE.test(pin) || pin !== pinConfirm) {
      setError('Enter the same 4-digit code twice.')
      return
    }
    setBusy(true)
    try {
      await setPinRequest(pin, pinConfirm)
      await refresh()
      await onUnlocked()
      navigate('/app/transactions', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page--fill flex min-h-0 flex-1 flex-col justify-center px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-xl">Create app code</CardTitle>
            <CardDescription>
              Choose a 4-digit code to unlock the app on this device. It is
              checked on our server using a secure hash; it is not stored in
              Google Drive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="pin-new">
                  Code
                </label>
                <Input
                  id="pin-new"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                  className="text-center text-2xl tracking-[0.5em]"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="pin-repeat">
                  Confirm code
                </label>
                <Input
                  id="pin-repeat"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                  className="text-center text-2xl tracking-[0.5em]"
                  value={pinConfirm}
                  onChange={(e) =>
                    setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                />
              </div>
              {error ? (
                <p className="text-center text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Saving…' : 'Continue'}
              </Button>
            </form>
            {webAuthnSupported() ? (
              <p className="mt-4 text-center text-sm">
                <Link to="/setup-passkey" className="text-primary underline">
                  Use a passkey instead
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
