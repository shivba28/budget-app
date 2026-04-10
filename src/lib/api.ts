import axios from 'axios'
import type { TellerConnectEnrollment } from 'teller-connect-react'
import { CATEGORY_COLORS } from '../constants/colors'
import { categorize, isKnownCategoryId } from './categories'
import type { Account, ConnectedAccountInfo, Transaction, Trip } from './domain'
import {
  resolveTransactionBudgetMonthKey,
  tripsMapFromList,
} from './effectiveMonth'
import * as storage from './storage'
import { fetchTransactionsFromServer } from './serverData'
import {
  canonicalCategoryIdForSpend,
  categoryLabelNormalizedKeyFromLabel,
  resolveCategoryLabel,
} from '@/lib/categoryCanonical'
export type { Account, ConnectedAccountInfo, Transaction, Trip } from './domain'

let syncInFlight: Promise<Transaction[]> | null = null

/** True while {@link refreshTransactionsFromBackend} is running (including from unlock or background). */
export function isBankTransactionSyncInFlight(): boolean {
  return syncInFlight !== null
}

const syncProgressListeners = new Set<
  ((p: {
    phase:
      | 'rehydrate'
      | 'accounts'
      | 'account_transactions'
      | 'server_merge'
      | 'finalize'
    done: number
    total: number
    accountName?: string
  }) => void) | null | undefined
>()

function emitSyncProgress(p: {
  phase:
    | 'rehydrate'
    | 'accounts'
    | 'account_transactions'
    | 'server_merge'
    | 'finalize'
  done: number
  total: number
  accountName?: string
}): void {
  for (const cb of syncProgressListeners) {
    if (!cb) continue
    try {
      cb(p)
    } catch {
      /* ignore UI listeners */
    }
  }
}

/**
 * Server mode: hide transactions when there are no linked bank accounts, and hide rows for
 * account ids that are not in the current linked set (e.g. stale DB rows).
 */
export function filterTransactionsForLinkedBankAccounts(
  txs: readonly Transaction[],
): Transaction[] {
  const accounts = storage.getAccounts()
  if (accounts === null) return [...txs]
  if (accounts.length === 0) return []
  const allowed = new Set(accounts.map((a) => a.id))
  return txs.filter((t) => allowed.has(t.accountId))
}

/** Transactions / Insights: linked banks, then omit accounts the user unchecked in Settings. */
export function filterTransactionsByVisibleAccounts(
  txs: readonly Transaction[],
): Transaction[] {
  const linked = filterTransactionsForLinkedBankAccounts(txs)
  const ex = storage.getExcludedAccountIds()
  if (ex.size === 0) return linked
  return linked.filter((t) => !ex.has(t.accountId))
}

/** Teller routes live under `/api/teller` on the unified API. */
function resolveApiBaseUrl(): string {
  const api = import.meta.env.VITE_API_URL?.trim()
  if (api) {
    return `${api.replace(/\/$/, '')}/api/teller`
  }
  const backend = import.meta.env.VITE_BACKEND_URL?.trim()
  if (backend) {
    return `${backend.replace(/\/$/, '')}/api/teller`
  }
  const legacy = import.meta.env.VITE_API_BASE_URL?.trim()
  if (legacy) {
    return legacy.replace(/\/$/, '')
  }
  return '/api/teller'
}

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15_000,
  withCredentials: true,
})

// Auth is via httpOnly cookie session (withCredentials).

export interface SummaryPieSegment {
  readonly name: string
  readonly value: number
  readonly fill: string
}

export async function registerEnrollmentToken(
  enrollmentId: string,
  token: string,
  institutionName?: string | null,
): Promise<void> {
  await api.post('/auth/token', { token, enrollmentId, institutionName })
}

/** @deprecated Use registerEnrollmentToken */
export async function saveToken(token: string): Promise<void> {
  await api.post('/auth/token', { token })
}

export async function clearBackendSession(): Promise<void> {
  try {
    await api.delete('/auth/token')
  } catch {
    /* backend may be offline */
  }
}

export async function rehydrateBackendSessionIfNeeded(): Promise<void> {
  // No-op: enrollments/tokens are stored server-side (Neon) and auth is via httpOnly cookie.
}

function mapRawAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  const name = typeof r.name === 'string' ? r.name : null
  if (!id || !name) return null
  let enrollmentId: string | null =
    typeof r.enrollment_id === 'string'
      ? r.enrollment_id
      : typeof r.enrollmentId === 'string'
        ? r.enrollmentId
        : null
  if (!enrollmentId) enrollmentId = 'legacy'
  let institution: { name: string } | undefined
  if (r.institution && typeof r.institution === 'object' && r.institution !== null) {
    const ins = r.institution as Record<string, unknown>
    if (typeof ins.name === 'string') institution = { name: ins.name }
  }
  const base = { id, name, enrollmentId } as Account
  return institution ? { ...base, institution } : base
}

function unwrapAccountList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'accounts' in data) {
    const inner = (data as { accounts: unknown }).accounts
    if (Array.isArray(inner)) return inner
  }
  return []
}

export async function fetchAccounts(): Promise<Account[]> {
  await rehydrateBackendSessionIfNeeded()
  const { data } = await api.get<unknown>('/accounts')
  const rawList = unwrapAccountList(data)
  return rawList.map(mapRawAccount).filter((a): a is Account => a !== null)
}

/** Map Teller `details.category` values to our category ids. */
function mapTellerCategoryLabel(label: string): string | null {
  const s = label.trim().toLowerCase()
  if (!s) return null

  const exact: Readonly<Record<string, string>> = {
    dining: 'food',
    restaurant: 'food',
    'fast food': 'food',
    'fast_food': 'food',
    coffee: 'food',
    food: 'food',
    groceries: 'groceries',
    grocery: 'groceries',
    shopping: 'groceries',
    transportation: 'transport',
    transit: 'transport',
    auto: 'transport',
    gas: 'transport',
    entertainment: 'entertainment',
    utilities: 'utilities',
    bills: 'utilities',
    housing: 'housing',
    rent: 'housing',
    mortgage: 'housing',
    income: 'other',
    general: 'other',
    fees: 'other',
    medical: 'other',
    travel: 'transport',
  }
  if (exact[s] !== undefined) return exact[s]

  const pairs: readonly (readonly [string, string])[] = [
    ['grocery', 'groceries'],
    ['groceries', 'groceries'],
    ['food and drink', 'food'],
    ['dining', 'food'],
    ['restaurant', 'food'],
    ['transportation', 'transport'],
    ['transit', 'transport'],
    ['entertainment', 'entertainment'],
    ['utilities', 'utilities'],
    ['housing', 'housing'],
    ['mortgage', 'housing'],
  ]
  for (const [needle, id] of pairs) {
    if (s.includes(needle)) return id
  }
  return null
}

/** Teller puts the merchant category on `details.category` (not a top-level `type` field). */
function extractDetailsCategory(raw: Record<string, unknown>): string | null {
  const det = raw.details
  if (!det || typeof det !== 'object' || det === null) return null
  const d = det as Record<string, unknown>
  const c = d.category
  if (typeof c === 'string' && c.trim()) return c
  return null
}

