import { randomUUID } from 'expo-crypto'
import { create } from 'zustand'

import type { TransactionRow } from '@/src/db/queries/transactions'
import * as q from '@/src/db/queries/transactions'
import { transactions } from '@/src/db/schema'

type InsertTx = typeof transactions.$inferInsert

type State = {
  items: TransactionRow[]
  load: () => void
  add: (input: Omit<InsertTx, 'id'> & { id?: string }) => void
  update: (id: string, patch: Partial<Omit<TransactionRow, 'id'>>) => void
  remove: (id: string) => void
}

export const useTransactionsStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listTransactions() }),
  add: (input) => {
    const id = input.id ?? randomUUID()
    const row: InsertTx = {
      pending: 0,
      user_confirmed: 1,
      source: 'manual',
      ...input,
      id,
    }
    q.insertTransaction(row)
    get().load()
  },
  update: (id, patch) => {
    q.updateTransaction(id, patch)
    get().load()
  },
  remove: (id) => {
    q.deleteTransaction(id)
    get().load()
  },
}))
