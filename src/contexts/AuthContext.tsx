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
import { clearBootstrapSessionFlag, runDriveBootstrap } from '@/lib/cloudBackup/bootstrap'
import { clearDriveSyncStatus } from '@/lib/cloudBackup/driveSyncStatus'
import * as storage from '@/lib/storage'
import {
  captureAuthTokenFromUrl,
  fetchAuthMe,
  type AuthMeResponse,
} from '@/lib/syncApi'

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

  const refresh = useCallback(async () => {
    const me = await fetchAuthMe()
    if (me.authenticated) {
      const prev = window.localStorage.getItem(storage.KEYS.lastAuthEmail)
      if (prev !== null && prev !== me.email) {
        storage.clearAll()
        clearDriveSyncStatus()
        clearBootstrapSessionFlag()
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
    const result = await runDriveBootstrap()
    setLastSyncMessage(result.message)
    if (!result.ok) {
      bootstrapOnce.current = false
    }
  }, [])

  /** Run before child useEffects so ?token= is in localStorage before LoginPage calls refresh(). */
  useLayoutEffect(() => {
    captureAuthTokenFromUrl()
  }, [])

  useEffect(() => {
    // OAuth query cleanup + initial / post-OAuth session load
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
          reason === 'no_refresh_token'
            ? 'Google did not return a refresh token. In Google Account → Security → Third-party access, remove this app and sign in again. If it persists, ensure the API server can use prompt=select_account consent (default) or consent.'
            : reason === 'bad_state'
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
    }, 0)
    return () => window.clearTimeout(t)
  }, [refresh])

  const clearSyncMessage = useCallback(() => setLastSyncMessage(null), [])

  useEffect(() => {
    if (!lastSyncMessage) return
    const isDriveBackupToast =
      /Backed up to Google Drive\.|Restored from Google Drive\.|Already synced this session\./i.test(
        lastSyncMessage,
      )
    if (!isDriveBackupToast) return
    const t = window.setTimeout(() => setLastSyncMessage(null), 5000)
    return () => window.clearTimeout(t)
  }, [lastSyncMessage])

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
