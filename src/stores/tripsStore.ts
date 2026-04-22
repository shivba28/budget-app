import { create } from 'zustand'

import type { TripRow } from '@/src/db/queries/trips'
import * as txq from '@/src/db/queries/transactions'
import * as q from '@/src/db/queries/trips'

type State = {
  items: TripRow[]
  load: () => void
  add: (input: {
    name: string
    start_date?: string | null
    end_date?: string | null
    budget_limit?: number | null
    color?: string | null
  }) => number
  update: (
    id: number,
    patch: Partial<
      Pick<TripRow, 'name' | 'start_date' | 'end_date' | 'budget_limit' | 'color'>
    >,
  ) => void
  remove: (id: number) => void
}

export const useTripsStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listTrips() }),
  add: (input) => {
    const id = q.insertTrip({
      name: input.name,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget_limit: input.budget_limit ?? null,
      color: input.color ?? null,
      created_at: new Date().toISOString(),
    })
    get().load()
    return id
  },
  update: (id, patch) => {
    q.updateTrip(id, patch)
    get().load()
  },
  remove: (id) => {
    txq.clearTripIdForTrip(id)
    q.deleteTrip(id)
    get().load()
  },
}))
