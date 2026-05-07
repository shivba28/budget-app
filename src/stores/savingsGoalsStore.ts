import { create } from 'zustand'

import type { SavingsGoalRow } from '@/src/db/queries/savingsGoals'
import * as q from '@/src/db/queries/savingsGoals'

type State = {
  items: SavingsGoalRow[]
  load: () => void
  add: (input: {
    name: string
    target_amount: number
    current_amount?: number
    target_date?: string | null
    color?: string | null
    notes?: string | null
  }) => number
  update: (
    id: number,
    patch: Partial<Omit<SavingsGoalRow, 'id'>>,
  ) => void
  remove: (id: number) => void
}

export const useSavingsGoalsStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listSavingsGoals() }),
  add: (input) => {
    const id = q.insertSavingsGoal({
      name: input.name,
      target_amount: input.target_amount,
      current_amount: input.current_amount ?? 0,
      target_date: input.target_date ?? null,
      color: input.color ?? null,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    })
    get().load()
    return id
  },
  update: (id, patch) => {
    q.updateSavingsGoal(id, patch)
    get().load()
  },
  remove: (id) => {
    q.deleteSavingsGoal(id)
    get().load()
  },
}))
