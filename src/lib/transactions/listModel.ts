import type { TransactionRow } from '@/src/db/queries/transactions'

import { monthKeyFromTx, sortDate } from './filters'

export type TxListRow =
  | { type: 'header'; id: string; monthKey: string; count: number }
  | { type: 'transaction'; id: string; tx: TransactionRow }

function groupTransactionsByMonth(transactions: TransactionRow[]) {
  const sorted = [...transactions]
    .filter((tx) => !!tx.date)  // guard against rows with null dates
    .sort((a, b) => sortDate(b).localeCompare(sortDate(a)))

  const byMonth = new Map<string, TransactionRow[]>()
  for (const tx of sorted) {
    const mk = monthKeyFromTx(tx)
    const list = byMonth.get(mk) ?? []
    list.push(tx)
    byMonth.set(mk, list)
  }

  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))
  return { months, byMonth }
}

/** Month keys newest-first (same order as `buildGroupedRows` headers). */
export function getMonthKeysDescending(transactions: TransactionRow[]): string[] {
  return groupTransactionsByMonth(transactions).months
}

export function buildGroupedRows(
  transactions: TransactionRow[],
  collapsedMonthKeys: Set<string>,
): { rows: TxListRow[]; stickyHeaderIndices: number[] } {
  const { months, byMonth } = groupTransactionsByMonth(transactions)

  const rows: TxListRow[] = []
  const stickyHeaderIndices: number[] = []

  for (const mk of months) {
    const list = byMonth.get(mk) ?? []
    const headerIndex = rows.length
    stickyHeaderIndices.push(headerIndex)
    rows.push({
      type: 'header',
      id: `h-${mk}`,
      monthKey: mk,
      count: list.length,
    })
    if (!collapsedMonthKeys.has(mk)) {
      for (const tx of list) {
        rows.push({ type: 'transaction', id: tx.id, tx })
      }
    }
  }

  return { rows, stickyHeaderIndices }
}