function mapRawTransaction(raw: unknown, fallbackAccountId: string): Transaction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  if (!id) return null
  const accountId =
    typeof r.account_id === 'string'
      ? r.account_id
      : typeof r.accountId === 'string'
        ? r.accountId
        : fallbackAccountId
  let amount = 0
  if (typeof r.amount === 'number' && Number.isFinite(r.amount)) amount = r.amount
  else if (typeof r.amount === 'string') {
    const n = parseFloat(r.amount)
    if (Number.isFinite(n)) amount = n
  }
  let date = ''
  if (typeof r.date === 'string') date = r.date.slice(0, 10)
  let description = 'Transaction'
  if (typeof r.description === 'string' && r.description) description = r.description
  else if (r.details && typeof r.details === 'object' && r.details !== null) {
    const d = r.details as Record<string, unknown>
    if (typeof d.description === 'string' && d.description) description = d.description
  }
  const detailsCategory = extractDetailsCategory(r)
  const categoryId =
    detailsCategory !== null
      ? (mapTellerCategoryLabel(detailsCategory) ?? 'other')
      : categorize(description)

  let effectiveDate: string | null | undefined
  if (r.effective_date === null || r.effectiveDate === null) {
    effectiveDate = null
  } else if (
    typeof r.effective_date === 'string' &&
    r.effective_date.length >= 7
  ) {
    effectiveDate = r.effective_date.slice(0, 10)
  } else if (
    typeof r.effectiveDate === 'string' &&
    r.effectiveDate.length >= 7
  ) {
    effectiveDate = r.effectiveDate.slice(0, 10)
  }

  const trRaw = r.trip_id !== undefined ? r.trip_id : r.tripId
  let tripId: number | null | undefined
  if (trRaw === null) tripId = null
  else if (typeof trRaw === 'number' && Number.isFinite(trRaw)) tripId = trRaw

  const shareRaw = r.my_share !== undefined ? r.my_share : r.myShare
  let myShare: number | null | undefined
  if (shareRaw === null) {
    myShare = null
  } else if (typeof shareRaw === 'number' && Number.isFinite(shareRaw)) {
    myShare = shareRaw
  } else if (typeof shareRaw === 'string') {
    const n = Number(shareRaw)
    if (Number.isFinite(n)) myShare = n
  }

  const pending =
    r.status === 'pending' || r.pending === true || r.pending === 'true'

  const base: Transaction = {
    id,
    accountId,
    amount,
    date,
    categoryId,
    description,
    ...(myShare !== undefined ? { myShare } : {}),
    ...(pending ? { pending: true as const } : {}),
  }
  if (effectiveDate !== undefined) {
    ;(base as Transaction & { effectiveDate?: string | null }).effectiveDate =
      effectiveDate
  }
  if (tripId !== undefined) {
    ;(base as Transaction & { tripId?: number | null }).tripId = tripId
  }
  return detailsCategory !== null
    ? { ...base, detailCategory: detailsCategory }
    : base
}

function unwrapTransactionList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'transactions' in data) {
    const inner = (data as { transactions: unknown }).transactions
    if (Array.isArray(inner)) return inner
  }
  return []
}

export async function fetchTransactions(
  accountId: string,
  enrollmentId: string,
): Promise<Transaction[]> {
  await rehydrateBackendSessionIfNeeded()
  const { data } = await api.get<unknown>('/transactions', {
    params: { account_id: accountId, enrollment_id: enrollmentId },
  })
  const rawList = unwrapTransactionList(data)
  return rawList
    .map((raw) => mapRawTransaction(raw, accountId))
    .filter((t): t is Transaction => t !== null)
}

export function accountToConnectionInfo(account: Account): ConnectedAccountInfo {
  const institutionName =
    account.institution && typeof account.institution.name === 'string'
      ? account.institution.name
      : 'Unknown institution'
  return {
    accountId: account.id,
    accountName: account.name,
    institutionName,
  }
}

export async function handleTellerConnectSuccess(
  enrollment: TellerConnectEnrollment,
): Promise<ConnectedAccountInfo | null> {
  const token = enrollment.accessToken
  const enrollmentId = enrollment.enrollment.id
  const institutionName = (() => {
    const any = enrollment as unknown as {
      institution?: { name?: unknown }
      enrollment?: { institution?: { name?: unknown } }
    }
    const top = any.institution?.name
    if (typeof top === 'string' && top.trim()) return top
    const nested = any.enrollment?.institution?.name
    if (typeof nested === 'string' && nested.trim()) return nested
    return null
  })()
  await registerEnrollmentToken(enrollmentId, token, institutionName)
  const accounts = await fetchAccounts()
  storage.saveAccounts(accounts)
  storage.clearTransactions()
  const first = accounts[0]
  if (!first) return null
  const info = accountToConnectionInfo(first)
  storage.saveConnectedAccountSummary(info)
  return info
}

export async function syncAccountsNow(): Promise<ConnectedAccountInfo | null> {
  await rehydrateBackendSessionIfNeeded()
  const accounts = await fetchAccounts()
  storage.saveAccounts(accounts)
  storage.clearTransactions()
  const first = accounts[0]
  if (!first) return null
  const info = accountToConnectionInfo(first)
  storage.saveConnectedAccountSummary(info)
  return info
}

