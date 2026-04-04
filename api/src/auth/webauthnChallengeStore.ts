import { config } from './config/env.js'

export type RegistrationChallengeMeta = {
  readonly type: 'registration'
  readonly googleSub: string
  readonly email: string
  readonly deviceLabel: string
}

export type AuthenticationChallengeMeta = {
  readonly type: 'authentication'
  readonly googleSub: string
}

type Entry = (RegistrationChallengeMeta | AuthenticationChallengeMeta) & {
  readonly expiresAt: number
}

/** In-memory challenges keyed by base64url challenge string from WebAuthn options. */
const store = new Map<string, Entry>()

function prune(): void {
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
}

setInterval(prune, 60_000).unref?.()

export function setRegistrationChallenge(
  challenge: string,
  meta: Omit<RegistrationChallengeMeta, 'type'>,
): void {
  prune()
  store.set(challenge, {
    type: 'registration',
    ...meta,
    expiresAt: Date.now() + config.webauthnChallengeMs,
  })
}

export function setAuthenticationChallenge(
  challenge: string,
  meta: Omit<AuthenticationChallengeMeta, 'type'>,
): void {
  prune()
  store.set(challenge, {
    type: 'authentication',
    ...meta,
    expiresAt: Date.now() + config.webauthnChallengeMs,
  })
}

export function consumeChallenge(challenge: string): Entry | null {
  prune()
  const e = store.get(challenge)
  if (!e) return null
  if (e.expiresAt <= Date.now()) {
    store.delete(challenge)
    return null
  }
  store.delete(challenge)
  return e
}

export function peekChallenge(challenge: string): Entry | null {
  prune()
  const e = store.get(challenge)
  if (!e || e.expiresAt <= Date.now()) return null
  return e
}
