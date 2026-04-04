import axios from 'axios'
import type { TellerConnectEnrollment } from 'teller-connect-react'
import { CATEGORIES } from '../constants/categories'
import { CATEGORY_COLORS } from '../constants/colors'
import { categorize, isKnownCategoryId } from './categories'
import type { Account, ConnectedAccountInfo, Transaction } from './domain'
import * as storage from './storage'

export type { Account, ConnectedAccountInfo, Transaction } from './domain'

/** Transactions / Insights: omit accounts the user unchecked in Settings. */
export function filterTransactionsByVisibleAccounts(
  txs: readonly Transaction[],
): Transaction[] {
  const ex = storage.getExcludedAccountIds()
  if (ex.size === 0) return [...txs]
  return txs.filter((t) => !ex.has(t.accountId))
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
})

export interface SummaryPieSegment {
  readonly name: string
  readonly value: number
  readonly fill: string
}

export async function registerEnrollmentToken(
  enrollmentId: string,
  token: string,
): Promise<void> {
  await api.post('/auth/token', { token, enrollmentId })
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
  const enrollments = storage.getEnrollments()
  for (const e of enrollments) {
    try {
      await registerEnrollmentToken(e.enrollmentId, e.accessToken)
    } catch {
      /* ignore */
    }
  }
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
  const base: Transaction = {
    id,
    accountId,
    amount,
    date,
    categoryId,
    description,
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
  const institutionName = enrollment.enrollment.institution.name
  storage.upsertEnrollment({
    enrollmentId,
    accessToken: token,
    institutionName,
  })
  await registerEnrollmentToken(enrollmentId, token)
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

function placeholderTransactions(): Transaction[] {
  const d = new Date().toISOString().slice(0, 10)
  return [
    {
      id: 'demo-1',
      accountId: 'demo-acct',
      amount: 42.5,
      date: d,
      categoryId: categorize('Whole Foods Market'),
      description: 'Whole Foods Market',
      detailCategory: 'groceries',
    },
    {
      id: 'demo-2',
      accountId: 'demo-acct',
      amount: 18,
      date: d,
      categoryId: categorize('Uber trip'),
      description: 'Uber trip',
      detailCategory: 'dining',
    },
    {
      id: 'demo-3',
      accountId: 'demo-acct',
      amount: -1200,
      date: d,
      categoryId: 'other',
      description: 'Payroll deposit (demo)',
    },
  ]
}

/**
 * Loads from localStorage when present; otherwise fetches from the backend and caches.
 */
export async function loadTransactionsFromCacheOrFetch(options?: {
  throwOnFailure?: boolean
}): Promise<Transaction[]> {
  const cached = storage.getTransactions()
  if (cached !== null) return cached
  return refreshTransactionsFromBackend(options)
}

/**
 * Fetches from the backend and replaces the transaction cache. Category overrides are not touched.
 * With `throwOnFailure: true`, rethrows when the network request fails and there is no cached fallback.
 */
export async function refreshTransactionsFromBackend(options?: {
  throwOnFailure?: boolean
}): Promise<Transaction[]> {
  const throwOnFailure = options?.throwOnFailure === true
  await rehydrateBackendSessionIfNeeded()
  let list = storage.getAccounts()
  if (!list || list.length === 0) {
    try {
      list = await fetchAccounts()
      storage.saveAccounts(list)
    } catch {
      list = []
    }
  }
  if (!list || list.length === 0) {
    if (throwOnFailure) {
      return []
    }
    const demo = placeholderTransactions()
    storage.saveTransactions(demo)
    return demo
  }
  try {
    const merged: Transaction[] = []
    const seen = new Set<string>()
    for (const acc of list) {
      const batch = await fetchTransactions(acc.id, acc.enrollmentId)
      for (const tx of batch) {
        if (!seen.has(tx.id)) {
          seen.add(tx.id)
          merged.push(tx)
        }
      }
    }
    merged.sort((a, b) => b.date.localeCompare(a.date))
    storage.saveTransactions(merged)
    storage.recordSuccessfulBankTransactionFetch()
    return merged
  } catch (err) {
    const cached = storage.getTransactions()
    if (cached !== null) return cached
    if (throwOnFailure) {
      throw err
    }
    const demo = placeholderTransactions()
    storage.saveTransactions(demo)
    return demo
  }
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
    const demo: Account[] = [
      {
        id: 'demo-acct',
        name: 'Demo account',
        enrollmentId: 'demo',
      },
    ]
    storage.saveAccounts(demo)
    return demo
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

export function filterTransactionsForCalendarMonth(
  transactions: readonly Transaction[],
  year: number,
  month1to12: number,
): Transaction[] {
  const prefix = `${year}-${String(month1to12).padStart(2, '0')}`
  return transactions.filter(
    (t) => typeof t.date === 'string' && t.date.startsWith(prefix),
  )
}

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

  const spendTxs = monthTxs.filter((t) => t.amount > 0)
  const totalSpend = spendTxs.reduce((sum, t) => sum + t.amount, 0)
  const hasSpendInMonth = totalSpend > 0

  type Bucket = { label: string; colorId: string; total: number }
  const buckets = new Map<string, Bucket>()

  for (const tx of spendTxs) {
    const eff = resolveDisplayCategory(tx, overrides)
    const key = `c:${eff}`
    const label = getCategoryLabel(eff)
    const colorId = eff
    const prev = buckets.get(key)
    if (prev) {
      prev.total += tx.amount
    } else {
      buckets.set(key, { label, colorId, total: tx.amount })
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
  const found = CATEGORIES.find((c) => c.id === categoryId)
  return found?.label ?? categoryId
}

export function getCategoryPillColor(categoryId: string): string {
  const key = categoryId as keyof typeof CATEGORY_COLORS
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

/**
 * Linked accounts from Teller (cached). If the accounts list is empty but a
 * connection summary exists, returns one synthetic row so Settings can still show a card.
 */
export function loadLinkedAccounts(): Account[] {
  const list = storage.getAccounts()
  if (list && list.length > 0) return list
  const summary = storage.getConnectedAccountSummary()
  if (summary) {
    return [
      {
        id: summary.accountId,
        name: summary.accountName,
        enrollmentId: 'legacy',
        institution: { name: summary.institutionName },
      },
    ]
  }
  return []
}
