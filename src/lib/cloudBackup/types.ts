export const CLOUD_BACKUP_SCHEMA_VERSION = 1 as const

export type CloudBackupPayload = {
  schemaVersion: typeof CLOUD_BACKUP_SCHEMA_VERSION
  updatedAt: string
  localStorage: Record<string, string>
}

export function parseCloudBackupJson(text: string): CloudBackupPayload | null {
  try {
    const v = JSON.parse(text) as unknown
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    if (o.schemaVersion !== CLOUD_BACKUP_SCHEMA_VERSION) return null
    if (typeof o.updatedAt !== 'string') return null
    if (!o.localStorage || typeof o.localStorage !== 'object') return null
    const ls: Record<string, string> = {}
    for (const [k, val] of Object.entries(
      o.localStorage as Record<string, unknown>,
    )) {
      if (typeof val === 'string') ls[k] = val
    }
    return {
      schemaVersion: CLOUD_BACKUP_SCHEMA_VERSION,
      updatedAt: o.updatedAt,
      localStorage: ls,
    }
  } catch {
    return null
  }
}
