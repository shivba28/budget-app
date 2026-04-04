import type { Transaction } from './domain'

export type DatePreset =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'last_90'
  | 'ytd'
  | 'custom'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local calendar YYYY-MM-DD (no UTC shift). */
export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function getDateFilterRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): { readonly from: string; readonly to: string } | null {
  const today = new Date()
  const todayStr = toYMD(today)

  switch (preset) {
    case 'all':
      return null
    case 'this_month': {
      const a = startOfMonth(today)
      const b = endOfMonth(today)
      return { from: toYMD(a), to: toYMD(b) }
    }
    case 'last_month': {
      const firstThis = startOfMonth(today)
      const lastPrev = new Date(firstThis.getTime() - 86400000)
      const a = startOfMonth(lastPrev)
      const b = endOfMonth(lastPrev)
      return { from: toYMD(a), to: toYMD(b) }
    }
    case 'last_90': {
      const start = new Date(today)
      start.setDate(start.getDate() - 89)
      return { from: toYMD(start), to: todayStr }
    }
    case 'ytd': {
      return { from: `${today.getFullYear()}-01-01`, to: todayStr }
    }
    case 'custom': {
      const from = customFrom.trim()
      const to = customTo.trim()
      if (from.length < 10 || to.length < 10) return null
      return from <= to ? { from, to } : { from: to, to: from }
    }
    default:
      return null
  }
}

export function transactionMatchesDatePreset(
  tx: Transaction,
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): boolean {
  const range = getDateFilterRange(preset, customFrom, customTo)
  if (range === null) return true
  return tx.date >= range.from && tx.date <= range.to
}

export interface MonthGroup {
  readonly monthKey: string
  readonly transactions: Transaction[]
}

/** `monthKey` = `YYYY-MM`; months newest-first; transactions within month newest-first. */
export function groupTransactionsByMonth(
  transactions: Transaction[],
): MonthGroup[] {
  const map = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const mk = tx.date.slice(0, 7)
    const list = map.get(mk)
    if (list) list.push(tx)
    else map.set(mk, [tx])
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date))
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, txs]) => ({ monthKey, transactions: txs }))
}

export function formatMonthHeading(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
