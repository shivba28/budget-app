function listEnv(name: string, fallback: string): string[] {
  const raw = process.env[name] ?? fallback
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
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
  port: Number(process.env['PORT']) || 4000,
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
  googleOauthPrompt:
    process.env['GOOGLE_OAUTH_PROMPT'] === 'consent' ? 'consent' : undefined,
  cookieSameSite:
    process.env['COOKIE_SAMESITE'] === 'none'
      ? ('none' as const)
      : ('lax' as const),
  /** Sliding session lifetime after each authenticated request */
  sessionMaxMs: 30 * 24 * 60 * 60 * 1000,
  /**
   * How long PIN / passkey unlock lasts before asking again.
   * Override with PIN_UNLOCK_MS (milliseconds); default 12 hours.
   */
  pinUnlockMs:
    Number(process.env['PIN_UNLOCK_MS']) > 0
      ? Number(process.env['PIN_UNLOCK_MS'])
      : 12 * 60 * 60 * 1000,
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
  webauthnChallengeMs: Number(process.env['CHALLENGE_EXPIRATION_MS']) || 300_000,
  /** Max failed WebAuthn auth verifications per googleSub per hour before lockout */
  webauthnMaxAuthFailures: 5,
  webauthnAuthLockoutMs: 60 * 60 * 1000,
}

export function googleOAuthConfigured(): boolean {
  return Boolean(
    config.googleClientId && config.googleClientSecret && config.googleRedirectUri,
  )
}
