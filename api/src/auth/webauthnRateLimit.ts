import { config } from './config/env.js'

type Bucket = {
  failures: number
  windowStart: number
  lockedUntil: number
}

const buckets = new Map<string, Bucket>()

function key(googleSub: string, ip: string): string {
  return `${googleSub}::${ip}`
}

export function isWebAuthnAuthLocked(googleSub: string, ip: string): boolean {
  const b = buckets.get(key(googleSub, ip))
  if (!b) return false
  if (b.lockedUntil > Date.now()) return true
  return false
}

export function recordWebAuthnAuthFailure(googleSub: string, ip: string): void {
  const k = key(googleSub, ip)
  const now = Date.now()
  let b = buckets.get(k)
  if (!b || now - b.windowStart > 60 * 60 * 1000) {
    b = { failures: 0, windowStart: now, lockedUntil: 0 }
  }
  b.failures += 1
  if (b.failures >= config.webauthnMaxAuthFailures) {
    b.lockedUntil = now + config.webauthnAuthLockoutMs
    b.failures = 0
    b.windowStart = now
    console.warn(
      `[webauthn] auth lockout googleSub=${googleSub} ip=${ip} until=${new Date(b.lockedUntil).toISOString()}`,
    )
  }
  buckets.set(k, b)
}

export function clearWebAuthnAuthFailures(googleSub: string, ip: string): void {
  buckets.delete(key(googleSub, ip))
}
