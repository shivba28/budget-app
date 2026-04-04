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
import { registerPasskeyFlow } from '@/lib/passkeyFlow'
import { webAuthnSupported } from '@/lib/webauthnClient'
import './Page.css'

export function SetupPasskeyPage(): ReactElement {
  const { status, refresh, onUnlocked } = useAuth()
  const navigate = useNavigate()
  const [deviceName, setDeviceName] = useState('This device')
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
    return <Navigate to="/" replace />
  }

  const supported = webAuthnSupported()

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!supported) {
      setError('This browser does not support passkeys.')
      return
    }
    const label = deviceName.trim() || 'This device'
    setBusy(true)
    try {
      await registerPasskeyFlow(label.slice(0, 120))
      await refresh()
      await onUnlocked()
      navigate('/', { replace: true })
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
            <CardTitle className="text-xl">Use a passkey</CardTitle>
            <CardDescription>
              Unlock with Face ID, Touch ID, Windows Hello, or a security key.
              You can add a 4-digit app code later in Settings if you want both.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!supported ? (
              <p className="text-sm text-destructive mb-4">
                Passkeys are not available in this browser. Use the app code
                option instead.
              </p>
            ) : null}
            <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="passkey-label">
                  Device label (optional)
                </label>
                <Input
                  id="passkey-label"
                  maxLength={120}
                  autoComplete="off"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
              </div>
              {error ? (
                <p className="text-center text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy || !supported}>
                {busy ? 'Waiting for device…' : 'Register passkey'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link to="/setup-pin" className="text-primary underline">
                Use a 4-digit app code instead
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
