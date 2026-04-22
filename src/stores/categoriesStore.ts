import { create } from 'zustand'

import type { CategoryRow } from '@/src/db/queries/categories'
import * as q from '@/src/db/queries/categories'

type State = {
  items: CategoryRow[]
  load: () => void
  add: (input: { label: string; color?: string | null }) => void
  update: (id: string, patch: Partial<Pick<CategoryRow, 'label' | 'color'>>) => void
  remove: (id: string) => void
}

function newId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export const useCategoriesStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listCategories() }),
  add: (input) => {
    q.insertCategory({
      id: newId(),
      label: input.label,
      color: input.color ?? null,
      source: 'user',
    })
    get().load()
  },
  update: (id, patch) => {
    q.updateCategory(id, patch)
    get().load()
  },
  remove: (id) => {
    q.deleteCategory(id)
    get().load()
  },
}))
