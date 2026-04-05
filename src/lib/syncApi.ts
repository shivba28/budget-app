import { clearDriveSyncStatus } from '@/lib/cloudBackup/driveSyncStatus'
import { SESSION_BOOTSTRAP_KEY } from '@/lib/cloudBackup/keys'
import * as storage from '@/lib/storage'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types'

const AUTH_TOKEN_KEY = 'budget_auth_token'

/** Unified API origin (auth + Drive sync). Paths add `/api/auth/...`, `/api/sync/...`. */
export function getSyncApiBase(): string {
  const u = import.meta.env.VITE_API_URL
  if (typeof u === 'string' && u.trim() !== '') {
    return u.replace(/\/$/, '')
  }
  const legacy = import.meta.env.VITE_SYNC_API_URL
  if (typeof legacy === 'string' && legacy.trim() !== '') {
    return legacy.replace(/\/$/, '')
  }
  return 'http://localhost:4000'
}

export function getAuthToken(): string | null {
  try {
    const t = window.localStorage.getItem(AUTH_TOKEN_KEY)
    return t && t.trim() !== '' ? t : null
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (!token) window.localStorage.removeItem(AUTH_TOKEN_KEY)
    else window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

export function captureAuthTokenFromUrl(): boolean {
  try {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const hashParams = new URLSearchParams(hash)
    let token = hashParams.get('token')
    if (token) {
      setAuthToken(token)
      hashParams.delete('token')
      const nextHash = hashParams.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`,
      )
      return true
    }
    const qs = new URLSearchParams(window.location.search)
    token = qs.get('token')
    if (token) {
      setAuthToken(token)
      qs.delete('token')
      const nextSearch = qs.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
      )
      return true
    }
    return false
  } catch {
    return false
  }
}

function authHeaders(): HeadersInit | undefined {
  const t = getAuthToken()
  if (!t) return undefined
  return { Authorization: `Bearer ${t}` }
}

export type AuthMeResponse =
  | {
      authenticated: false
      pinConfigured: boolean
      pinUnlocked: boolean
      hasPasskeys: boolean
      hasPin: boolean
      /** Present in development when the server explains missing/invalid session */
      devHint?: string
    }
  | {
      authenticated: true
      email: string
      pinConfigured: boolean
      pinUnlocked: boolean
      hasPasskeys: boolean
      hasPin: boolean
    }

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  try {
    const h = authHeaders()
    const r = await fetch(`${getSyncApiBase()}/api/auth/me`, {
      headers: h ? { ...h } : undefined,
    })
    if (!r.ok) {
      return {
        authenticated: false,
        pinConfigured: false,
        pinUnlocked: false,
        hasPasskeys: false,
        hasPin: false,
      }
    }
    return (await r.json()) as AuthMeResponse
  } catch {
    return {
      authenticated: false,
      pinConfigured: false,
      pinUnlocked: false,
      hasPasskeys: false,
      hasPin: false,
    }
  }
}

export async function logoutSync(): Promise<void> {
  const h = authHeaders()
  await fetch(
    `${getSyncApiBase()}/api/auth/logout`,
    h ? { method: 'POST', headers: h } : { method: 'POST' },
  )
  setAuthToken(null)
  storage.clearAll()
  clearDriveSyncStatus()
  try {
    window.sessionStorage.removeItem(SESSION_BOOTSTRAP_KEY)
  } catch {
    // ignore
  }
}

export function startGoogleSignIn(intent?: 'pin_reset'): void {
  const base = getSyncApiBase().replace(/\/$/, '')
  const path = `${base}/api/auth/google/start${intent === 'pin_reset' ? '?intent=pin_reset' : ''}`
  const href = base.startsWith('http')
    ? path
    : `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`
  window.location.assign(href)
}

export async function setPinRequest(pin: string, pinConfirm: string): Promise<void> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/pin/set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify({ pin, pinConfirm }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not save PIN')
  }
}

export async function verifyPinRequest(pin: string): Promise<void> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/pin/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify({ pin }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Incorrect PIN')
  }
}

export async function changePinRequest(
  currentPin: string,
  newPin: string,
  newPinConfirm: string,
): Promise<void> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/pin/change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify({ currentPin, newPin, newPinConfirm }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not change PIN')
  }
}

export async function pushBackupToServer(body: unknown): Promise<void> {
  const r = await fetch(`${getSyncApiBase()}/api/sync/backup`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Upload failed')
  }
}

export async function pullBackupFromServer(): Promise<string | null> {
  const h = authHeaders()
  const r = await fetch(`${getSyncApiBase()}/api/sync/backup`, {
    headers: h ? { ...h } : undefined,
  })
  if (r.status === 404) return null
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Download failed')
  }
  return r.text()
}

export type WebAuthnRegisterCheckResponse = {
  hasPasskeys: boolean
  credentialCount: number
  lastUsedAt: string | null
}

export async function webAuthnRegisterCheck(): Promise<WebAuthnRegisterCheckResponse> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/register/check`, {
    headers: { ...(authHeaders() ?? {}) },
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not check passkeys')
  }
  return (await r.json()) as WebAuthnRegisterCheckResponse
}

export async function webAuthnRegisterStart(body?: {
  device?: string
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/register/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not start passkey registration')
  }
  return (await r.json()) as PublicKeyCredentialCreationOptionsJSON
}

export async function webAuthnRegisterVerify(
  credential: RegistrationResponseJSON,
): Promise<void> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/register/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify(credential),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg =
      typeof err?.message === 'string'
        ? err.message
        : typeof err?.error === 'string'
          ? err.error
          : r.statusText
    throw new Error(msg || 'Passkey registration failed')
  }
}

export async function webAuthnAuthenticateStart(body?: {
  googleSub?: string
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/authenticate/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not start passkey sign-in')
  }
  return (await r.json()) as PublicKeyCredentialRequestOptionsJSON
}

export type WebAuthnAuthenticateVerifyResponse = {
  success: boolean
  token: string
  user: { sub: string; email: string }
}

export async function webAuthnAuthenticateVerify(
  credential: AuthenticationResponseJSON,
): Promise<WebAuthnAuthenticateVerifyResponse> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/authenticate/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders() ?? {}),
    },
    body: JSON.stringify(credential),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg =
      typeof err?.message === 'string'
        ? err.message
        : typeof err?.error === 'string'
          ? err.error
          : r.statusText
    throw new Error(msg || 'Passkey sign-in failed')
  }
  return (await r.json()) as WebAuthnAuthenticateVerifyResponse
}

export type WebAuthnCredentialRow = {
  credentialId: string
  device: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

export async function webAuthnListCredentials(): Promise<WebAuthnCredentialRow[]> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/credentials`, {
    headers: { ...(authHeaders() ?? {}) },
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not list passkeys')
  }
  const data = (await r.json()) as { credentials: WebAuthnCredentialRow[] }
  return data.credentials ?? []
}

export async function webAuthnDeleteCredential(credentialId: string): Promise<void> {
  const enc = encodeURIComponent(credentialId)
  const r = await fetch(
    `${getSyncApiBase()}/api/auth/webauthn/credential/${enc}`,
    {
      method: 'DELETE',
      headers: { ...(authHeaders() ?? {}) },
    },
  )
  if (!r.ok && r.status !== 204) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not remove passkey')
  }
}
