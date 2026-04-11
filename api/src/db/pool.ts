import dns from 'node:dns'
import { Pool, type PoolConfig } from 'pg'

const connectionString = process.env.DATABASE_URL?.trim()

function parsePgUrl(raw: string): {
  user: string
  password: string
  host: string
  port: number
  database: string
} | null {
  try {
    const normalized = raw.replace(/^postgres:\/\//i, 'postgresql://')
    const u = new URL(normalized)
    if (!u.hostname) return null
    const path = (u.pathname || '/postgres').replace(/^\//, '')
    const database = path ? decodeURIComponent(path) : 'postgres'
    return {
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 5432,
      database,
    }
  } catch {
    return null
  }
}

function connectTimeoutMs(): number {
  const raw = process.env.DATABASE_CONNECT_TIMEOUT_MS
  const n = raw !== undefined && raw !== '' ? Number(raw) : 60_000
  if (!Number.isFinite(n)) return 60_000
  /** Neon cold start + TLS can exceed 60s on some networks; cap at 3 min. */
  return Math.min(180_000, Math.max(5_000, n))
}

function buildPoolConfig(url: string): PoolConfig {
  const sslOff = process.env.DATABASE_SSL === 'false'
  const ssl = sslOff ? undefined : { rejectUnauthorized: false as const }
  const timeout = connectTimeoutMs()
  const parsed = parsePgUrl(url)

  /**
   * Neon + node-postgres: use discrete host/user/db/ssl like Neon’s Node guide.
   * Avoids pg-connection-string sslmode deprecation noise and matches their tested shape.
   * Do not set `options=endpoint=…` here: TLS SNI must match; pooler hosts use `…-pooler`
   * in SNI and Neon errors if `endpoint` disagrees (e.g. stripped `-pooler`).
   */
  if (parsed && parsed.host.endsWith('.neon.tech')) {
    return {
      user: parsed.user,
      password: parsed.password,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      ssl,
      max: 10,
      connectionTimeoutMillis: timeout,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    }
  }

  return {
    connectionString: url,
    ssl,
    max: 10,
    connectionTimeoutMillis: timeout,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  }
}

function createPool(url: string): Pool {
  // Neon often resolves to IPv6 first; flaky IPv6 routes can yield read ETIMEDOUT on idle TLS.
  if (/\.neon\.tech/i.test(url)) {
    dns.setDefaultResultOrder('ipv4first')
  }
  const p = new Pool(buildPoolConfig(url))
  p.on('error', (err: unknown) => {
    // Idle clients in the pool can emit after the server/NAT drops the TCP session.
    // Without a listener, Node treats this as an unhandled 'error' and exits.
    console.error('[db/pool] idle client error (connection discarded)', err)
  })
  return p
}

export const pool: Pool | null =
  connectionString && connectionString.length > 0 ? createPool(connectionString) : null

export function dbEnabled(): boolean {
  return pool !== null
}

const TRANSIENT_PG_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNREFUSED',
])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientPgError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const code =
    'code' in e && typeof (e as { code?: unknown }).code === 'string'
      ? (e as { code: string }).code
      : undefined
  return code !== undefined && TRANSIENT_PG_CODES.has(code)
}

/** Max attempts for a single statement (Neon wake-up / flaky routes). */
const PG_QUERY_MAX_ATTEMPTS = 3

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)')
  let last: unknown
  for (let attempt = 0; attempt < PG_QUERY_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await pool.query(text, params)
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 }
    } catch (e) {
      last = e
      if (isTransientPgError(e) && attempt < PG_QUERY_MAX_ATTEMPTS - 1) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      throw e
    }
  }
  throw last
}
