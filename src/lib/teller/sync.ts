import NetInfo from '@react-native-community/netinfo'

import { META_LAST_TELLER_SYNC_AT } from '@/src/db/constants'
import * as accountsQ from '@/src/db/queries/accounts'
import * as categoriesQ from '@/src/db/queries/categories'
import * as meta from '@/src/db/queries/appMeta'
import * as tellerEq from '@/src/db/queries/tellerEnrollments'
import type { TransactionRow } from '@/src/db/queries/transactions'
import * as txq from '@/src/db/queries/transactions'
import { sqlite } from '@/src/db/index'
import { transactions } from '@/src/db/schema'
import {
  fetchAccountsRaw,
  fetchTransactionsPage,
} from '@/src/lib/teller/client'
import * as enrollmentStore from '@/src/lib/teller/enrollmentStore'
import { TellerHttpError } from '@/src/lib/teller/client'
import { parseTellerTransaction } from '@/src/lib/teller/txMap'
import { runBudgetAlertCheck } from '@/src/lib/notifications'

type InsertTx = typeof transactions.$inferInsert

const PAGE_SIZE = 200
const MAX_PAGES_PER_WAVE = 30
const MAX_WAVES = 2

function txIsoDate(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const ds = r.date
  if (typeof ds !== 'string' || ds.length < 10) return null
  return ds.slice(0, 10)
}

function persistBankTransaction(merged: InsertTx): void {
  const ex = txq.getTransaction(merged.id)
  if (ex) {
    txq.updateTransaction(merged.id, {
      account_id: merged.account_id,
      date: merged.date,
      effective_date: merged.effective_date,
      trip_id: merged.trip_id,
      my_share: merged.my_share,
      amount: merged.amount,
      description: merged.description,
      category: merged.category,
      detail_category: merged.detail_category,
      pending: merged.pending,
      user_confirmed: merged.user_confirmed,
      source: merged.source,
      account_label: merged.account_label,
      synced_at: merged.synced_at,
    })
  } else {
    txq.insertTransaction(merged)
  }
}

function buildMergedInsert(
  parsed: NonNullable<ReturnType<typeof parseTellerTransaction>>,
  accountName: string | null,
  existing: TransactionRow | undefined,
  now: string,
): InsertTx {
  const base = {
    id: parsed.id,
    account_id: parsed.accountId,
    date: parsed.date,
    amount: parsed.amount,
    description: parsed.description,
    category: parsed.category,
    detail_category: parsed.detailCategory,
    pending: (parsed.pending ? 1 : 0) as 0 | 1,
    source: 'bank' as const,
    account_label: accountName,
    synced_at: now,
  }
  if (!existing) {
    return {
      ...base,
      effective_date: null,
      trip_id: null,
      my_share: null,
      user_confirmed: 0,
    }
  }
  return {
    ...base,
    effective_date: existing.effective_date,
    trip_id: existing.trip_id,
    my_share: existing.my_share,
    user_confirmed: existing.user_confirmed,
  }
}

function maybeFlipDepositoryHistory(account: accountsQ.AccountRow): void {
  const t = account.type?.trim().toLowerCase() ?? ''
  if (t !== 'depository' || account.depository_amounts_inverted === 1) return
  sqlite.runSync(
    'UPDATE transactions SET amount = -amount WHERE account_id = ?',
    account.id,
  )
  accountsQ.updateAccount(account.id, { depository_amounts_inverted: 1 })
}

