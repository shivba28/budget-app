/** Map Teller transaction JSON to DB / API fields (mirrors frontend heuristics). */

function extractDetailsCategory(raw: Record<string, unknown>): string | null {
  const det = raw.details
  if (!det || typeof det !== 'object' || det === null) return null
  const d = det as Record<string, unknown>
  const c = d.category
  if (typeof c === 'string' && c.trim()) return c
  return null
}

function mapTellerCategoryLabel(label: string): string | null {
  const s = label.trim().toLowerCase()
  if (!s) return null
  const exact: Readonly<Record<string, string>> = {
    dining: 'food',
    restaurant: 'food',
    'fast food': 'food',
    fast_food: 'food',
    coffee: 'food',
    food: 'food',
    groceries: 'groceries',
    grocery: 'groceries',
    shopping: 'groceries',
    transportation: 'transport',
    transit: 'transport',
    auto: 'transport',
    gas: 'transport',
    entertainment: 'entertainment',
    utilities: 'utilities',
    bills: 'utilities',
    housing: 'housing',
    rent: 'housing',
    mortgage: 'housing',
    income: 'other',
    general: 'other',
    fees: 'other',
    medical: 'other',
    travel: 'transport',
  }
  if (exact[s] !== undefined) return exact[s]
  const pairs: readonly (readonly [string, string])[] = [
    ['grocery', 'groceries'],
    ['food and drink', 'food'],
    ['transportation', 'transport'],
  ]
  for (const [needle, id] of pairs) {
    if (s.includes(needle)) return id
  }
  return null
}

function categorizeFromDescription(description: string): string {
  const d = description.toLowerCase()
  if (d.includes('rent') || d.includes('mortgage')) return 'housing'
  if (d.includes('uber') || d.includes('lyft') || d.includes('gas')) return 'transport'
  if (
    d.includes('restaurant') ||
    d.includes('cafe') ||
    d.includes('coffee') ||
    d.includes('food')
  ) {
    return 'food'
  }
  if (d.includes('whole foods') || d.includes('grocery') || d.includes('market')) {
    return 'groceries'
  }
  return 'other'
}

export function unwrapTransactionList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'transactions' in data) {
    const inner = (data as { transactions: unknown }).transactions
    if (Array.isArray(inner)) return inner
  }
  return []
}

export function parseTellerTransaction(
  raw: unknown,
  fallbackAccountId: string,
  opts?: { accountType?: string | null } | null,
): {
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  category: string
  detailCategory: string | null
  pending: boolean
} | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  if (!id) return null
  const accountId =
    typeof r.account_id === 'string'
      ? r.account_id
      : typeof r.accountId === 'string'
        ? r.accountId
        : fallbackAccountId
  let amount = 0
  if (typeof r.amount === 'number' && Number.isFinite(r.amount)) amount = r.amount
  else if (typeof r.amount === 'string') {
    const n = parseFloat(r.amount)
    if (Number.isFinite(n)) amount = n
  }

  // Normalize direction for depository accounts if Teller sign is inverted for that feed.
  // App convention (used by UI + analytics): amount > 0 = outflow/spend, amount < 0 = inflow/income.
  // Observed: some Teller depository accounts return the opposite sign (credits positive, debits negative),
  // while credit accounts match the convention. Use account type from the accounts table.
  const accountType = opts?.accountType?.trim().toLowerCase() ?? ''
  if (accountType === 'depository') {
    amount = -amount
  }

  let date = ''
  if (typeof r.date === 'string') date = r.date.slice(0, 10)
  let description = 'Transaction'
  if (typeof r.description === 'string' && r.description) description = r.description
  else if (r.details && typeof r.details === 'object' && r.details !== null) {
    const d = r.details as Record<string, unknown>
    if (typeof d.description === 'string' && d.description) description = d.description
  }
  const detailsCategory = extractDetailsCategory(r)
  const category =
    detailsCategory !== null
      ? (mapTellerCategoryLabel(detailsCategory) ?? 'other')
      : categorizeFromDescription(description)
  const pending = r.status === 'pending' || r.pending === true
  return {
    id,
    accountId,
    date,
    amount,
    description,
    category,
    detailCategory: detailsCategory,
    pending,
  }
}
