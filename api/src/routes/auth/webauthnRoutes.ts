import { createHash } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { decodeClientDataJSON } from '@simplewebauthn/server/helpers'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types'
import { config } from '../../auth/config/env.js'
import {
  addCredential,
  credentialSummary,
  findCredentialById,
  listCredentials,
  removeCredential,
  toAuthenticatorDevice,
  updateCredentialAfterAuth,
} from '../../auth/credentialStoreFile.js'
import {
  createSession,
  deleteSession,
  getLatestEmailForGoogleSub,
  getLatestRefreshTokenForGoogleSub,
  getSession,
  isPinUnlocked,
  setSecondFactorVerified,
} from '../../auth/sessionStoreFile.js'
import { bearerToken, requireAuthSession } from '../../auth/webauthnRouteHelpers.js'
import { SESSION_COOKIE, sessionIdFromRequest } from '../../auth/bearer.js'
import { sessionCookieOptions } from '../../auth/sessionCookieOptions.js'
import {
  consumeChallenge,
  setAuthenticationChallenge,
  setRegistrationChallenge,
} from '../../auth/webauthnChallengeStore.js'
import {
  clearWebAuthnAuthFailures,
  isWebAuthnAuthLocked,
  recordWebAuthnAuthFailure,
} from '../../auth/webauthnRateLimit.js'

function userIdBytes(googleSub: string): Uint8Array {
  const te = new TextEncoder().encode(googleSub)
  if (te.length <= 64) return te
  const h = createHash('sha256').update(googleSub).digest()
  return new Uint8Array(h)
}