async function syncAccountTransactions(
  account: accountsQ.AccountRow,
  accessToken: string,
): Promise<void> {
  maybeFlipDepositoryHistory(account)

  const stopAtId = account.last_seen_tx_id
  const refreshMinIso = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })()

  const merged: unknown[] = []
  let fromId: string | null = null
  let newestId: string | null = null
  let hitStop = false
  let oldestDateSeen: string | null = null
  let truncatedByPageCap = false

  for (let wave = 0; wave < MAX_WAVES && !hitStop; wave++) {
    let waveTruncated = false
    for (let page = 0; page < MAX_PAGES_PER_WAVE && !hitStop; page++) {
      const list = await fetchTransactionsPage(account.id, accessToken, {
        count: PAGE_SIZE,
        from_id: fromId,
      })
      if (list.length === 0) break

      for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : null
        if (id && newestId === null) newestId = id
        const iso = txIsoDate(raw)
        if (iso && (oldestDateSeen === null || iso < oldestDateSeen)) {
          oldestDateSeen = iso
        }
        if (stopAtId && id === stopAtId) {
          const allowStop =
            oldestDateSeen !== null && oldestDateSeen < refreshMinIso
          if (allowStop) {
            hitStop = true
            break
          }
        }
        merged.push(raw)
      }

      if (hitStop) break

      const last = list[list.length - 1]
      const lastId =
        last && typeof last === 'object' && typeof (last as { id?: unknown }).id === 'string'
          ? ((last as { id: string }).id)
          : null
      if (!lastId) break
      fromId = lastId

      if (list.length < PAGE_SIZE) break
      if (page === MAX_PAGES_PER_WAVE - 1) waveTruncated = true
    }
    truncatedByPageCap = waveTruncated
    if (!waveTruncated) break
  }

  const accountType = account.type?.toLowerCase() ?? null
  const now = new Date().toISOString()
  const parsedRows: NonNullable<ReturnType<typeof parseTellerTransaction>>[] =
    []

  for (const raw of merged) {
    const p = parseTellerTransaction(raw, account.id, { accountType })
    if (!p) continue
    parsedRows.push(p)
    categoriesQ.ensureTellerCategoryLabel(p.category)
    const existing = txq.getTransaction(p.id)
    const mergedRow = buildMergedInsert(
      p,
      account.name ?? null,
      existing,
      now,
    )
    persistBankTransaction(mergedRow)
  }

  const canReconcileOrphans =
    stopAtId === null && !truncatedByPageCap && parsedRows.length > 0
  if (canReconcileOrphans) {
    let minDate = parsedRows[0]!.date
    let maxDate = parsedRows[0]!.date
    for (const p of parsedRows) {
      if (p.date < minDate) minDate = p.date
      if (p.date > maxDate) maxDate = p.date
    }
    const keepIds = parsedRows.map((r) => r.id)
    const placeholders = keepIds.map(() => '?').join(',')
    sqlite.runSync(
      `DELETE FROM transactions
       WHERE account_id = ?
         AND date >= ?
         AND date <= ?
         AND source = 'bank'
         AND id NOT IN (${placeholders})`,
      account.id,
      minDate,
      maxDate,
      ...keepIds,
    )
  }

  if (newestId) {
    accountsQ.updateAccount(account.id, { last_seen_tx_id: newestId })
  }
  accountsQ.updateAccount(account.id, { last_synced: now })

  sqlite.runSync(
    `DELETE FROM transactions AS t_del
     WHERE t_del.account_id = ?
       AND t_del.pending = 1
       AND EXISTS (
         SELECT 1 FROM transactions AS t_keep
         WHERE t_keep.account_id = t_del.account_id
           AND t_keep.pending = 0
           AND t_keep.amount = t_del.amount
           AND lower(trim(coalesce(t_keep.description, ''))) =
               lower(trim(coalesce(t_del.description, '')))
           AND abs(julianday(t_keep.date) - julianday(t_del.date)) <= 5
           AND t_keep.id != t_del.id
       )`,
    account.id,
  )
}

function parseTellerAccount(
  raw: unknown,
  enrollmentId: string,
): {
  id: string
  name: string | null
  institution: string | null
  type: string | null
} | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  if (!id) return null
  const name = typeof r.name === 'string' ? r.name : null
  let institution: string | null = null
  if (
    r.institution &&
    typeof r.institution === 'object' &&
    r.institution !== null
  ) {
    const ins = r.institution as Record<string, unknown>
    if (typeof ins.name === 'string') institution = ins.name
  }
  const type = typeof r.type === 'string' ? r.type : null
  return { id, name, institution, type }
}

export async function upsertAccountsForEnrollment(
  enrollmentId: string,
  accessToken: string,
): Promise<void> {
  const rawList = await fetchAccountsRaw(accessToken)
  for (const raw of rawList) {
    const p = parseTellerAccount(raw, enrollmentId)
    if (!p) continue
    const existing = accountsQ.getAccount(p.id)
    accountsQ.upsertBankAccountRow({
      id: p.id,
      name: p.name,
      institution: p.institution,
      type: p.type,
      enrollment_id: enrollmentId,
      last_seen_tx_id: existing?.last_seen_tx_id ?? null,
      last_synced: existing?.last_synced ?? null,
      depository_amounts_inverted: existing?.depository_amounts_inverted ?? 0,
      include_in_insights: existing?.include_in_insights ?? 1,
    })
  }
}

