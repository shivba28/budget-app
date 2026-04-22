import { sqlite } from '../db'
import { META } from './constants'

export function getMetaSync(key: string): string | null {
  const row = sqlite.getFirstSync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [key],
  )
  return row?.value ?? null
}

export function setMetaSync(key: string, value: string): void {
  sqlite.runSync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

export function removeMetaSync(key: string): void {
  sqlite.runSync('DELETE FROM app_meta WHERE key = ?', [key])
}

export function readLastUnlockIso(): string | null {
  return getMetaSync(META.LAST_UNLOCK_AT)
}
