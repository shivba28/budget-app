/**
 * Database client — AES-256 encrypted storage via @op-engineering/op-sqlite + SQLCipher.
 *
 * Graceful fallback
 * ──────────────────
 * op-sqlite is a native module. If the current binary was built before the dependency
 * was added (common during development), TurboModuleRegistry throws at import time and
 * crashes the entire JS bundle. We avoid this by loading op-sqlite with a dynamic
 * require() inside a try-catch. When it isn't available the client falls back to
 * unencrypted expo-sqlite so the app remains usable. Rebuild the dev client with
 *   eas build --profile development
 * to get the encrypted path.
 *
 * Encryption key lifecycle (op-sqlite path)
 * ──────────────────────────────────────────
 * 1. First launch: 32 random bytes → 64-char hex stored in SecureStore (Keychain / Keystore).
 * 2. Subsequent launches: key read synchronously from SecureStore.
 * 3. The key is device-bound and independent of the PIN.
 *
 * One-time migration from legacy expo-sqlite
 * ──────────────────────────────────────────
 * The previous unencrypted DB (budget-tracker.db) is detected and exported into the
 * new encrypted DB (budget-tracker-enc.db) using ATTACH + sqlcipher_export(). If the
 * legacy file is not found a fresh encrypted DB is created automatically.
 *
 * drizzle-orm/expo-sqlite shim (op-sqlite path)
 * ──────────────────────────────────────────────
 * drizzle-orm/op-sqlite is async-only; migrating 50+ callers would be painful.
 * Instead we keep drizzle-orm/expo-sqlite (sync) and feed it a thin shim that maps
 * expo-sqlite's prepareSync/executeSync API to op-sqlite's synchronous execute().
 */

import { drizzle } from 'drizzle-orm/expo-sqlite'
import { openDatabaseSync } from 'expo-sqlite'
import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite'
import * as SecureStore from 'expo-secure-store'

import * as schema from './schema'

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_ENCRYPTED_NAME  = 'budget-tracker-enc.db'
const DB_LEGACY_NAME     = 'budget-tracker.db'
const ENC_KEY_STORE      = 'bb_db_enc_key_v1'
const ENC_MIGRATED_STORE = 'bb_db_enc_migrated_v1'

// ─── Public connection interface ──────────────────────────────────────────────
// Both the op-sqlite path (encrypted) and the expo-sqlite fallback (unencrypted)
// expose this shape so every caller (authStore, appMeta, sync, migrate) is unchanged.

export type SqliteConn = {
  execute(sql: string, params?: unknown[]): { rows?: { _array?: unknown[] }; insertId?: number }
  executeAsync(sql: string): Promise<unknown>
}

// Internal op-sqlite open signature (only used inside the try block)
type OpOpen = (opts: { name: string; encryptionKey?: string }) => {
  execute(sql: string, params?: unknown[]): { rows?: { _array?: unknown[] }; insertId?: number }
  executeAsync(sql: string): Promise<unknown>
  close(): void
}

// ─── Encryption key ───────────────────────────────────────────────────────────

function getOrCreateEncryptionKey(): string {
  const existing = SecureStore.getItem(ENC_KEY_STORE)
  if (existing) return existing
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  SecureStore.setItem(ENC_KEY_STORE, key)
  return key
}

// ─── One-time migration from unencrypted DB ───────────────────────────────────

function runOneTimeEncryptionMigration(encryptionKey: string, open: OpOpen): void {
  if (SecureStore.getItem(ENC_MIGRATED_STORE) === '1') return
  try {
    const legacyDb = open({ name: DB_LEGACY_NAME })
    const check = legacyDb.execute(
      "SELECT count(*) AS cnt FROM sqlite_master WHERE type='table' AND name='transactions'",
    )
    const cnt = ((check.rows?._array?.[0]) as { cnt: number } | undefined)?.cnt ?? 0
    if (cnt > 0) {
      legacyDb.execute(`ATTACH DATABASE '${DB_ENCRYPTED_NAME}' AS enc KEY '${encryptionKey}'`)
      legacyDb.execute("SELECT sqlcipher_export('enc')")
      legacyDb.execute('DETACH DATABASE enc')
    }
    legacyDb.close()
  } catch {
    // No legacy DB found (different path on iOS, fresh install) — fresh encrypted DB will be created
  }
  SecureStore.setItem(ENC_MIGRATED_STORE, '1')
}