export async function disconnectBanking(): Promise<void> {
  await clearBackendSession()
  storage.clearAll()
}

/** Remove one bank connection; keep other enrollments. */
export async function disconnectEnrollment(enrollmentId: string): Promise<void> {
  storage.removeEnrollment(enrollmentId)
  try {
    await api.delete(
      `/auth/enrollment/${encodeURIComponent(enrollmentId)}`,
    )
  } catch {
    /* backend may be offline */
  }
  await rehydrateBackendSessionIfNeeded()
  try {
    const accounts = await fetchAccounts()
    storage.saveAccounts(accounts)
    if (accounts.length === 0) {
      storage.clearConnectedAccountSummary()
    }
  } catch {
    storage.saveAccounts([])
    storage.clearConnectedAccountSummary()
  }
  storage.clearTransactions()
}

/**
 * Loads from in-memory cache when present; otherwise fetches from the API.
 */
export async function loadTransactionsFromCacheOrFetch(options?: {
  throwOnFailure?: boolean
}): Promise<Transaction[]> {
  const cached = storage.getTransactions()
  if (cached !== null) {
    return filterTransactionsForLinkedBankAccounts(cached)
  }
  let accs = storage.getAccounts()
  if (accs === null) {
    try {
      accs = await fetchAccounts()
      storage.saveAccounts(accs)
    } catch {
      return refreshTransactionsFromBackend(options)
    }
  }
  if (accs.length === 0) {
    storage.saveTransactions([])
    return []
  }
  const remote = await fetchTransactionsFromServer()
  if (remote) {
    const allowed = new Set(accs.map((a) => a.id))
    const filtered = remote.filter((t) => allowed.has(t.accountId))
    storage.saveTransactions(filtered)
    return filtered
  }
  return refreshTransactionsFromBackend(options)
}

/**
 * Fetches from the backend and replaces the transaction cache. Category overrides are not touched.
 * With `throwOnFailure: true`, rethrows when the network request fails and there is no cached fallback.
 */
export async function refreshTransactionsFromBackend(options?: {
  throwOnFailure?: boolean
  onProgress?: (p: {
    /** Human-readable phase for UI. */
    phase:
      | 'rehydrate'
      | 'accounts'
      | 'account_transactions'
      | 'server_merge'
      | 'finalize'
    /** Completed units (0..total). */
    done: number
    total: number
    accountName?: string
  }) => void
}): Promise<Transaction[]> {
  const existing = syncInFlight
  if (existing) {
    if (options?.onProgress) syncProgressListeners.add(options.onProgress)
    return existing
  }
  const throwOnFailure = options?.throwOnFailure === true
  const onProgress = options?.onProgress
  if (onProgress) syncProgressListeners.add(onProgress)
  window.dispatchEvent(new CustomEvent(storage.BANK_SYNC_STARTED_EVENT))
  syncInFlight = (async () => {
  emitSyncProgress({ phase: 'rehydrate', done: 0, total: 1 })
  await rehydrateBackendSessionIfNeeded()
  emitSyncProgress({ phase: 'rehydrate', done: 1, total: 1 })
  let list = storage.getAccounts()
  if (!list || list.length === 0) {
    emitSyncProgress({ phase: 'accounts', done: 0, total: 1 })
    try {
      list = await fetchAccounts()
      storage.saveAccounts(list)
    } catch {
      list = []
    }
    emitSyncProgress({ phase: 'accounts', done: 1, total: 1 })
  }
  if (!list || list.length === 0) {
    storage.saveTransactions([])
    return []
  }
  try {
    const total = list.length
    let done = 0
    for (const acc of list) {
      emitSyncProgress({
        phase: 'account_transactions',
        done,
        total,
        accountName: acc.name,
      })
      try {
        await fetchTransactions(acc.id, acc.enrollmentId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`Sync failed for ${acc.name}: ${msg}`)
      }
      done += 1
    }
    emitSyncProgress({ phase: 'server_merge', done: total, total })
    const remote = await fetchTransactionsFromServer()
    if (remote) {
      const allowed = new Set(list.map((a) => a.id))
      const filtered = remote.filter((t) => allowed.has(t.accountId))
      storage.saveTransactions(filtered)
      storage.recordSuccessfulBankTransactionFetch()
      emitSyncProgress({ phase: 'finalize', done: total, total })
      return filtered
    }
    if (throwOnFailure) {
      throw new Error('Could not load transactions from server')
    }
    return []
  } catch (err) {
    const cached = storage.getTransactions()
    if (cached !== null) return filterTransactionsForLinkedBankAccounts(cached)
    if (throwOnFailure) {
      throw err
    }
    return []
  }
  })()
    .finally(() => {
      syncInFlight = null
      syncProgressListeners.clear()
      window.dispatchEvent(new CustomEvent(storage.BANK_SYNC_ENDED_EVENT))
    })
  return await syncInFlight
}

