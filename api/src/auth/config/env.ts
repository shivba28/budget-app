function listEnv(name: string, fallback: string): string[] {
  const raw = process.env[name] ?? fallback
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Avoid `Number(env) || d` — some deploy analyzers reject that BinaryExpression shape. */
function envPort(defaultVal: number): number {
  const raw = process.env['PORT']
  if (raw === undefined || raw === '') return defaultVal
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : defaultVal
}

function envPositiveMs(name: string, defaultMs: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultMs
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : defaultMs
}

function envMsOrDefault(name: string, defaultMs: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultMs
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return defaultMs
  return n
}

/** CORS + OAuth: merge FRONTEND_ORIGIN list with optional single FRONTEND_URL (e.g. Vercel). */
function mergeFrontendOrigins(): string[] {
  const base = listEnv(
    'FRONTEND_ORIGIN',
    'http://localhost:5174,http://localhost:5173,http://127.0.0.1:5174,http://127.0.0.1:5173',
  )
  const u = process.env['FRONTEND_URL']?.trim()
  return [...new Set([...base, ...(u ? [u] : [])])]
}

export const config = {
  port: envPort(4000),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  isProd: process.env['NODE_ENV'] === 'production',
  frontendOrigins: mergeFrontendOrigins(),
  googleRedirectUri:
    process.env['GOOGLE_REDIRECT_URI'] ??
    'http://localhost:4000/api/auth/google/callback',
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
  sessionSecret: process.env['SESSION_SECRET'] ?? 'dev-insecure-change-me',
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:5174',
  dataDir: process.env['DATA_DIR'] ?? 'data',
  /**
   * Google `prompt` param (e.g. `consent`, `select_account`, or `select_account consent`).
   * If unset, auth routes default to `select_account` only. Set `GOOGLE_OAUTH_PROMPT=consent` when you need
   * Google to re-issue a refresh token.
   * @see https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters
   */
  googleOauthPrompt: process.env['GOOGLE_OAUTH_PROMPT']?.trim() || undefined,
  cookieSameSite:
    process.env['COOKIE_SAMESITE'] === 'none'
      ? ('none' as const)
      : ('lax' as const),
  /** Sliding session lifetime after each authenticated request */
  sessionMaxMs: 30 * 24 * 60 * 60 * 1000,
  /**
   * How long PIN / passkey unlock lasts before asking again (absolute ceiling).
   * Override with PIN_UNLOCK_MS (milliseconds); default 12 hours.
   */
  pinUnlockMs: envPositiveMs('PIN_UNLOCK_MS', 12 * 60 * 60 * 1000),
  /**
   * Re-prompt for PIN/passkey after this much idle time (no API activity that extends the window).
   * Set PIN_INACTIVITY_TIMEOUT_MS=0 to disable (only PIN_UNLOCK_MS applies).
   */
  pinInactivityTimeoutMs: (() => {
    const raw = process.env['PIN_INACTIVITY_TIMEOUT_MS']
    if (raw === undefined || raw === '') return 15 * 60 * 1000
    const n = Number(raw)
    if (!Number.isFinite(n)) return 15 * 60 * 1000
    if (n === 0) return 0
    return n > 0 ? n : 15 * 60 * 1000
  })(),
  maxPinAttempts: 5,
  pinLockoutMs: 15 * 60 * 1000,
  /** WebAuthn RP ID = frontend hostname (no port in prod; localhost for dev) */
  webauthnRpId: process.env['WEBAUTHN_RP_ID'] ?? 'localhost',
  webauthnRpName: process.env['WEBAUTHN_RP_NAME'] ?? 'Budget Tracker',
  /** Comma-separated allowed origins, e.g. http://localhost:5173,https://app.example.com */
  webauthnOrigins: listEnv(
    'WEBAUTHN_ORIGIN',
    'http://localhost:5174,http://localhost:5173,http://127.0.0.1:5174,http://127.0.0.1:5173',
  ),
  webauthnChallengeMs: envMsOrDefault('CHALLENGE_EXPIRATION_MS', 300_000),
  /** Max failed WebAuthn auth verifications per googleSub per hour before lockout */
  webauthnMaxAuthFailures: 5,
  webauthnAuthLockoutMs: 60 * 60 * 1000,
}

export function googleOAuthConfigured(): boolean {
  return Boolean(
    config.googleClientId && config.googleClientSecret && config.googleRedirectUri,
  )
}
