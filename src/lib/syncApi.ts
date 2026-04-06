import * as storage from '@/lib/storage'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types'

/** Unified API origin. Paths add `/api/auth/...`. */
export function getSyncApiBase(): string {
  const u = import.meta.env.VITE_API_URL
  if (typeof u === 'string' && u.trim() !== '') {
    return u.replace(/\/$/, '')
  }
  const legacy = import.meta.env.VITE_SYNC_API_URL
  if (typeof legacy === 'string' && legacy.trim() !== '') {
    return legacy.replace(/\/$/, '')
  }
  // Same-origin as the Vite app so session cookies match /api proxy (see api.ts teller default).
  return ''
}

export function getAuthToken(): string | null {
  return null
}

export function setAuthToken(token: string | null): void {
  void token
}

export function captureAuthTokenFromUrl(): boolean {
  try {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const hashParams = new URLSearchParams(hash)
    let token = hashParams.get('token')
    if (token) {
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

/** Bump PIN idle activity on the server (no-op if locked). Throttle on the client. */
export async function postPinHeartbeat(): Promise<boolean> {
  try {
    const r = await fetch(`${getSyncApiBase()}/api/auth/pin/heartbeat`, {
      method: 'POST',
      credentials: 'include',
    })
    return r.ok
  } catch {
    return false
  }
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  try {
    const r = await fetch(`${getSyncApiBase()}/api/auth/me`, {
      credentials: 'include',
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
  await fetch(
    `${getSyncApiBase()}/api/auth/logout`,
    { method: 'POST', credentials: 'include' },
  )
  storage.clearAll()
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPin, newPin, newPinConfirm }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not change PIN')
  }
}

export type WebAuthnRegisterCheckResponse = {
  hasPasskeys: boolean
  credentialCount: number
  lastUsedAt: string | null
}

export async function webAuthnRegisterCheck(): Promise<WebAuthnRegisterCheckResponse> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/register/check`, {
    credentials: 'include',
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
  user: { sub: string; email: string }
}

export async function webAuthnAuthenticateVerify(
  credential: AuthenticationResponseJSON,
): Promise<WebAuthnAuthenticateVerifyResponse> {
  const r = await fetch(`${getSyncApiBase()}/api/auth/webauthn/authenticate/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    credentials: 'include',
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
      credentials: 'include',
    },
  )
  if (!r.ok && r.status !== 204) {
    const err = await r.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : r.statusText
    throw new Error(msg || 'Could not remove passkey')
  }
}
