import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { registerPasskeyFlow } from '@/lib/passkeyFlow'
import { webAuthnSupported } from '@/lib/webauthnClient'

function laterStorageKey(email: string): string {
  return `budget_passkey_prompt_later_${email}`
}

export function PasskeyPostLoginPrompt(): ReactElement | null {
  const { status, email, hasPasskeys, refresh } = useAuth()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'ready' || !email || hasPasskeys) {
      setVisible(false)
      return
    }
    if (!webAuthnSupported()) {
      setVisible(false)
      return
    }
    try {
      if (window.localStorage.getItem(laterStorageKey(email))) {
        setVisible(false)
        return
      }
    } catch {
      setVisible(true)
      return
    }
    setVisible(true)
  }, [status, email, hasPasskeys])

  const onLater = useCallback(() => {
    if (email) {
      try {
        window.localStorage.setItem(laterStorageKey(email), '1')
      } catch {
        // ignore
      }
    }
    setVisible(false)
  }, [email])

  const onAdd = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      await registerPasskeyFlow('This device')
      await refresh()
      setVisible(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Passkey setup failed')
    } finally {
      setBusy(false)
    }
  }, [refresh])

  if (!visible || !email) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-prompt-title"
    >
      <Card className="shadow-lg w-full max-w-md">
        <CardHeader>
          <CardTitle id="passkey-prompt-title" className="text-lg">
            Add a passkey?
          </CardTitle>
          <CardDescription>
            Sign in faster next time with Face ID, Touch ID, Windows Hello, or
            your security key. You still sign in with Google first on new devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="button" className="w-full" disabled={busy} onClick={() => void onAdd()}>
            {busy ? 'Continuing…' : 'Add passkey'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={onLater}
          >
            Not now
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
