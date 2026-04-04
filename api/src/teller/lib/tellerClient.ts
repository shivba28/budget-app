import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type Json = unknown

/** enrollmentId → raw access token (normalized) */
const sessionTokens = new Map<string, string>()

/** accountId → enrollmentId (rebuilt when GET /accounts aggregates) */
const accountToEnrollment = new Map<string, string>()

/** Thrown when api.teller.io (via local teller.js proxy) returns a non-2xx response. */
export class TellerUpstreamError extends Error {
  readonly statusCode: number
  readonly bodySnippet: string

  constructor(statusCode: number, message: string, bodySnippet: string) {
    super(message)
    this.name = 'TellerUpstreamError'
    this.statusCode = statusCode
    this.bodySnippet = bodySnippet
  }
}

/**
 * Value must be the raw enrollment access token (not "Bearer …", not HTTP Basic).
 * Strips common .env mistakes: quotes, whitespace, accidental Bearer prefix.
 */
export function normalizeTellerAccessToken(raw: string | undefined): string {
  if (raw === undefined) {
    return ''
  }
  let t = raw.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, '').trim()
  }
  return t
}

export function addSessionToken(enrollmentId: string, token: string): void {
  const id = enrollmentId.trim()
  const n = normalizeTellerAccessToken(token)
  if (!id || !n) return
  sessionTokens.set(id, n)
}

export function removeSessionToken(enrollmentId: string): void {
  const id = enrollmentId.trim()
  sessionTokens.delete(id)
  for (const [accId, eid] of [...accountToEnrollment.entries()]) {
    if (eid === id) accountToEnrollment.delete(accId)
  }
}

export function clearSessionTokens(): void {
  sessionTokens.clear()
  accountToEnrollment.clear()
}

/** @deprecated Use addSessionToken('default', token) */
export function setSessionAccessToken(token: string | null): void {
  if (!token || !token.trim()) {
    sessionTokens.delete('default')
    return
  }
  addSessionToken('default', token)
}

const TELLER_PROXY_PORT = Number(process.env.TELLER_PROXY_PORT) || 3001
const TELLER_PROXY_HOST = process.env.TELLER_PROXY_HOST || '127.0.0.1'
const TELLER_PROXY_BASE_URL = `http://${TELLER_PROXY_HOST}:${TELLER_PROXY_PORT}`

let proxyChild: ChildProcess | null = null
let proxyReadyPromise: Promise<void> | null = null

