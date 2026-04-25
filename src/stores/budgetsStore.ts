import { create } from 'zustand'

import { META_BUDGET_TOTAL_CAP } from '@/src/db/constants'
import type { BudgetRow } from '@/src/db/queries/budgets'
import * as q from '@/src/db/queries/budgets'
import * as meta from '@/src/db/queries/appMeta'
import { runBudgetAlertCheck } from '@/src/lib/notifications'

type State = {
  items: BudgetRow[]
  month: string
  totalCap: number | null
  load: () => void
  setMonth: (month: string) => void
  setTotalCap: (cap: number | null) => void
  add: (input: { category: string; amount: number; month?: string }) => void
  update: (
    id: number,
    patch: Partial<Pick<BudgetRow, 'category' | 'amount' | 'month'>>,
  ) => void
  remove: (id: number) => void
}

export const useBudgetsStore = create<State>((set, get) => ({
  items: [],
  month: 'default',
  totalCap: null,
  load: () => {
    const { month } = get()
    const raw = meta.getMeta(META_BUDGET_TOTAL_CAP)
    const cap =
      raw === undefined || raw === '' ? null : Number(raw)
    set({
      items: q.listBudgets(month),
      totalCap: cap !== null && !Number.isNaN(cap) ? cap : null,
    })
  },
  setMonth: (month) => {
    set({ month })
    set({ items: q.listBudgets(month) })
  },
  setTotalCap: (cap) => {
    if (cap === null || Number.isNaN(cap)) {
      meta.deleteMeta(META_BUDGET_TOTAL_CAP)
      set({ totalCap: null })
      return
    }
    meta.setMeta(META_BUDGET_TOTAL_CAP, String(cap))
    set({ totalCap: cap })
  },
  add: (input) => {
    const month = input.month ?? get().month
    q.upsertBudgetForMonth({
      category: input.category,
      amount: input.amount,
      month,
    })
    get().load()
    void runBudgetAlertCheck('budget_change')
  },
  update: (id, patch) => {
    q.updateBudget(id, patch)
    get().load()
    void runBudgetAlertCheck('budget_change')
  },
  remove: (id) => {
    q.deleteBudget(id)
    get().load()
    void runBudgetAlertCheck('budget_change')
  },
}))
