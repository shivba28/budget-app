import { CATEGORIES } from '@/constants/categories'
import { CATEGORY_COLORS } from '@/constants/colors'
import type { Transaction, Trip } from '@/lib/domain'
import type { MonthlyBudgetsStoredV1 } from '@/lib/storage'
import * as storage from '@/lib/storage'

const PREFIX = 'budget-app:local:'

const KEYS = {
  trips: `${PREFIX}trips`,
  transactions: `${PREFIX}transactions`,
  budgets: `${PREFIX}budgets`,
  categoryOverrides: `${PREFIX}category-overrides`,
  categories: `${PREFIX}categories`,
} as const

type ServerCategory = {
  id: string
  label: string
  color: string
  source: 'teller' | 'user'
}

function localRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function localWrite<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function defaultCategories(): ServerCategory[] {
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    color: CATEGORY_COLORS[c.id] ?? '#94a3b8',
    source: 'teller' as const,
  }))
}

function readTransactions(): Transaction[] {
  const raw = localRead<unknown>(KEYS.transactions)
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is Transaction => x && typeof x === 'object')
}

function writeTransactions(list: Transaction[]): void {
  localWrite(KEYS.transactions, list)
}

function readTrips(): Trip[] {
  const raw = localRead<unknown>(KEYS.trips)
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is Trip => x && typeof x === 'object')
}

function writeTrips(list: Trip[]): void {
  localWrite(KEYS.trips, list)
}

function sortTxsDesc(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.id.localeCompare(a.id)
  })
}

export async function fetchTransactionsFromLocal(): Promise<Transaction[] | null> {
  try {
    return sortTxsDesc(readTransactions())
  } catch {
    return null
  }
}

export async function fetchTripsFromLocal(): Promise<Trip[] | null> {
  try {
    return readTrips()
  } catch {
    return null
  }
}