function clientIp(req: Request): string {
  const x = req.headers['x-forwarded-for']
  if (typeof x === 'string' && x.split(',')[0]) return x.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

function resolveGoogleSub(
  req: Request,
  res: Response,
  bodySub?: unknown,
): string | null {
  const sid = sessionIdFromRequest(req)
  if (sid) {
    const rec = getSession(sid)
    if (rec) return rec.googleSub
  }
  if (typeof bodySub === 'string' && bodySub.trim()) return bodySub.trim()
  res.status(400).json({ error: 'Missing googleSub or valid session' })
  return null
}

export function applyWebAuthnRoutes(app: Express): void {
  app.get('/api/auth/webauthn/register/check', (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    const sum = credentialSummary(auth.rec.googleSub)
    res.json({
      hasPasskeys: sum.hasPasskeys,
      credentialCount: sum.credentialCount,
      lastUsedAt: sum.lastUsedAt,
    })
  })

  app.get('/api/auth/webauthn/credentials', (req: Request, res: Response) => {
    const auth = requireAuthSession(req, res)
    if (!auth) return
    const list = listCredentials(auth.rec.googleSub).map((c) => ({
      credentialId: c.credentialId,
      device: c.device,
      name: c.name,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    }))
    res.json({ credentials: list })
  })

  app.post(
    '/api/auth/webauthn/register/start',
    async (req: Request, res: Response) => {
      const auth = requireAuthSession(req, res)
      if (!auth) return
      const { rec } = auth
      const body = req.body as { device?: unknown }
      const deviceLabel =
        typeof body.device === 'string' && body.device.trim()
          ? body.device.trim().slice(0, 120)
          : 'This device'
      try {
        const excludeCredentials = listCredentials(rec.googleSub).map((c) => ({
          id: c.credentialId,
          transports: c.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[],
        }))
        const options = await generateRegistrationOptions({
          rpName: config.webauthnRpName,
          rpID: config.webauthnRpId,
          userName: rec.email,
          userDisplayName: rec.email,
          userID: userIdBytes(rec.googleSub),
          attestationType: 'direct',
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'required',
          },
          excludeCredentials,
        })
        if (!options.challenge) {
          res.status(500).json({ error: 'No challenge generated' })
          return
        }
        setRegistrationChallenge(options.challenge, {
          googleSub: rec.googleSub,
          email: rec.email,
          deviceLabel,
        })
        res.json(options)
      } catch (e) {
        console.error('[webauthn] register/start', e)
        res.status(500).json({ error: 'WebAuthn registration start failed' })
      }
    },
  )

  app.post(
    '/api/auth/webauthn/register/verify',
    async (req: Request, res: Response) => {
      const auth = requireAuthSession(req, res)
      if (!auth) return
      const { sid, rec } = auth
      const response = req.body as RegistrationResponseJSON
      if (!response?.response?.clientDataJSON) {
        res.status(400).json({ error: 'Invalid body' })
        return
      }
      let challengeKey: string
      try {
        const clientData = decodeClientDataJSON(response.response.clientDataJSON)
        challengeKey = clientData.challenge
      } catch {
        res.status(400).json({ error: 'Invalid clientDataJSON' })
        return
      }
      const meta = consumeChallenge(challengeKey)
      if (!meta || meta.type !== 'registration') {
        res.status(400).json({ error: 'challenge_expired', message: 'Registration challenge expired. Start again.' })
        return
      }
      if (meta.googleSub !== rec.googleSub) {
        res.status(403).json({ error: 'Challenge mismatch' })
        return
      }
      try {
        const verified = await verifyRegistrationResponse({
          response,
          expectedChallenge: challengeKey,
          expectedOrigin: config.webauthnOrigins,
          expectedRPID: config.webauthnRpId,
          requireUserVerification: true,
        })
        if (!verified.verified || !verified.registrationInfo) {
          res.status(400).json({ error: 'Attestation verification failed' })
          return
        }
        const info = verified.registrationInfo
        const publicKeyB64 = Buffer.from(info.credentialPublicKey).toString(
          'base64url',
        )
        addCredential(rec.googleSub, {
          credentialId: info.credentialID,
          publicKey: publicKeyB64,
          counter: info.counter,
          transports: response.response.transports
            ? [...response.response.transports]
            : [],
          device: meta.deviceLabel,
        })
        setSecondFactorVerified(sid, 'passkey')
        console.info(
          `[webauthn] registered credential googleSub=${rec.googleSub} id=${info.credentialID.slice(0, 8)}…`,
        )
        res.json({
          success: true,
          message: 'Passkey registered successfully',
          credentialId: info.credentialID,
          device: meta.deviceLabel,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('already registered') || msg.includes('Credential already')) {
          res.status(409).json({ error: 'Credential already exists' })
          return
        }
        console.error('[webauthn] register/verify', e)
        res.status(400).json({ error: 'Verification failed', message: msg })
      }
    },
  )

  app.post(
    '/api/auth/webauthn/authenticate/start',
    async (req: Request, res: Response) => {
      const body = req.body as { googleSub?: unknown }
      const googleSub = resolveGoogleSub(req, res, body.googleSub)
      if (!googleSub) return
      const list = listCredentials(googleSub)
      if (list.length === 0) {
        res.status(404).json({ error: 'No passkeys for this account' })
        return
      }
      const ip = clientIp(req)
      if (isWebAuthnAuthLocked(googleSub, ip)) {
        res.status(429).json({ error: 'Too many attempts. Try again later.' })
        return
      }
      try {
        const allowCredentials = list.map((c) => ({
          id: c.credentialId,
          transports: c.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[],
        }))
        const options = await generateAuthenticationOptions({
          rpID: config.webauthnRpId,
          allowCredentials,
          userVerification: 'required',
        })
        if (!options.challenge) {
          res.status(500).json({ error: 'No challenge generated' })
          return
        }
        setAuthenticationChallenge(options.challenge, { googleSub })
        res.json(options)
      } catch (e) {
        console.error('[webauthn] authenticate/start', e)
        res.status(500).json({ error: 'WebAuthn authentication start failed' })
      }
    },
  )

  app.post(
    '/api/auth/webauthn/authenticate/verify',
    async (req: Request, res: Response) => {
      const response = req.body as AuthenticationResponseJSON
      if (!response?.response?.clientDataJSON) {
        res.status(400).json({ error: 'Invalid body' })
        return
      }
      let challengeKey: string
      try {
        const clientData = decodeClientDataJSON(response.response.clientDataJSON)
        challengeKey = clientData.challenge
      } catch {
        res.status(400).json({ error: 'Invalid clientDataJSON' })
        return
      }
      const meta = consumeChallenge(challengeKey)
      if (!meta || meta.type !== 'authentication') {
        res.status(400).json({ error: 'challenge_expired', message: 'Challenge expired. Start again.' })
        return
      }
      const credentialId =
        typeof response.id === 'string' ? response.id : ''
      const found = findCredentialById(credentialId)
      if (!found || found.googleSub !== meta.googleSub) {
        res.status(401).json({ error: 'Credential not found' })
        return
      }
      const ip = clientIp(req)
      if (isWebAuthnAuthLocked(meta.googleSub, ip)) {
        res.status(429).json({ error: 'Too many attempts. Try again later.' })
        return
      }
      const authenticator = toAuthenticatorDevice(found.credential)
      try {
        const verified = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challengeKey,
          expectedOrigin: config.webauthnOrigins,
          expectedRPID: config.webauthnRpId,
          authenticator,
          requireUserVerification: true,
        })
        if (!verified.verified) {
          recordWebAuthnAuthFailure(meta.googleSub, ip)
          res.status(401).json({ error: 'invalid_signature', message: 'Passkey authentication failed.' })
          return
        }
        const newCounter = verified.authenticationInfo.newCounter
        const storedCounter = found.credential.counter
        // Apple passkeys / Touch ID often report signCount 0 and never increment (FIDO: counter
        // optional). Only enforce monotonic counter when at least one side is non-zero.
        const counterReplay =
          !(storedCounter === 0 && newCounter === 0) &&
          newCounter <= storedCounter
        if (counterReplay) {
          console.warn(
            `[webauthn] COUNTER REPLAY googleSub=${meta.googleSub} cred=${credentialId.slice(0, 8)} stored=${storedCounter} got=${newCounter}`,
          )
          recordWebAuthnAuthFailure(meta.googleSub, ip)
          res.status(401).json({ error: 'Security check failed' })
          return
        }
        updateCredentialAfterAuth(meta.googleSub, credentialId, newCounter)
        const refreshToken = await getLatestRefreshTokenForGoogleSub(meta.googleSub)
        const token = sessionIdFromRequest(req)
        const fromSession = token ? getSession(token) : null
        const email =
          fromSession?.email ?? getLatestEmailForGoogleSub(meta.googleSub)
        if (!email) {
          res.status(401).json({ error: 'Unknown user email; sign in with Google.' })
          return
        }
        const oldSid = sessionIdFromRequest(req)
        if (oldSid) await deleteSession(oldSid)
        const sessionId = createSession({
          refreshToken: refreshToken ?? null,
          googleSub: meta.googleSub,
          email,
        })
        setSecondFactorVerified(sessionId, 'passkey')
        clearWebAuthnAuthFailures(meta.googleSub, ip)
        console.info(
          `[webauthn] auth ok googleSub=${meta.googleSub} cred=${credentialId.slice(0, 8)}…`,
        )
        res.cookie(
          SESSION_COOKIE,
          sessionId,
          sessionCookieOptions(config.sessionMaxMs),
        )
        res.json({
          success: true,
          message: 'Authentication successful',
          expiresAt: new Date(
            Date.now() + config.sessionMaxMs,
          ).toISOString(),
          user: { sub: meta.googleSub, email },
        })
      } catch (e) {
        recordWebAuthnAuthFailure(meta.googleSub, ip)
        console.error('[webauthn] authenticate/verify', e)
        res.status(401).json({
          error: 'invalid_signature',
          message: 'Passkey authentication failed.',
        })
      }
    },
  )

  app.delete(
    '/api/auth/webauthn/credential/:credentialId',
    (req: Request, res: Response) => {
      const auth = requireAuthSession(req, res)
      if (!auth) return
      if (!isPinUnlocked(auth.rec)) {
        res.status(403).json({ error: 'Unlock the app before managing passkeys.' })
        return
      }
      const id = req.params['credentialId']
      if (!id) {
        res.status(400).json({ error: 'Missing credential id' })
        return
      }
      const ok = removeCredential(auth.rec.googleSub, decodeURIComponent(id))
      if (!ok) {
        res.status(404).json({ error: 'Credential not found' })
        return
      }
      res.status(204).send()
    },
  )
}
