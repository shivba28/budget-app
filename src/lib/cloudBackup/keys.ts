/** Session flag: avoid re-running merge logic until next login. */
export const SESSION_BOOTSTRAP_KEY = 'budget_drive_bootstrap_done'

const PREFIX = 'budget-app:'

/** Local-only: last merged Drive backup `updatedAt` (ISO). Not synced; used for merge vs remote. */
export const CLOUD_BACKUP_ENVELOPE_AT_KEY = 'budget-app:cloud-backup-envelope-at'

/** Never sync auth token or sync bookkeeping to Drive. */
const DENY = new Set([
  'budget_auth_token',
  'budget_drive_bootstrap_done',
  'budget_drive_last_sync_at',
  'budget_drive_last_sync_status',
  'budget_drive_last_sync_error',
  'budget-app:last-auth-email',
  CLOUD_BACKUP_ENVELOPE_AT_KEY,
])

/** Bank tokens stay on-device; re-link Teller on each trusted browser. */
const SENSITIVE_KEYS = new Set([
  'budget-app:enrollments',
  'budget-app:access-token',
  'budget-app:teller-token',
])

export function isAllowedBackupKey(key: string): boolean {
  if (DENY.has(key)) return false
  if (SENSITIVE_KEYS.has(key)) return false
  return key.startsWith(PREFIX)
}