export async function fetchBudgetsFromLocal(): Promise<MonthlyBudgetsStoredV1 | null> {
  try {
    const data = localRead<MonthlyBudgetsStoredV1>(KEYS.budgets)
    if (data && data.v === 1 && data.categories && typeof data.categories === 'object') {
      return {
        v: 1,
        categories: data.categories,
        totalMonthly:
          data.totalMonthly === undefined ? null : data.totalMonthly,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function putBudgetsToLocal(
  payload: MonthlyBudgetsStoredV1,
): Promise<boolean> {
  try {
    localWrite(KEYS.budgets, payload)
    storage.saveMonthlyBudgets(payload, { skipRemote: true })
    return true
  } catch {
    return false
  }
}

export async function fetchCategoryOverridesFromLocal(): Promise<
  Record<string, string>
> {
  try {
    const data = localRead<Record<string, string>>(KEYS.categoryOverrides)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Merges into `budget-app:local:category-overrides` only (storage is updated by the caller). */
export async function persistCategoryOverrideToLocalStorage(
  txId: string,
  categoryId: string,
): Promise<boolean> {
  try {
    const cur = (await fetchCategoryOverridesFromLocal()) ?? {}
    const next = { ...cur, [txId]: categoryId }
    localWrite(KEYS.categoryOverrides, next)
    return true
  } catch {
    return false
  }
}

export async function fetchCategoriesFromLocal(): Promise<ServerCategory[] | null> {
  try {
    let list = localRead<ServerCategory[]>(KEYS.categories)
    if (!Array.isArray(list) || list.length === 0) {
      list = defaultCategories()
      localWrite(KEYS.categories, list)
    }
    return list
  } catch {
    return null
  }
}

export async function createCategoryOnLocal(input: {
  label: string
  color: string
}): Promise<
  | { ok: true; id: string }
  | { ok: false; duplicate: boolean }
> {
  try {
    const label = input.label.trim()
    if (!label) return { ok: false, duplicate: false }
    const list = (await fetchCategoriesFromLocal()) ?? []
    const norm = label.toLowerCase()
    if (list.some((c) => c.label.trim().toLowerCase() === norm)) {
      return { ok: false, duplicate: true }
    }
    const id = crypto.randomUUID()
    const next: ServerCategory[] = [
      ...list,
      {
        id,
        label,
        color: typeof input.color === 'string' ? input.color : '#94a3b8',
        source: 'user',
      },
    ]
    localWrite(KEYS.categories, next)
    return { ok: true, id }
  } catch {
    return { ok: false, duplicate: false }
  }
}

export async function updateCategoryColorOnLocal(input: {
  id: string
  color: string
}): Promise<boolean> {
  try {
    const list = (await fetchCategoriesFromLocal()) ?? []
    const next = list.map((c) =>
      c.id === input.id ? { ...c, color: input.color } : c,
    )
    localWrite(KEYS.categories, next)
    return true
  } catch {
    return false
  }
}

export async function deleteCategoryOnLocal(id: string): Promise<boolean> {
  try {
    const list = (await fetchCategoriesFromLocal()) ?? []
    const next = list.filter((c) => c.id !== id)
    localWrite(KEYS.categories, next)
    return true
  } catch {
    return false
  }
}

export async function createTripOnLocal(input: {
  name: string
  startDate: string
  endDate: string | null
  budgetLimit: number | null
  color: string | null
}): Promise<Trip | null> {
  try {
    const trips = readTrips()
    const id = Date.now()
    const trip: Trip = {
      id,
      name: input.name.trim(),
      startDate: input.startDate.slice(0, 10),
      endDate:
        input.endDate && input.endDate.length >= 10
          ? input.endDate.slice(0, 10)
          : null,
      budgetLimit: input.budgetLimit,
      color: input.color,
      createdAt: new Date().toISOString(),
    }
    const next = [...trips, trip]
    writeTrips(next)
    storage.saveTrips(next)
    return trip
  } catch {
    return null
  }
}

export async function updateTripOnLocal(
  tripId: number,
  patch: Partial<{
    name: string
    startDate: string
    endDate: string | null
    budgetLimit: number | null
    color: string | null
  }>,
): Promise<boolean> {
  try {
    const trips = readTrips()
    const idx = trips.findIndex((t) => t.id === tripId)
    if (idx < 0) return false
    const cur = trips[idx]!
    const nextTrip: Trip = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.startDate !== undefined
        ? { startDate: patch.startDate.slice(0, 10) }
        : {}),
      ...(patch.endDate !== undefined
        ? {
            endDate:
              patch.endDate && patch.endDate.length >= 10
                ? patch.endDate.slice(0, 10)
                : null,
          }
        : {}),
      ...(patch.budgetLimit !== undefined
        ? { budgetLimit: patch.budgetLimit }
        : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    }
    const next = [...trips]
    next[idx] = nextTrip
    writeTrips(next)
    storage.saveTrips(next)
    return true
  } catch {
    return false
  }
}

export async function deleteTripOnLocal(tripId: number): Promise<boolean> {
  try {
    const trips = readTrips().filter((t) => t.id !== tripId)
    writeTrips(trips)
    storage.saveTrips(trips)
    const txs = readTransactions().map((t) =>
      t.tripId === tripId ? { ...t, tripId: null } : t,
    )
    writeTransactions(txs)
    storage.saveTransactions(sortTxsDesc(txs))
    return true
  } catch {
    return false
  }
}

export async function createManualTransactionOnLocal(input: {
  description: string
  amount: number
  date: string
  categoryId: string
  accountLabel: string
  manualAccountId: string
}): Promise<Transaction | null> {
  try {
    const id = crypto.randomUUID()
    const accountId = `manual-${input.manualAccountId}`
    const tx: Transaction = {
      id,
      accountId,
      amount: input.amount,
      date: input.date.slice(0, 10),
      categoryId: input.categoryId,
      description: input.description.trim(),
      source: 'manual',
      accountLabel: input.accountLabel.trim(),
    }
    const next = sortTxsDesc([tx, ...readTransactions()])
    writeTransactions(next)
    return tx
  } catch {
    return null
  }
}

export async function deleteManualTransactionOnLocal(
  transactionId: string,
): Promise<boolean> {
  try {
    const txs = readTransactions()
    const t = txs.find((x) => x.id === transactionId)
    if (!t || t.source !== 'manual') return false
    const next = txs.filter((x) => x.id !== transactionId)
    writeTransactions(next)
    return true
  } catch {
    return false
  }
}

export async function confirmTransactionPostedOnLocal(
  transactionId: string,
): Promise<Transaction | null> {
  try {
    const txs = readTransactions()
    const idx = txs.findIndex((x) => x.id === transactionId)
    if (idx < 0) return null
    const cur = txs[idx]!
    const patched: Transaction = { ...cur, userConfirmed: true }
    const next = [...txs]
    next[idx] = patched
    const sorted = sortTxsDesc(next)
    writeTransactions(sorted)
    storage.saveTransactions(sorted)
    return patched
  } catch {
    return null
  }
}

export async function updateManualTransactionOnLocal(input: {
  transactionId: string
  description: string
  amount: number
  date: string
  categoryId: string
  accountLabel: string
  manualAccountId: string
}): Promise<Transaction | null> {
  try {
    const txs = readTransactions()
    const idx = txs.findIndex((x) => x.id === input.transactionId)
    if (idx < 0) return null
    const cur = txs[idx]!
    if (cur.source !== 'manual') return null
    const accountId = `manual-${input.manualAccountId}`
    const patched: Transaction = {
      ...cur,
      accountId,
      amount: input.amount,
      date: input.date.slice(0, 10),
      categoryId: input.categoryId,
      description: input.description.trim(),
      accountLabel: input.accountLabel.trim(),
      source: 'manual',
    }
    const next = [...txs]
    next[idx] = patched
    const sorted = sortTxsDesc(next)
    writeTransactions(sorted)
    return patched
  } catch {
    return null
  }
}

export async function allocateTransactionOnLocal(
  transactionId: string,
  body:
    | { type: 'date'; effective_date: string }
    | { type: 'trip'; trip_id: number }
    | { type: 'my_share'; my_share: number | null }
    | { type: 'none' },
): Promise<boolean> {
  try {
    const txs = readTransactions()
    const idx = txs.findIndex((t) => t.id === transactionId)
    if (idx < 0) return false
    const cur = txs[idx]!
    let patched: Transaction
    if (body.type === 'none') {
      patched = {
        ...cur,
        tripId: null,
        effectiveDate: null,
        myShare: null,
      }
    } else if (body.type === 'date') {
      patched = {
        ...cur,
        effectiveDate: body.effective_date.slice(0, 10),
        tripId: null,
      }
    } else if (body.type === 'trip') {
      patched = {
        ...cur,
        tripId: body.trip_id,
        effectiveDate: null,
      }
    } else {
      patched = {
        ...cur,
        myShare: body.my_share,
      }
    }
    const next = [...txs]
    next[idx] = patched
    writeTransactions(next)
    storage.saveTransactions(sortTxsDesc(next))
    return true
  } catch {
    return false
  }
}
