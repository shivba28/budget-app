import { randomBytes } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import { config, googleOAuthConfigured } from '../../auth/config/env.js'
import { hashPin, isValidPinFormat, verifyPin } from '../../auth/pinUtils.js'
import {
  clearPinUnlockForGoogleSub,
  createSession,
  deleteSession,
  getLatestRefreshTokenForGoogleSub,
  getSession,
  isPinUnlocked,
  setPinVerified,
  touchSessionExpiry,
  updateSessionRecord,
} from '../../auth/sessionStoreFile.js'
import { SESSION_COOKIE, sessionIdFromRequest } from '../../auth/bearer.js'
import {
  apiCookieSecure,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from '../../auth/sessionCookieOptions.js'
import { hasAnyCredential } from '../../auth/credentialStoreFile.js'
import {
  clearUserPin,
  getUserPinHash,
  setUserPinHash,
} from '../../auth/userPinStore.js'
import { dbEnabled } from '../../db/pool.js'
import { upsertUser } from '../../db/users.js'

const OAUTH_STATE_COOKIE = 'budget_oauth_state'
const OAUTH_INTENT_COOKIE = 'budget_oauth_intent'

function authMeDebugEnabled(): boolean {
  if (!config.isProd) return true
  const v = process.env['AUTH_ME_DEBUG']?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  return u.toString()
}

function oauthClient(): OAuth2Client {
  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  )
}

const baseCookie = {
  httpOnly: true,
  secure: apiCookieSecure(),
  sameSite: config.cookieSameSite,
  path: '/',
}

