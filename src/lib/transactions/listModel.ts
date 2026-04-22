import type { TransactionRow } from '@/src/db/queries/transactions'

import { monthKeyFromTx, sortDate } from './filters'

export type TxListRow =
  | { type: 'header'; id: string; monthKey: string; count: number }
  | { type: 'transaction'; id: string; tx: TransactionRow }

export function buildGroupedRows(
  transactions: TransactionRow[],
  collapsedMonthKeys: Set<string>,
): { rows: TxListRow[]; stickyHeaderIndices: number[] } {
  const sorted = [...transactions].sort((a, b) =>
    sortDate(b).localeCompare(sortDate(a)),
  )

  const byMonth = new Map<string, TransactionRow[]>()
  for (const tx of sorted) {
    const mk = monthKeyFromTx(tx)
    const list = byMonth.get(mk) ?? []
    list.push(tx)
    byMonth.set(mk, list)
  }

  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))

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
