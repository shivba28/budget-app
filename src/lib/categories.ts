import { mergedCategoryDefinitions } from '@/lib/categoryCanonical'

type Rule = { readonly pattern: RegExp; readonly categoryId: string }

/**
 * Keyword-based fallback when Teller does not supply a category.
 * Returns a category id from {@link CATEGORIES}.
 */
const RULES: readonly Rule[] = [
  {
    pattern: /\b(uber|lyft|taxi|cab|transit|metro|bus\s+fare|parking|toll)\b/i,
    categoryId: 'transport',
  },
  {
    pattern: /\b(netflix|spotify|hulu|disney\+?|hbo|streaming|paramount|peacock)\b/i,
    categoryId: 'entertainment',
  },
  {
    pattern:
      /\b(whole\s*foods|trader\s*joe|safeway|kroger|publix|aldi|wegmans|grocery|groceries|costco\s*(food|market)?)\b/i,
    categoryId: 'groceries',
  },
  {
    pattern: /\b(doordash|grubhub|uber\s*eats|restaurant|cafe|coffee|starbucks|mcdonald|chipotle)\b/i,
    categoryId: 'food',
  },
  {
    pattern: /\b(rent|mortgage|landlord|hoa)\b/i,
    categoryId: 'housing',
  },
  {
    pattern: /\b(electric|gas\s+bill|water\s+bill|internet|utility|utilities|at&t|verizon|comcast)\b/i,
    categoryId: 'utilities',
  },
]

export function categorize(description: string): string {
  const trimmed = description.trim()
  if (!trimmed) return 'other'
  for (const { pattern, categoryId } of RULES) {
    if (pattern.test(trimmed)) return categoryId
  }
  return 'other'
}

export function isKnownCategoryId(id: string): boolean {
  return mergedCategoryDefinitions().some((c) => c.id === id)
}
