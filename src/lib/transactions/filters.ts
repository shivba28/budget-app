import type { TransactionRow } from '@/src/db/queries/transactions'

export type DatePreset = 'all' | 'this_month' | 'last_30' | 'this_year' | 'custom'
export type CashFlow = 'all' | 'in' | 'out'
export type SourceFilter = 'all' | 'manual' | 'bank'

export type CustomDateRange = { start: string; end: string }

export type TransactionListFilters = {
  search: string
  datePreset: DatePreset
  /** Used when datePreset === 'custom' (YYYY-MM-DD). */
  customDateRange?: CustomDateRange
  /** `all` | `__none__` (uncategorized) | category label */
  category: string | 'all' | '__none__'
  /** `all` | specific `accounts.id` */
  accountId: 'all' | string
  cashFlow: CashFlow
  source: SourceFilter
  /** When false, rows with pending=1 and user_confirmed=0 are hidden. */
  includeUnconfirmedPending: boolean
}

export function sortDate(tx: TransactionRow): string {
  return (tx.effective_date ?? tx.date) ?? ''
}

export function monthKeyFromTx(tx: TransactionRow): string {
  const d = sortDate(tx)
  return d ? d.slice(0, 7) : ''
}

export function passesPendingVisibility(
  tx: TransactionRow,
  includeUnconfirmedPending: boolean,
): boolean {
  if (includeUnconfirmedPending) return true
  if (tx.pending === 1 && tx.user_confirmed === 0) return false
  return true
}

function inLast30Days(isoDate: string): boolean {
  const t = Date.parse(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`)
  if (Number.isNaN(t)) return false
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  return t >= cutoff
}

function inCustomRange(isoDate: string, range: CustomDateRange): boolean {
  const t = Date.parse(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`)
  const a = Date.parse(`${range.start}T00:00:00`)
  const b = Date.parse(`${range.end}T23:59:59`)
  if ([t, a, b].some(Number.isNaN)) return false
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return t >= lo && t <= hi
}

function passesDatePreset(
  tx: TransactionRow,
  preset: DatePreset,
  customDateRange?: CustomDateRange,
): boolean {
  const sd = sortDate(tx)
  if (preset === 'all') return true
  if (preset === 'this_month') {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return sd.slice(0, 7) === ym
  }
  if (preset === 'last_30') return inLast30Days(sd)
  if (preset === 'this_year') {
    const y = String(new Date().getFullYear())
    return sd.slice(0, 4) === y
  }
  if (preset === 'custom' && customDateRange) return inCustomRange(sd, customDateRange)
  return true
}

function passesSearch(tx: TransactionRow, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const desc = tx.description.toLowerCase()
  const label = (tx.account_label ?? '').toLowerCase()
  return desc.includes(s) || label.includes(s)
}

function passesCategory(
  tx: TransactionRow,
  category: string | 'all' | '__none__',
): boolean {
  if (category === 'all') return true
  if (category === '__none__') return !tx.category
  return (tx.category ?? '') === category
}

function passesAccount(tx: TransactionRow, accountId: 'all' | string): boolean {
  if (accountId === 'all') return true
  return tx.account_id === accountId
}

function passesCashFlow(tx: TransactionRow, flow: CashFlow): boolean {
  if (flow === 'all') return true
  if (flow === 'in') return tx.amount > 0
  return tx.amount < 0
}

function passesSource(tx: TransactionRow, source: SourceFilter): boolean {
  if (source === 'all') return true
  return tx.source === source
}

export function applyTransactionFilters(
  items: TransactionRow[],
  f: TransactionListFilters,
): TransactionRow[] {
  return items.filter(
    (tx) =>
      passesPendingVisibility(tx, f.includeUnconfirmedPending) &&
      passesSearch(tx, f.search) &&
      passesDatePreset(tx, f.datePreset, f.customDateRange) &&
      passesCategory(tx, f.category) &&
      passesAccount(tx, f.accountId) &&
      passesCashFlow(tx, f.cashFlow) &&
      passesSource(tx, f.source),
  )
}
