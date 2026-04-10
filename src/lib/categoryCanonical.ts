import { CATEGORIES, type Category } from '@/constants/categories'
import * as storage from '@/lib/storage'

/** Stable key for grouping categories that should share one display name / spend bucket. */
export function categoryLabelNormalizedKeyFromLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizedLabelKeyFromId(categoryId: string): string {
  return categoryLabelNormalizedKeyFromLabel(resolveCategoryLabel(categoryId))
}

function isBuiltinId(id: string): boolean {
  return CATEGORIES.some((c) => c.id === id)
}

/** Built-in categories plus server rows (server wins on same `id`). */
export function mergedCategoryDefinitions(): Category[] {
  const out = new Map<string, Category>()
  for (const c of CATEGORIES) out.set(c.id, c)
  const server = storage.getCategories()
  if (server) {
    for (const c of server) {
      out.set(c.id, { id: c.id, label: c.label })
    }
  }
  return [...out.values()]
}

function prettifyUnknownCategoryId(id: string): string {
  let s = id
  if (s.startsWith('teller:')) s = s.slice(7)
  if (s.startsWith('user:')) s = s.slice(5)
  const words = s.split(/[-_\s]+/).filter(Boolean)
  if (words.length === 0) return id
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Human label for a category id (no `teller:` / `user:` leakage when avoidable). */
export function resolveCategoryLabel(categoryId: string): string {
  const hit = mergedCategoryDefinitions().find((c) => c.id === categoryId)
  if (hit) return hit.label
  return prettifyUnknownCategoryId(categoryId)
}

function chooseCanonicalId(candidates: Category[]): string {
  if (candidates.length === 1) return candidates[0]!.id
  const builtins = candidates.filter((c) => isBuiltinId(c.id))
  if (builtins.length > 0) {
    return [...builtins].sort((a, b) => a.id.localeCompare(b.id))[0]!.id
  }
  const teller = candidates.filter((c) => c.id.startsWith('teller:'))
  if (teller.length > 0) {
    return [...teller].sort((a, b) => a.id.localeCompare(b.id))[0]!.id
  }
  const user = candidates.filter((c) => c.id.startsWith('user:'))
  if (user.length > 0) {
    return [...user].sort((a, b) => a.id.localeCompare(b.id))[0]!.id
  }
  return [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0]!.id
}

let labelKeyToCanonicalCache:
  | { rev: string; map: Map<string, string> }
  | undefined

function categoriesStorageFingerprint(): string {
  const c = storage.getCategories()
  if (!c?.length) return ''
  return c.map((x) => `${x.id}:${x.label}`).join('\u001f')
}

/** Map normalized display label → one stable id for spend rollups and filters. */
export function buildLabelKeyToCanonicalId(): Map<string, string> {
  const rev = categoriesStorageFingerprint()
  const cacheKey = `b:${rev}`
  if (labelKeyToCanonicalCache?.rev === cacheKey) {
    return labelKeyToCanonicalCache.map
  }
  const defs = mergedCategoryDefinitions()
  const groups = new Map<string, Category[]>()
  for (const d of defs) {
    const k = categoryLabelNormalizedKeyFromLabel(d.label)
    const arr = groups.get(k) ?? []
    arr.push(d)
    groups.set(k, arr)
  }
  const map = new Map<string, string>()
  for (const [k, arr] of groups) {
    map.set(k, chooseCanonicalId(arr))
  }
  labelKeyToCanonicalCache = { rev: cacheKey, map }
  return map
}

/**
 * Collapse ids that share the same display label (e.g. `groceries` vs `teller:groceries`)
 * so Insights, trip breakdowns, and filters stay consistent.
 */
export function canonicalCategoryIdForSpend(rawCategoryId: string): string {
  const key = normalizedLabelKeyFromId(rawCategoryId)
  return buildLabelKeyToCanonicalId().get(key) ?? rawCategoryId
}

/** One row per distinct display name — for Transactions filter and allocate sheet. */
export function listCategoriesForTransactionFilters(): Category[] {
  const map = buildLabelKeyToCanonicalId()
  const seen = new Set<string>()
  const out: Category[] = []
  for (const canonicalId of map.values()) {
    const k = normalizedLabelKeyFromId(canonicalId)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      id: canonicalId,
      label: resolveCategoryLabel(canonicalId),
    })
  }
  return out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}