function resolveTellerJsPath(): string {
  const override = process.env.TELLER_JS_PATH
  if (override && override.length > 0) {
    return path.resolve(override)
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  // .cjs so Node loads this script as CommonJS when the package has "type": "module".
  return path.join(__dirname, 'teller.cjs')
}

async function waitForTcpPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.end()
          resolve()
        })
        socket.on('error', (err) => {
          socket.destroy()
          reject(err)
        })
      })
      return
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for Teller proxy at ${host}:${port}. ` +
            'Check backend terminal: teller.js must start (needs http-proxy-middleware and valid env).',
        )
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

async function ensureTellerProxyRunning(): Promise<void> {
  if (proxyReadyPromise) {
    await proxyReadyPromise
    return
  }

  proxyReadyPromise = (async () => {
    const tellerJsPath = resolveTellerJsPath()
    const appId = process.env.TELLER_APP_ID
    const certPath = process.env.TELLER_CERT_PATH
    const keyPath = process.env.TELLER_KEY_PATH
    const envMode = process.env.TELLER_ENV || 'sandbox'

    if (!appId) {
      throw new Error('TELLER_APP_ID must be set')
    }

    if (
      ['development', 'production'].includes(envMode) &&
      (!certPath || !keyPath)
    ) {
      throw new Error(
        'TELLER_CERT_PATH and TELLER_KEY_PATH must be set when TELLER_ENV is development or production',
      )
    }

    if (!proxyChild || proxyChild.exitCode !== null) {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        APP_ID: appId,
        ENV: envMode,
        PORT: String(TELLER_PROXY_PORT),
      }
      if (certPath && keyPath) {
        childEnv.CERT = certPath
        childEnv.CERT_KEY = keyPath
      }

      const proxyCwd = path.join(path.dirname(tellerJsPath), '..')
      proxyChild = spawn(process.execPath, [tellerJsPath], {
        stdio: 'inherit',
        cwd: proxyCwd,
        env: childEnv,
      })

      proxyChild.on('exit', (code, signal) => {
        proxyChild = null
        proxyReadyPromise = null
        if (process.env.NODE_ENV !== 'production') {
          console.error('Official teller.js proxy exited', { code, signal })
        }
      })

      proxyChild.on('error', (err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to spawn teller.js', err)
        }
      })
    }

    await waitForTcpPort(TELLER_PROXY_HOST, TELLER_PROXY_PORT, 15_000)
  })()

  try {
    await proxyReadyPromise
  } catch (err) {
    proxyReadyPromise = null
    throw err
  }
}

async function proxyGet(pathname: string, token: string): Promise<Json> {
  const t = normalizeTellerAccessToken(token)
  if (!t) {
    throw new Error(
      'No Teller access token: POST /auth/token from the app after Connect, or set TELLER_ACCESS_TOKEN.',
    )
  }

  const res = await fetch(`${TELLER_PROXY_BASE_URL}${pathname}`, {
    headers: {
      authorization: 'Basic ' + Buffer.from(t + ':').toString('base64'),
    },
  })

  const rawText = await res.text()

  if (!res.ok) {
    const snippet = rawText.slice(0, 500)
    const hint =
      res.status === 401
        ? ' Teller rejected credentials: use the enrollment access token for this environment.'
        : ''
    throw new TellerUpstreamError(
      res.status,
      `Teller API error: ${res.status} ${res.statusText}${hint}`,
      snippet,
    )
  }

  try {
    return JSON.parse(rawText) as Json
  } catch {
    throw new Error(`Teller proxy returned non-JSON (${rawText.slice(0, 200)}…)`)
  }
}

function unwrapAccountList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'accounts' in data) {
    const inner = (data as { accounts: unknown }).accounts
    if (Array.isArray(inner)) return inner
  }
  return []
}

/**
 * Fetches accounts from every stored enrollment, tags each with `enrollment_id`,
 * and rebuilds accountId → enrollment routing for GET /transactions.
 */
export async function getAccountsAggregated(): Promise<Json> {
  await ensureTellerProxyRunning()
  accountToEnrollment.clear()
  const merged: unknown[] = []

  for (const [enrollmentId, tok] of sessionTokens) {
    try {
      const data = await proxyGet('/api/accounts', tok)
      const rawList = unwrapAccountList(data)
      for (const raw of rawList) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : null
        if (id) accountToEnrollment.set(id, enrollmentId)
        merged.push({ ...r, enrollment_id: enrollmentId })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`GET accounts failed for enrollment ${enrollmentId}`, error)
      }
    }
  }

  const envTok = normalizeTellerAccessToken(process.env.TELLER_ACCESS_TOKEN)
  if (merged.length === 0 && envTok) {
    try {
      const data = await proxyGet('/api/accounts', envTok)
      const rawList = unwrapAccountList(data)
      for (const raw of rawList) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : null
        if (id) accountToEnrollment.set(id, 'env')
        merged.push({ ...r, enrollment_id: 'env' })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GET accounts failed for TELLER_ACCESS_TOKEN', error)
      }
    }
  }

  return merged
}

export async function getTransactionsForAccount(
  accountId: string,
  enrollmentId?: string | null,
): Promise<Json> {
  await ensureTellerProxyRunning()

  const tryToken = (tok: string) =>
    proxyGet(
      `/api/accounts/${encodeURIComponent(accountId)}/transactions`,
      tok,
    )

  const tried = new Set<string>()
  const tryOrder: string[] = []

  if (enrollmentId && sessionTokens.has(enrollmentId)) {
    tryOrder.push(sessionTokens.get(enrollmentId)!)
  }
  const fromAcc = accountToEnrollment.get(accountId)
  if (fromAcc && sessionTokens.has(fromAcc)) {
    tryOrder.push(sessionTokens.get(fromAcc)!)
  }
  for (const tok of sessionTokens.values()) tryOrder.push(tok)

  const envTok = normalizeTellerAccessToken(process.env.TELLER_ACCESS_TOKEN)
  if (envTok) tryOrder.push(envTok)

  let lastErr: unknown
  for (const tok of tryOrder) {
    if (tried.has(tok)) continue
    tried.add(tok)
    try {
      return await tryToken(tok)
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Could not load transactions for this account')
}

type TellerClient = {
  getAccounts: () => Promise<Json>
  getTransactions: (accountId: string) => Promise<Json>
}

/** Legacy export: single-token flows only. Prefer getAccountsAggregated. */
export const tellerClient: TellerClient = {
  async getAccounts() {
    const list = await getAccountsAggregated()
    return Array.isArray(list) ? list : []
  },
  async getTransactions(accountId: string) {
    return getTransactionsForAccount(accountId, null)
  },
}