/** @deprecated Use {@link loadTransactionsFromCacheOrFetch} */
export async function loadTransactionsForPage(): Promise<Transaction[]> {
  return loadTransactionsFromCacheOrFetch()
}

export async function loadAccountsForPage(): Promise<Account[]> {
  const cached = storage.getAccounts()
  if (cached !== null) return cached
  try {
    await rehydrateBackendSessionIfNeeded()
    const fresh = await fetchAccounts()
    storage.saveAccounts(fresh)
    return fresh
  } catch {
    storage.saveAccounts([])
    return []
  }
}

export interface MonthSummaryResult {
  readonly monthLabel: string
  readonly pieData: SummaryPieSegment[]
  readonly totalSpend: number
  readonly topCategory: { readonly name: string; readonly amount: number } | null
  readonly transactionCount: number
  readonly biggestSpend: {
    readonly description: string
    readonly amount: number
  } | null
  readonly hasAnyTransactionsInMonth: boolean
  readonly hasSpendInMonth: boolean
}

export function resolveMyShare(tx: Transaction): number {
  if (tx.myShare != null && Number.isFinite(tx.myShare)) return tx.myShare
  return tx.amount
}

/** Calendar month filter for budgets & Insights — uses resolved budget month (trip / effective date). */
export function filterTransactionsForCalendarMonth(
  transactions: readonly Transaction[],
  year: number,
  month1to12: number,
  tripsById?: ReadonlyMap<number, Trip>,
): Transaction[] {
  const prefix = `${year}-${String(month1to12).padStart(2, '0')}`
  const map = tripsById ?? tripsMapFromList(storage.getTrips())
  return transactions.filter(
    (t) => resolveTransactionBudgetMonthKey(t, map) === prefix,
  )
}

export { tripsMapFromList, resolveTransactionBudgetMonthKey } from './effectiveMonth'
export { isDeferredOutOfViewMonth } from './effectiveMonth'

export function formatCalendarMonthLabel(year: number, month1to12: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month1to12 - 1, 1))
}