// ─── drizzle shim — wraps op-sqlite so drizzle-orm/expo-sqlite can drive it ──

function makeExpoSqliteShim(conn: SqliteConn): SQLiteDatabase {
  return {
    isInTransactionSync: () => false,
    prepareSync(sql: string) {
      return {
        finalizeSync: () => {},

        executeSync(params: unknown[]) {
          const result = conn.execute(sql, params ?? [])
          const arr: unknown[] = result.rows?._array ?? []
          return {
            getAllSync: () => arr,
            getFirstSync: () => (arr.length > 0 ? arr[0] : null),
            // drizzle's run() destructures { changes, lastInsertRowId }
            changes: (result as { rowsAffected?: number }).rowsAffected ?? 0,
            lastInsertRowId: result.insertId ?? 0,
          }
        },

        // Used by drizzle for all db.select().from(table).all() queries.
        // Returns an array-of-arrays where each inner array's values are in
        // SELECT clause column order — matching drizzle's fields array order.
        executeForRawResultSync(params: unknown[]) {
          const result = conn.execute(sql, params ?? [])
          const arr = (result.rows?._array ?? []) as Record<string, unknown>[]
          return {
            getAllSync: () => arr.map((row) => Object.values(row)),
          }
        },
      }
    },
  } as unknown as SQLiteDatabase
}

// ─── expo-sqlite fallback adapter ─────────────────────────────────────────────
// Wraps expo-sqlite to expose the same execute() / executeAsync() interface as
// op-sqlite so every caller works without modification in unencrypted dev builds.

function makeExpoFallback(expoDb: SQLiteDatabase): SqliteConn {
  return {
    execute(sql: string, params: unknown[] = []) {
      const upper = sql.trimStart().toUpperCase()
      const isRead =
        upper.startsWith('SELECT') ||
        upper.startsWith('PRAGMA') ||
        upper.startsWith('WITH')
      if (isRead) {
        // getAllSync is a shorthand available on SQLiteDatabase in expo-sqlite v14+
        const rows = (expoDb as unknown as {
          getAllSync(sql: string, params: unknown[]): unknown[]
        }).getAllSync(sql, params)
        return { rows: { _array: rows } }
      }
      const result = expoDb.runSync(sql, params as SQLiteBindValue[])
      return { rows: { _array: [] }, insertId: result.lastInsertRowId ?? 0 }
    },
    async executeAsync(sql: string) {
      return expoDb.execAsync(sql)
    },
  }
}

// ─── Initialise ───────────────────────────────────────────────────────────────

function initDb(): { conn: SqliteConn; drizzleClient: SQLiteDatabase } {
  try {
    // Dynamic require prevents TurboModuleRegistry.getEnforcing from throwing at
    // import time when op-sqlite is not compiled into the current native binary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { open } = require('@op-engineering/op-sqlite') as { open: OpOpen }
    const encryptionKey = getOrCreateEncryptionKey()
    runOneTimeEncryptionMigration(encryptionKey, open)
    const opConn = open({ name: DB_ENCRYPTED_NAME, encryptionKey })
    return { conn: opConn, drizzleClient: makeExpoSqliteShim(opConn) }
  } catch {
    if (__DEV__) {
      console.warn(
        '[DB] op-sqlite native module not found in this binary — ' +
          'running with unencrypted expo-sqlite.\n' +
          'Run `eas build --profile development` to rebuild the dev client with encryption.',
      )
    }
    // Fall back to the original unencrypted database file so existing dev data is preserved
    const expoDb = openDatabaseSync(DB_LEGACY_NAME)
    return { conn: makeExpoFallback(expoDb), drizzleClient: expoDb }
  }
}

const { conn, drizzleClient } = initDb()

/** Raw connection for direct execute() calls in appMeta, authStore, sync. */
export const sqlite: SqliteConn = conn

/** Drizzle ORM client — synchronous queries via the expo-sqlite adapter + op-sqlite shim. */
export const db = drizzle(drizzleClient, { schema })
