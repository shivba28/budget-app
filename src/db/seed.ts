import { META_BUDGET_TOTAL_CAP, META_PHASE2_SEEDED, MANUAL_ENROLLMENT_ID } from './constants'
import * as accountsQ from './queries/accounts'
import * as budgetsQ from './queries/budgets'
import * as categoriesQ from './queries/categories'
import * as meta from './queries/appMeta'
import * as transactionsQ from './queries/transactions'

const DEFAULT_ACCOUNT_ID = 'acct_manual_default'

export function runSeedIfNeeded(): void {
  // NOTE: We intentionally do NOT gate on META_PHASE2_SEEDED here.
  // On iOS, Keychain entries survive app deletion/reinstallation, so the flag
  // would be '1' even on a completely fresh DB — causing an empty app.
  // Instead, each section below checks whether data already exists before
  // inserting, which is safe to run on every cold startup.

  const existingCats = categoriesQ.listCategories()
  if (existingCats.length === 0) {
    const seedCategories = [
      { id: 'cat_food', label: 'Food', color: '#E63946', source: 'user' as const },
      { id: 'cat_transport', label: 'Transport', color: '#457B9D', source: 'user' as const },
      { id: 'cat_fun', label: 'Fun', color: '#9B59B6', source: 'user' as const },
      { id: 'cat_bills', label: 'Bills', color: '#111111', source: 'user' as const },
      { id: 'cat_other', label: 'Other', color: '#8D8170', source: 'user' as const },
    ]
    for (const c of seedCategories) {
      categoriesQ.insertCategory(c)
    }
  }

  const manuals = accountsQ.listManualAccounts()
  if (manuals.length === 0) {
    accountsQ.insertAccount({
      id: DEFAULT_ACCOUNT_ID,
      name: 'Cash',
      institution: 'Manual',
      type: 'cash',
      enrollment_id: MANUAL_ENROLLMENT_ID,
      last_seen_tx_id: null,
      last_synced: null,
      depository_amounts_inverted: 0,
      include_in_insights: 1,
    })
  }

  if (transactionsQ.countTransactions() === 0) {
    const accountId =
      accountsQ.listManualAccounts()[0]?.id ?? DEFAULT_ACCOUNT_ID
    transactionsQ.insertTransaction({
      id: `tx_seed_${Date.now()}`,
      account_id: accountId,
      date: new Date().toISOString().slice(0, 10),
      effective_date: null,
      trip_id: null,
      my_share: null,
      amount: -42.5,
      description: 'Coffee & pastries',
      category: 'Food',
      detail_category: null,
      pending: 0,
      user_confirmed: 1,
      source: 'manual',
      account_label: null,
      synced_at: null,
    })
  }

  const budgets = budgetsQ.listBudgets('default')
  if (budgets.length === 0) {
    budgetsQ.insertBudget({
      category: 'Food',
      amount: 500,
      month: 'default',
    })
  }

  if (!meta.getMeta(META_BUDGET_TOTAL_CAP)) {
    meta.setMeta(META_BUDGET_TOTAL_CAP, '2000')
  }

  meta.setMeta(META_PHASE2_SEEDED, '1')
}
