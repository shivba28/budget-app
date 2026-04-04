import type { Category } from './categories'
import { CATEGORIES } from './categories'

/** Category colors for pie chart, pills, and row accents (UI chrome stays grayscale). */
export const CATEGORY_COLORS: Readonly<Record<Category['id'], string>> = {
  food: '#f97316',
  groceries: '#16a34a',
  transport: '#3b82f6',
  housing: '#8b5cf6',
  utilities: '#eab308',
  entertainment: '#ec4899',
  other: '#64748b',
}

export const CHART_PALETTE: readonly string[] = CATEGORIES.map(
  (c) => CATEGORY_COLORS[c.id],
)
