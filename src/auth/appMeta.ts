import { sqlite } from '../db'
import { META } from './constants'

export function getMetaSync(key: string): string | null {
  // op-sqlite: execute() returns { rows: { _array: T[] } }
  const result = sqlite.execute('SELECT value FROM app_meta WHERE key = ?', [key])
  const row = result.rows?._array?.[0] as { value: string } | undefined
  return row?.value ?? null
}

export function setMetaSync(key: string, value: string): void {
  sqlite.execute(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

export function removeMetaSync(key: string): void {
  sqlite.execute('DELETE FROM app_meta WHERE key = ?', [key])
}

export function readLastUnlockIso(): string | null {
  return getMetaSync(META.LAST_UNLOCK_AT)
}
