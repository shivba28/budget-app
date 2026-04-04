export interface Category {
  readonly id: string
  readonly label: string
}

export const CATEGORIES: readonly Category[] = [
  { id: 'food', label: 'Food & dining' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'transport', label: 'Transport' },
  { id: 'housing', label: 'Housing' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'other', label: 'Other' },
] as const
