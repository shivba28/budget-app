export const META = {
  ONBOARDING_COMPLETE: 'onboarding_complete',
  INACTIVITY_TIMEOUT_MS: 'inactivity_timeout_ms',
  LAST_UNLOCK_AT: 'last_unlock_at',
} as const

/** Legacy key from removed Google sign-in — cleared on hydrate. */
export const LEGACY_GOOGLE_USER_KEY = 'google_user' as const

export const SECURE = {
  PIN_HASH: 'auth_pin_hash',
} as const

export const DEFAULT_INACTIVITY_MS = 900_000
