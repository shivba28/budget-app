import type { ReactElement, ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as storage from '@/lib/storage'
import {
  captureAuthTokenFromUrl,
  fetchAuthMe,
  postPinHeartbeat,
  type AuthMeResponse,
} from '@/lib/syncApi'
import { hydrateServerCachesAfterLogin } from '@/lib/serverData'

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'need_pin_setup'
  | 'need_unlock'
  | 'ready'

type AuthContextValue = {
  readonly status: AuthStatus
  readonly email: string | null
  readonly hasPasskeys: boolean
  readonly hasPin: boolean
  readonly refresh: () => Promise<void>
  readonly onUnlocked: () => Promise<void>
  readonly lastSyncMessage: string | null
  readonly clearSyncMessage: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function deriveStatus(me: AuthMeResponse): AuthStatus {
  if (!me.authenticated) return 'unauthenticated'
  if (!me.pinConfigured) return 'need_pin_setup'
  if (!me.pinUnlocked) return 'need_unlock'
  return 'ready'
}

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [hasPasskeys, setHasPasskeys] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null)
  const bootstrapOnce = useRef(false)
  const lastPinHeartbeatAt = useRef(0)

  const refresh = useCallback(async () => {
    const me = await fetchAuthMe()
    if (me.authenticated) {
      const prev = window.localStorage.getItem(storage.KEYS.lastAuthEmail)
      if (prev !== null && prev !== me.email) {
        storage.clearAll()
        bootstrapOnce.current = false
      }
      try {
        window.localStorage.setItem(storage.KEYS.lastAuthEmail, me.email)
      } catch {
        /* quota */
      }
    } else {
      try {
        window.localStorage.removeItem(storage.KEYS.lastAuthEmail)
      } catch {
        /* ignore */
      }
      bootstrapOnce.current = false
    }
    setEmail(me.authenticated ? me.email : null)
    setHasPasskeys(me.authenticated ? me.hasPasskeys : false)
    setHasPin(me.authenticated ? me.hasPin : false)
    setStatus(deriveStatus(me))
  }, [])

  const onUnlocked = useCallback(async () => {
    if (bootstrapOnce.current) return
    bootstrapOnce.current = true
    try {
      await hydrateServerCachesAfterLogin()
      try {
        window.dispatchEvent(new CustomEvent(storage.BANK_SYNC_COMPLETED_EVENT))
      } catch {
        /* ignore */
      }
    } catch {
      bootstrapOnce.current = false
    }
  }, [])

  /** Legacy cleanup: remove any `token` query/hash param from the URL if present. */
  useLayoutEffect(() => {
    captureAuthTokenFromUrl()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      const sync = params.get('sync')
      if (sync === 'ok') {
        params.delete('sync')
        params.delete('pin_reset')
        const qs = params.toString()
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
        )
      } else if (sync === 'error') {
        const reason = params.get('reason') ?? 'unknown'
        const msg =
          reason === 'bad_state'
            ? 'Sign-in session expired or cookies were blocked. Close other tabs, try again, or use the same browser window for the whole Google sign-in flow.'
            : `Sign-in failed (${reason}).`
        setLastSyncMessage(msg)
        params.delete('sync')
        params.delete('reason')
        const qs = params.toString()
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
        )
      }
      void refresh()
      if (sync === 'ok') {
        // WebKit can apply Set-Cookie from the OAuth redirect slightly after first paint; second /me avoids a false “signed out” state.
        window.setTimeout(() => void refresh(), 300)
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [refresh])

  const clearSyncMessage = useCallback(() => setLastSyncMessage(null), [])

  /** Detect server-side PIN inactivity lock; tab-visible heartbeat extends idle window (throttled). */
  useEffect(() => {
    if (status !== 'ready') return
    const HB_MIN_MS = 60_000
    const tick = () => {
      void refresh()
    }
    const id = window.setInterval(tick, 45_000)
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastPinHeartbeatAt.current >= HB_MIN_MS) {
        lastPinHeartbeatAt.current = now
        void postPinHeartbeat().finally(() => {
          void refresh()
        })
      } else {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [status, refresh])

  const value = useMemo(
    (): AuthContextValue => ({
      status,
      email,
      hasPasskeys,
      hasPin,
      refresh,
      onUnlocked,
      lastSyncMessage,
      clearSyncMessage,
    }),
    [
      status,
      email,
      hasPasskeys,
      hasPin,
      refresh,
      onUnlocked,
      lastSyncMessage,
      clearSyncMessage,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
