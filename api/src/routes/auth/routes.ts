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
import { bearerToken } from '../../auth/bearer.js'
import { hasAnyCredential } from '../../auth/credentialStoreFile.js'
import {
  clearUserPin,
  getUserPinHash,
  setUserPinHash,
} from '../../auth/userPinStore.js'

const OAUTH_STATE_COOKIE = 'budget_oauth_state'
const OAUTH_INTENT_COOKIE = 'budget_oauth_intent'

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  return u.toString()
}

function appendHash(url: string, fragment: string): string {
  const u = new URL(url)
  u.hash = fragment.startsWith('#') ? fragment : `#${fragment}`
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
  secure: config.isProd || config.cookieSameSite === 'none',
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
      access_type: 'offline',
      ...(config.googleOauthPrompt ? { prompt: config.googleOauthPrompt } : {}),
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.appdata',
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
        tokens.refresh_token ?? (await getLatestRefreshTokenForGoogleSub(googleSub))
      if (!refreshToken) {
        res.redirect(
          appendQuery(config.frontendUrl, {
            sync: 'error',
            reason: 'no_refresh_token',
          }),
        )
        return
      }

      if (pinResetIntent) {
        clearUserPin(googleSub)
        clearPinUnlockForGoogleSub(googleSub)
      }

      const sessionId = createSession({
        refreshToken,
        googleSub,
        email,
      })
      const frontWithSync = appendQuery(config.frontendUrl, {
        sync: 'ok',
        ...(pinResetIntent ? { pin_reset: '1' } : {}),
      })
      res.redirect(
        appendHash(frontWithSync, `token=${encodeURIComponent(sessionId)}`),
      )
    } catch {
      res.redirect(
        appendQuery(config.frontendUrl, { sync: 'error', reason: 'token_exchange' }),
      )
    }
  })

  app.get('/api/auth/me', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    const sid = bearerToken(req)
    if (!sid) {
      res.json({
        authenticated: false as const,
        pinConfigured: false,
        pinUnlocked: false,
        hasPasskeys: false,
        hasPin: false,
        ...(!config.isProd
          ? {
              devHint:
                'No Authorization: Bearer header. The app stores the session in localStorage (budget_auth_token) and sends it on API calls; opening this URL in the address bar does not.',
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
          ...(!config.isProd
            ? {
                devHint:
                  'Bearer token unknown or session expired. Sign in with Google again from the app.',
              }
            : {}),
        })
        return
      }
      touchSessionExpiry(sid)
      const pinHash = getUserPinHash(rec.googleSub)
      const hasPasskeys = hasAnyCredential(rec.googleSub)
      const hasPin = Boolean(pinHash)
      const pinConfigured = hasPin || hasPasskeys
      const pinUnlocked = pinConfigured ? isPinUnlocked(rec) : false
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
      const sid = bearerToken(req)
      if (sid) {
        await deleteSession(sid)
      }
      res.status(204).send()
    })()
  })

  function requireAuthSession(
    req: Request,
    res: Response,
  ): { sid: string; rec: NonNullable<ReturnType<typeof getSession>> } | null {
    const sid = bearerToken(req)
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
    return { sid, rec }
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