export function applyAuthRoutes(app: Express): void {
  app.get('/api/auth/google/start', (req: Request, res: Response) => {
    if (!googleOAuthConfigured()) {
      res.status(503).json({ error: 'Google OAuth is not configured on the server' })
      return
    }
    const intent =
      typeof req.query['intent'] === 'string' ? req.query['intent'] : ''
    const pinReset = intent === 'pin_reset'
    const state = randomBytes(24).toString('hex')
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...baseCookie,
      maxAge: 10 * 60 * 1000,
      signed: true,
    })
    if (pinReset) {
      res.cookie(OAUTH_INTENT_COOKIE, 'pin_reset', {
        ...baseCookie,
        maxAge: 10 * 60 * 1000,
        signed: true,
      })
    }
    const client = oauthClient()
    const url = client.generateAuthUrl({
      access_type: 'online',
      prompt: config.googleOauthPrompt ?? 'select_account consent',
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      state,
    })
    res.redirect(302, url)
  })

  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    if (!googleOAuthConfigured()) {
      res.redirect(
        appendQuery(config.frontendUrl, { sync: 'error', reason: 'not_configured' }),
      )
      return
    }
    const code = req.query['code']
    const state = req.query['state']
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.redirect(
        appendQuery(config.frontendUrl, { sync: 'error', reason: 'missing_code' }),
      )
      return
    }
    const expectedState = req.signedCookies?.[OAUTH_STATE_COOKIE]
    if (!expectedState || expectedState !== state) {
      res.redirect(
        appendQuery(config.frontendUrl, { sync: 'error', reason: 'bad_state' }),
      )
      return
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookie, signed: true })
    const intent = req.signedCookies?.[OAUTH_INTENT_COOKIE]
    const pinResetIntent = intent === 'pin_reset'
    if (pinResetIntent) {
      res.clearCookie(OAUTH_INTENT_COOKIE, { ...baseCookie, signed: true })
    }

    try {
      const client = oauthClient()
      const { tokens } = await client.getToken(code)
      client.setCredentials(tokens)
      const oauth2 = google.oauth2({ version: 'v2', auth: client })
      const { data } = await oauth2.userinfo.get()
      const email = data.email ?? ''
      const googleSub = data.id ?? ''
      if (!googleSub) {
        res.redirect(
          appendQuery(config.frontendUrl, { sync: 'error', reason: 'no_user_id' }),
        )
        return
      }

      const refreshToken =
        (tokens.refresh_token as string | undefined) ??
        (await getLatestRefreshTokenForGoogleSub(googleSub))

      if (pinResetIntent) {
        clearUserPin(googleSub)
        clearPinUnlockForGoogleSub(googleSub)
      }

      if (dbEnabled()) {
        const profile = data as {
          name?: string | null
          picture?: string | null
        }
        try {
          await upsertUser({
            id: googleSub,
            email,
            name: typeof profile.name === 'string' ? profile.name : null,
            avatarUrl:
              typeof profile.picture === 'string' ? profile.picture : null,
          })
        } catch (dbErr) {
          console.error('[auth/google/callback] user upsert failed', dbErr)
          res.redirect(
            appendQuery(config.frontendUrl, { sync: 'error', reason: 'user_db' }),
          )
          return
        }
      }

      const sessionId = createSession({
        refreshToken: refreshToken ?? null,
        googleSub,
        email,
      })
      res.cookie(
        SESSION_COOKIE,
        sessionId,
        sessionCookieOptions(config.sessionMaxMs),
      )
      /** Session is now carried via httpOnly cookie (no token in URL). */
      const frontWithSync = appendQuery(config.frontendUrl, {
        sync: 'ok',
        ...(pinResetIntent ? { pin_reset: '1' } : {}),
      })
      res.redirect(302, frontWithSync)
    } catch (err) {
      console.error('[api/auth/google/callback] token exchange failed', err)
      res.redirect(
        appendQuery(config.frontendUrl, { sync: 'error', reason: 'token_exchange' }),
      )
    }
  })

  app.get('/api/auth/me', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    const sid = sessionIdFromRequest(req)
    if (!sid) {
      res.json({
        authenticated: false as const,
        pinConfigured: false,
        pinUnlocked: false,
        hasPasskeys: false,
        hasPin: false,
        ...(authMeDebugEnabled()
          ? {
              authDebug: 'no_budget_sid_cookie' as const,
              ...(!config.isProd
                ? {
                    devHint:
                      'No budget_sid cookie on this request. For cross-origin (Vercel + API host): COOKIE_SAMESITE=none, HTTPS, FRONTEND_ORIGIN must match the app URL, and VITE_API_URL must point at this API. On http://localhost with COOKIE_SAMESITE=none, set COOKIE_SECURE=false or use the Vite /api proxy with VITE_API_URL unset.',
                  }
                : {}),
            }
          : {}),
      })
      return
    }
    void (async () => {
      const rec = getSession(sid)
      if (!rec) {
        res.json({
          authenticated: false as const,
          pinConfigured: false,
          pinUnlocked: false,
          hasPasskeys: false,
          hasPin: false,
          ...(authMeDebugEnabled()
            ? {
                authDebug: 'session_unknown_or_expired' as const,
                ...(!config.isProd
                  ? {
                      devHint:
                        'Cookie was sent but this session id is not in the server store (expired row, or API lost sessions.json e.g. Render redeploy without persistent disk). Sign in with Google again.',
                    }
                  : {}),
              }
            : {}),
        })
        return
      }
      const pinHash = getUserPinHash(rec.googleSub)
      const hasPasskeys = hasAnyCredential(rec.googleSub)
      const hasPin = Boolean(pinHash)
      const pinConfigured = hasPin || hasPasskeys
      const pinUnlocked = pinConfigured ? isPinUnlocked(rec) : false
      touchSessionExpiry(sid, { extendPinActivity: false })
      res.json({
        authenticated: true as const,
        email: rec.email,
        pinConfigured,
        pinUnlocked,
        hasPasskeys,
        hasPin,
      })
    })()
  })

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    void (async () => {
      const sid = sessionIdFromRequest(req)
      if (sid) {
        await deleteSession(sid)
      }
      res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions())
      res.status(204).send()
    })()
  })

  /** Extends PIN inactivity window when already unlocked (via {@link touchSessionExpiry} in requireAuthSession). */
  app.post('/api/auth/pin/heartbeat', (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    res.status(204).send()
  })

  function requireAuthSession(
    req: Request,
    res: Response,
  ): { sid: string; rec: NonNullable<ReturnType<typeof getSession>> } | null {
    const sid = sessionIdFromRequest(req)
    if (!sid) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    const rec = getSession(sid)
    if (!rec) {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    }
    touchSessionExpiry(sid)
    const fresh = getSession(sid)
    return { sid, rec: fresh ?? rec }
  }

  app.post('/api/auth/pin/set', async (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    const { sid, rec } = auth
    if (getUserPinHash(rec.googleSub)) {
      res.status(400).json({ error: 'PIN already set. Use change or reset flow.' })
      return
    }
    const body = req.body as { pin?: unknown; pinConfirm?: unknown }
    const pin = typeof body.pin === 'string' ? body.pin : ''
    const pinConfirm =
      typeof body.pinConfirm === 'string' ? body.pinConfirm : ''
    if (!isValidPinFormat(pin) || pin !== pinConfirm) {
      res.status(400).json({ error: 'Enter matching 4-digit codes.' })
      return
    }
    const h = await hashPin(pin)
    setUserPinHash(rec.googleSub, h)
    setPinVerified(sid)
    res.status(204).send()
  })

  app.post('/api/auth/pin/verify', async (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    const { sid, rec } = auth
    const hash = getUserPinHash(rec.googleSub)
    if (!hash) {
      res.status(400).json({ error: 'No PIN configured' })
      return
    }
    const lockedUntil = rec.pinLockedUntil
      ? Date.parse(rec.pinLockedUntil)
      : NaN
    if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
      res.status(429).json({ error: 'Too many attempts. Try again later.' })
      return
    }
    const body = req.body as { pin?: unknown }
    const pin = typeof body.pin === 'string' ? body.pin : ''
    if (!isValidPinFormat(pin)) {
      res.status(400).json({ error: 'Invalid PIN format' })
      return
    }
    const ok = await verifyPin(pin, hash)
    if (!ok) {
      const failures = (rec.pinFailures ?? 0) + 1
      const lock =
        failures >= config.maxPinAttempts
          ? new Date(Date.now() + config.pinLockoutMs).toISOString()
          : null
      updateSessionRecord(sid, {
        pinFailures: lock ? 0 : failures,
        pinLockedUntil: lock,
      })
      res.status(401).json({ error: 'Incorrect PIN' })
      return
    }
    setPinVerified(sid)
    res.status(204).send()
  })

  app.post('/api/auth/pin/change', async (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    const { sid, rec } = auth
    const hash = getUserPinHash(rec.googleSub)
    if (!hash) {
      res.status(400).json({ error: 'No PIN to change' })
      return
    }
    if (!isPinUnlocked(rec)) {
      res.status(403).json({ error: 'Unlock the app with your PIN first.' })
      return
    }
    const body = req.body as {
      currentPin?: unknown
      newPin?: unknown
      newPinConfirm?: unknown
    }
    const currentPin =
      typeof body.currentPin === 'string' ? body.currentPin : ''
    const newPin = typeof body.newPin === 'string' ? body.newPin : ''
    const newPinConfirm =
      typeof body.newPinConfirm === 'string' ? body.newPinConfirm : ''
    if (
      !isValidPinFormat(currentPin) ||
      !isValidPinFormat(newPin) ||
      newPin !== newPinConfirm
    ) {
      res.status(400).json({ error: 'Invalid or mismatched codes.' })
      return
    }
    if (!(await verifyPin(currentPin, hash))) {
      res.status(401).json({ error: 'Current PIN is incorrect.' })
      return
    }
    setUserPinHash(rec.googleSub, await hashPin(newPin))
    setPinVerified(sid)
    res.status(204).send()
  })
}
