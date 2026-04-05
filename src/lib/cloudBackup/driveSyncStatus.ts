/** Bookkeeping keys (denied from cloud backup payload in keys.ts). */
export const DRIVE_LAST_SYNC_AT_KEY = 'budget_drive_last_sync_at'
export const DRIVE_LAST_SYNC_STATUS_KEY = 'budget_drive_last_sync_status'
export const DRIVE_LAST_SYNC_ERROR_KEY = 'budget_drive_last_sync_error'

export const DRIVE_SYNC_STATUS_EVENT = 'budget-app-drive-sync-status'

export type DriveSyncDisplayStatus = 'never' | 'ok' | 'error'

export type DriveSyncStatusSnapshot = {
  readonly display: DriveSyncDisplayStatus
  /** Last completed attempt (success or failure). */
  readonly lastAttemptAt: Date | null
  readonly errorMessage: string | null
}

function readSnapshot(): DriveSyncStatusSnapshot {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { display: 'never', lastAttemptAt: null, errorMessage: null }
  }
  try {
    const atRaw = window.localStorage.getItem(DRIVE_LAST_SYNC_AT_KEY)
    const statusRaw = window.localStorage.getItem(DRIVE_LAST_SYNC_STATUS_KEY)
    const errRaw = window.localStorage.getItem(DRIVE_LAST_SYNC_ERROR_KEY)
    if (!atRaw || atRaw.trim() === '') {
      return { display: 'never', lastAttemptAt: null, errorMessage: null }
    }
    const t = Date.parse(atRaw)
    const lastAttemptAt = Number.isFinite(t) ? new Date(t) : null
    const ok = statusRaw === 'ok'
    const errorMessage =
      errRaw && errRaw.trim() !== '' ? errRaw : null
    return {
      display: ok ? 'ok' : 'error',
      lastAttemptAt,
      errorMessage: ok ? null : errorMessage,
    }
  } catch {
    return { display: 'never', lastAttemptAt: null, errorMessage: null }
  }
}

function dispatch(): void {
  try {
    window.dispatchEvent(new CustomEvent(DRIVE_SYNC_STATUS_EVENT))
  } catch {
    // ignore
  }
}

export function getDriveSyncStatusSnapshot(): DriveSyncStatusSnapshot {
  return readSnapshot()
}

export function recordDriveSyncSuccess(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const iso = new Date().toISOString()
    window.localStorage.setItem(DRIVE_LAST_SYNC_AT_KEY, iso)
    window.localStorage.setItem(DRIVE_LAST_SYNC_STATUS_KEY, 'ok')
    window.localStorage.removeItem(DRIVE_LAST_SYNC_ERROR_KEY)
  } catch {
    // quota
  }
  dispatch()
}

export function recordDriveSyncFailure(message: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const iso = new Date().toISOString()
    window.localStorage.setItem(DRIVE_LAST_SYNC_AT_KEY, iso)
    window.localStorage.setItem(DRIVE_LAST_SYNC_STATUS_KEY, 'error')
    const short =
      message.length > 200 ? `${message.slice(0, 197)}…` : message
    window.localStorage.setItem(DRIVE_LAST_SYNC_ERROR_KEY, short)
  } catch {
    // quota
  }
  dispatch()
}

export function clearDriveSyncStatus(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(DRIVE_LAST_SYNC_AT_KEY)
    window.localStorage.removeItem(DRIVE_LAST_SYNC_STATUS_KEY)
    window.localStorage.removeItem(DRIVE_LAST_SYNC_ERROR_KEY)
  } catch {
    // ignore
  }
  dispatch()
}
