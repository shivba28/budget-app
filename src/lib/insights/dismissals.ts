import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as metaQ from '@/src/db/queries/appMeta'

const KEY_SEEN_SYNC = 'INSIGHTS_DISMISS_SEEN_SYNC_AT'
const KEY_ANOMALY = 'INSIGHTS_DISMISSED_ANOMALY_IDS'
const KEY_DUP = 'INSIGHTS_DISMISSED_DUP_KEYS'

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((x) => typeof x === 'string')
  } catch {
    return []
  }
}

function writeJsonArray(key: string, arr: string[]): void {
  metaQ.setMeta(key, JSON.stringify(arr.slice(0, 200)))
}

/** If a new sync occurred, reset dismissals. */
export function maybeResetDismissalsOnNewSync(): void {
  const syncAt = metaQ.getMeta(META_LAST_TELLER_SYNC_AT) ?? ''
  const seen = metaQ.getMeta(KEY_SEEN_SYNC) ?? ''
  if (!syncAt) return
  if (seen !== syncAt) {
    metaQ.setMeta(KEY_SEEN_SYNC, syncAt)
    metaQ.deleteMeta(KEY_ANOMALY)
    metaQ.deleteMeta(KEY_DUP)
  }
}

export function getDismissedAnomalyIds(): Set<string> {
  return new Set(parseJsonArray(metaQ.getMeta(KEY_ANOMALY)))
}

export function dismissAnomaly(id: string): void {
  const cur = parseJsonArray(metaQ.getMeta(KEY_ANOMALY))
  if (cur.includes(id)) return
  cur.push(id)
  writeJsonArray(KEY_ANOMALY, cur)
}

export function getDismissedDuplicateKeys(): Set<string> {
  return new Set(parseJsonArray(metaQ.getMeta(KEY_DUP)))
}

export function dismissDuplicate(key: string): void {
  const cur = parseJsonArray(metaQ.getMeta(KEY_DUP))
  if (cur.includes(key)) return
  cur.push(key)
  writeJsonArray(KEY_DUP, cur)
}

export function dismissedInsightsCounts(): { anomalies: number; duplicates: number } {
  return {
    anomalies: getDismissedAnomalyIds().size,
    duplicates: getDismissedDuplicateKeys().size,
  }
}

