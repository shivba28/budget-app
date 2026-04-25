import { create } from 'zustand'

import type { CategoryRow } from '@/src/db/queries/categories'
import * as q from '@/src/db/queries/categories'
import * as txq from '@/src/db/queries/transactions'

import { useTransactionsStore } from './transactionsStore'

type State = {
  items: CategoryRow[]
  load: () => void
  /** Returns false if a category with the same name (case-insensitive) already exists. */
  add: (input: { label: string; color?: string | null }) => boolean
  /** Returns false if renaming would duplicate another category’s name. */
  update: (id: string, patch: Partial<Pick<CategoryRow, 'label' | 'color'>>) => boolean
  /** User categories only; clears matching transaction categories. Returns false for bank rows or missing id. */
  remove: (id: string) => boolean
}

function newId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export const useCategoriesStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listCategories() }),
  add: (input) => {
    const label = input.label.trim()
    if (!label) return false
    if (q.findCategoryByLabelCaseInsensitive(label)) return false
    q.insertCategory({
      id: newId(),
      label,
      color: input.color ?? null,
      source: 'user',
    })
    get().load()
    return true
  },
  update: (id, patch) => {
    if (patch.label !== undefined) {
      const next = patch.label.trim()
      if (!next) return false
      const hit = q.findCategoryByLabelCaseInsensitive(next)
      if (hit && hit.id !== id) return false
    }
    q.updateCategory(id, patch)
    get().load()
    return true
  },
  remove: (id) => {
    const row = q.getCategory(id)
    if (!row || row.source !== 'user') return false
    txq.clearTransactionsCategoryMatchingLabel(row.label)
    q.deleteCategory(id)
    get().load()
    useTransactionsStore.getState().load()
    return true
  },
}))
