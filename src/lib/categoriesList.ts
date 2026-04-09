import type { Category } from '@/constants/categories'
import { CATEGORIES } from '@/constants/categories'
import * as storage from '@/lib/storage'

export function listAllCategories(): readonly Category[] {
  const server = storage.getCategories()
  if (server && server.length > 0) {
    return server.map((c) => ({ id: c.id, label: c.label }))
  }

  // Fallback: built-in categories before first categories fetch completes.
  return CATEGORIES
}

