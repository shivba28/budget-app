/** Map Teller transaction JSON to local fields (ported from budget-app api/src/teller/txMap.ts). */

function extractDetailsCategory(raw: Record<string, unknown>): string | null {
  const det = raw.details
  if (!det || typeof det !== 'object' || det === null) return null
  const d = det as Record<string, unknown>
  const c = d.category
  if (typeof c === 'string' && c.trim()) return c
  return null
}

function mapTellerCategoryLabel(label: string): string | null {
  const s = label.trim()
  return s ? s : null
}

export function unwrapTransactionList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'transactions' in data) {
    const inner = (data as { transactions: unknown }).transactions
    if (Array.isArray(inner)) return inner
  }
  return []
}

export function unwrapAccountList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'accounts' in data) {
    const inner = (data as { accounts: unknown }).accounts
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

  // Teller sign convention:
  // - Depository: negative = spending (debit), positive = deposit → keep as-is
  // - Credit: positive = charge (spending), negative = payment/credit → flip so charges are negative
  const accountType = opts?.accountType?.trim().toLowerCase() ?? ''
  if (accountType === 'credit') {
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
      ? (mapTellerCategoryLabel(detailsCategory) ?? 'Other')
      : 'Other'
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
