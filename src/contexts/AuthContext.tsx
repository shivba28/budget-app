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
  /** Client-side screen lock due to inactivity (independent of server idle lock). */
  readonly clientLocked: boolean
  readonly clearClientLock: () => void
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
  const [clientLocked, setClientLocked] = useState(false)
  const bootstrapOnce = useRef(false)
  const lastPinHeartbeatAt = useRef(0)

  const clearClientLock = useCallback(() => setClientLocked(false), [])

  const effectiveStatus: AuthStatus =
    clientLocked && status === 'ready' ? 'need_unlock' : status

  const refresh = useCallback(async () => {
    const me = await fetchAuthMe()
    if (me.authenticated) {
      const prev = window.localStorage.getItem(storage.KEYS.lastAuthEmail)
      if (prev !== null && prev !== me.email) {
        storage.clearAll()
        bootstrapOnce.current = false
        setClientLocked(false)
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
      setClientLocked(false)
    }
    setEmail(me.authenticated ? me.email : null)
    setHasPasskeys(me.authenticated ? me.hasPasskeys : false)
    setHasPin(me.authenticated ? me.hasPin : false)
    setStatus(deriveStatus(me))
  }, [])

  const onUnlocked = useCallback(async () => {
    if (bootstrapOnce.current) return
    bootstrapOnce.current = true
    setClientLocked(false)
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
    if (effectiveStatus !== 'ready') return
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
  }, [effectiveStatus, refresh])

  /** Client-side inactivity lock: force /unlock after N minutes of no user input. */
  useEffect(() => {
    if (effectiveStatus !== 'ready') return

    const DEFAULT_MS = 15 * 60 * 1000
    const raw = import.meta.env.VITE_PIN_INACTIVITY_TIMEOUT_MS
    const parsed =
      typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    const inactivityMs =
      Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MS
    if (inactivityMs === 0) return

    let timeoutId: number | null = null
    let lastActivityAt = Date.now()
    let lastResetAt = 0
    const RESET_THROTTLE_MS = 2_000

    const schedule = (): void => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      const remaining = Math.max(0, inactivityMs - (Date.now() - lastActivityAt))
      timeoutId = window.setTimeout(() => {
        setClientLocked(true)
      }, remaining)
    }

    const markActivity = (): void => {
      const now = Date.now()
      if (now - lastResetAt < RESET_THROTTLE_MS) return
      lastResetAt = now
      lastActivityAt = now
      schedule()
    }

    schedule()

    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('pointerdown', markActivity, opts)
    window.addEventListener('keydown', markActivity)
    window.addEventListener('mousemove', markActivity, opts)
    window.addEventListener('touchstart', markActivity, opts)
    window.addEventListener('scroll', markActivity, opts)
    window.addEventListener('focus', markActivity)
    document.addEventListener('visibilitychange', markActivity)

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      window.removeEventListener('pointerdown', markActivity, opts)
      window.removeEventListener('keydown', markActivity)
      window.removeEventListener('mousemove', markActivity, opts)
      window.removeEventListener('touchstart', markActivity, opts)
      window.removeEventListener('scroll', markActivity, opts)
      window.removeEventListener('focus', markActivity)
      document.removeEventListener('visibilitychange', markActivity)
    }
  }, [effectiveStatus])

  const value = useMemo(
    (): AuthContextValue => ({
      status: effectiveStatus,
      email,
      hasPasskeys,
      hasPin,
      refresh,
      onUnlocked,
      lastSyncMessage,
      clearSyncMessage,
      clientLocked,
      clearClientLock,
    }),
    [
      effectiveStatus,
      email,
      hasPasskeys,
      hasPin,
      refresh,
      onUnlocked,
      lastSyncMessage,
      clearSyncMessage,
      clientLocked,
      clearClientLock,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