export async function syncTellerAllAccounts(): Promise<void> {
  const net = await NetInfo.fetch()
  if (!net.isConnected) {
    throw new Error('You are offline. Sync needs a network connection.')
  }

  const enrollments = tellerEq.listTellerEnrollments()
  if (enrollments.length === 0) {
    meta.setMeta(META_LAST_TELLER_SYNC_AT, new Date().toISOString())
    await runBudgetAlertCheck('sync').catch(() => {})
    return
  }

  for (const e of enrollments) {
    const tok = await enrollmentStore.getAccessToken(e.enrollment_id)
    if (!tok) continue
    try {
      await upsertAccountsForEnrollment(e.enrollment_id, tok)
      tellerEq.upsertTellerEnrollment({
        enrollment_id: e.enrollment_id,
        institution_name: e.institution_name ?? null,
        user_id: e.user_id ?? null,
        status: 'connected',
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
    } catch (err) {
      const status =
        err instanceof TellerHttpError && (err.status === 401 || err.status === 403)
          ? 'disconnected'
          : 'connected'
      tellerEq.upsertTellerEnrollment({
        enrollment_id: e.enrollment_id,
        institution_name: e.institution_name ?? null,
        user_id: e.user_id ?? null,
        status,
        last_sync_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : 'Sync failed',
      })
    }
  }

  const bankAccounts = accountsQ.listBankLinkedAccounts()
  for (const acc of bankAccounts) {
    const tok = await enrollmentStore.getAccessToken(acc.enrollment_id)
    if (!tok) continue
    try {
      await syncAccountTransactions(acc, tok)
    } catch (err) {
      // Transaction sync failure should also mark the enrollment as needing attention.
      const existing = tellerEq
        .listTellerEnrollments()
        .find((e) => e.enrollment_id === acc.enrollment_id)
      const status =
        err instanceof TellerHttpError && (err.status === 401 || err.status === 403)
          ? 'disconnected'
          : 'connected'
      tellerEq.upsertTellerEnrollment({
        enrollment_id: acc.enrollment_id,
        institution_name: existing?.institution_name ?? null,
        user_id: existing?.user_id ?? null,
        status,
        last_sync_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : 'Sync failed',
      })
    }
  }

  meta.setMeta(META_LAST_TELLER_SYNC_AT, new Date().toISOString())
  await runBudgetAlertCheck('sync').catch(() => {})
}

/** Fetch accounts + transactions from Teller for one enrollment (token from SecureStore). */
export async function syncTellerForEnrollment(enrollmentId: string): Promise<void> {
  const token = await enrollmentStore.getAccessToken(enrollmentId)
  if (!token) return
  const now = new Date().toISOString()
  try {
    await upsertAccountsForEnrollment(enrollmentId, token)
    const linked = accountsQ
      .listBankLinkedAccounts()
      .filter((a) => a.enrollment_id === enrollmentId)
    for (const acc of linked) {
      await syncAccountTransactions(acc, token)
    }
    const existing = tellerEq
      .listTellerEnrollments()
      .find((e) => e.enrollment_id === enrollmentId)
    tellerEq.upsertTellerEnrollment({
      enrollment_id: enrollmentId,
      institution_name: existing?.institution_name ?? null,
      user_id: existing?.user_id ?? null,
      status: 'connected',
      last_sync_at: now,
      last_error: null,
    })
    await runBudgetAlertCheck('sync').catch(() => {})
  } catch (err) {
    const existing = tellerEq
      .listTellerEnrollments()
      .find((e) => e.enrollment_id === enrollmentId)
    const status =
      err instanceof TellerHttpError && (err.status === 401 || err.status === 403)
        ? 'disconnected'
        : 'connected'
    tellerEq.upsertTellerEnrollment({
      enrollment_id: enrollmentId,
      institution_name: existing?.institution_name ?? null,
      user_id: existing?.user_id ?? null,
      status,
      last_sync_at: now,
      last_error: err instanceof Error ? err.message : 'Sync failed',
    })
    throw err
  }
}

export async function disconnectTellerEnrollment(
  enrollmentId: string,
): Promise<void> {
  await enrollmentStore.deleteEnrollment(enrollmentId)
}
