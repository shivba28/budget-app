export const META = {
  ONBOARDING_COMPLETE: 'onboarding_complete',
  INACTIVITY_TIMEOUT_MS: 'inactivity_timeout_ms',
  LAST_UNLOCK_AT: 'last_unlock_at',
} as const

/** Legacy key from removed Google sign-in — cleared on hydrate. */
export const LEGACY_GOOGLE_USER_KEY = 'google_user' as const

export const SECURE = {
  PIN_HASH: 'auth_pin_hash',
  PIN_FAIL_COUNT: 'auth_pin_fail_count',
  PIN_LOCKOUT_UNTIL: 'auth_pin_lockout_until',
} as const

/**
 * Lockout durations after each consecutive failure block.
 * Index 0 = after 5th fail, 1 = 6th, 2 = 7th, 3 = 8th, 4 = 9th.
 * 10th failure triggers a wipe prompt instead of a timed lockout.
 */
export const PIN_LOCKOUT_DURATIONS_MS = [
  30_000,      // 5 fails  → 30s
  120_000,     // 6 fails  → 2m
  600_000,     // 7 fails  → 10m
  1_800_000,   // 8 fails  → 30m
  3_600_000,   // 9 fails  → 1h
] as const

export const PIN_MAX_ATTEMPTS = 10

export const DEFAULT_INACTIVITY_MS = 900_000