export function shiftCalendarMonth(
  year: number,
  month1to12: number,
  delta: number,
): { readonly year: number; readonly month: number } {
  const d = new Date(year, month1to12 - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Spending uses only positive `amount` values (Teller: outflows). Negative = deposits/refunds.
 * Pie buckets always use {@link resolveDisplayCategory} — same category id + label as Transactions
 * (e.g. Teller "dining" maps to app `food` → "Food & dining"; overrides apply here too).
 */
export function computeMonthSummary(
  transactions: readonly Transaction[],
  overrides: Readonly<Record<string, string>>,
  year: number,
  month1to12: number,
): MonthSummaryResult {
  const monthLabel = formatCalendarMonthLabel(year, month1to12)
  const monthTxs = filterTransactionsForCalendarMonth(
    transactions,
    year,
    month1to12,
  )
  const hasAnyTransactionsInMonth = monthTxs.length > 0

  const spendTxs = monthTxs.filter((t) => resolveMyShare(t) > 0)
  const totalSpend = spendTxs.reduce((sum, t) => sum + resolveMyShare(t), 0)
  const hasSpendInMonth = totalSpend > 0

  type Bucket = { label: string; colorId: string; total: number }
  const buckets = new Map<string, Bucket>()

  for (const tx of spendTxs) {
    const eff = canonicalCategoryIdForSpend(resolveDisplayCategory(tx, overrides))
    const key = `c:${eff}`
    const label = resolveCategoryLabel(eff)
    const colorId = eff
    const prev = buckets.get(key)
    if (prev) {
      prev.total += resolveMyShare(tx)
    } else {
      buckets.set(key, { label, colorId, total: resolveMyShare(tx) })
    }
  }

  const pieData: SummaryPieSegment[] = [...buckets.values()]
    .map((b) => ({
      name: b.label,
      value: b.total,
      fill: getCategoryPillColor(b.colorId),
    }))
    .sort((a, b) => b.value - a.value)

  const topCategory =
    pieData.length > 0
      ? { name: pieData[0].name, amount: pieData[0].value }
      : null

  const biggestSpend =
    spendTxs.length > 0
      ? spendTxs.reduce((a, b) => (a.amount >= b.amount ? a : b))
      : null

  return {
    monthLabel,
    pieData,
    totalSpend,
    topCategory,
    transactionCount: monthTxs.length,
    biggestSpend:
      biggestSpend !== null
        ? {
            description: biggestSpend.description,
            amount: biggestSpend.amount,
          }
        : null,
    hasAnyTransactionsInMonth,
    hasSpendInMonth,
  }
}

export function getTellerApplicationId(): string {
  return (
    import.meta.env.VITE_TELLER_APPLICATION_ID ||
    import.meta.env.VITE_TELLER_APP_ID ||
    ''
  )
}

export function getCategoryLabel(categoryId: string): string {
  return resolveCategoryLabel(categoryId)
}

export function getCategoryPillColor(categoryId: string): string {
  const list = storage.getCategories()
  const labelKey = categoryLabelNormalizedKeyFromLabel(
    resolveCategoryLabel(categoryId),
  )
  if (list) {
    const match = list.find(
      (c) => categoryLabelNormalizedKeyFromLabel(c.label) === labelKey,
    )
    if (match) return match.color
  }
  const canon = canonicalCategoryIdForSpend(categoryId)
  const key = canon as keyof typeof CATEGORY_COLORS
  return CATEGORY_COLORS[key] ?? '#94a3b8'
}

/** Display category: user override wins; otherwise the stored row (Teller + auto rules). */
export function getEffectiveCategoryId(tx: Transaction): string {
  return resolveDisplayCategory(tx, storage.getCategoryOverrides())
}

export function resolveDisplayCategory(
  tx: Transaction,
  overrides: Readonly<Record<string, string>>,
): string {
  const o = overrides[tx.id]
  if (o !== undefined && isKnownCategoryId(o)) return o
  return tx.categoryId
}

/** Same as {@link resolveDisplayCategory} but collapses Teller vs built-in ids that share one label. */
export function resolveCanonicalDisplayCategory(
  tx: Transaction,
  overrides: Readonly<Record<string, string>>,
): string {
  return canonicalCategoryIdForSpend(resolveDisplayCategory(tx, overrides))
}

export function persistCategoryOverride(
  transactionId: string,
  categoryId: string,
): void {
  if (!isKnownCategoryId(categoryId)) return
  storage.setCategoryOverride(transactionId, categoryId)
}

export function formatCurrencyAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/** Label for the account column (institution · account name when available). */
export function formatTransactionAccountLabel(
  accountId: string,
  accounts: readonly Account[] | null,
): string {
  if (!accounts || accounts.length === 0) return accountId
  const acc = accounts.find((a) => a.id === accountId)
  if (!acc) return accountId
  const ins = acc.institution?.name?.trim()
  if (ins) return `${ins} · ${acc.name}`
  return acc.name
}

export function loadStoredConnectionInfo(): ConnectedAccountInfo | null {
  return storage.getConnectedAccountSummary()
}

/** Linked accounts from Teller (in-memory cache; loaded from the API). */
export function loadLinkedAccounts(): Account[] {
  return storage.getAccounts() ?? []
}
