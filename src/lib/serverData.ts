import axios from 'axios'
import type { Account, Transaction, Trip } from '@/lib/domain'
import type { MonthlyBudgetsStoredV1 } from '@/lib/storage'
import * as storage from '@/lib/storage'
import { userDataApi } from '@/lib/userDataApi'

export type ServerCategory = {
  id: string
  label: string
  color: string
  source: 'teller' | 'user'
}

function mapServerTransaction(row: Record<string, unknown>): Transaction | null {
  const id = typeof row.id === 'string' ? row.id : null
  const accountId = typeof row.accountId === 'string' ? row.accountId : null
  const date = typeof row.date === 'string' ? row.date : null
  const categoryId = typeof row.categoryId === 'string' ? row.categoryId : null
  const description = typeof row.description === 'string' ? row.description : null
  if (!id || !accountId || !date || !categoryId || !description) return null
  let amount = 0
  if (typeof row.amount === 'number' && Number.isFinite(row.amount)) amount = row.amount
  else if (typeof row.amount === 'string') {
    const n = parseFloat(row.amount)
    if (Number.isFinite(n)) amount = n
  }
  const detailCategory =
    typeof row.detailCategory === 'string' ? row.detailCategory : undefined

  let effectiveDate: string | null | undefined
  if (row.effectiveDate === null || row.effective_date === null) {
    effectiveDate = null
  } else if (typeof row.effectiveDate === 'string' && row.effectiveDate.length >= 7) {
    effectiveDate = row.effectiveDate.slice(0, 10)
  } else if (typeof row.effective_date === 'string' && row.effective_date.length >= 7) {
    effectiveDate = row.effective_date.slice(0, 10)
  }

  const tripRaw = row.tripId !== undefined ? row.tripId : row.trip_id
  let tripId: number | null | undefined
  if (tripRaw === null) tripId = null
  else if (typeof tripRaw === 'number' && Number.isFinite(tripRaw)) tripId = tripRaw

  const myShareRaw = row.myShare !== undefined ? row.myShare : row.my_share
  let myShare: number | null | undefined
  if (myShareRaw === null) {
    myShare = null
  } else if (typeof myShareRaw === 'number' && Number.isFinite(myShareRaw)) {
    myShare = myShareRaw
  } else if (typeof myShareRaw === 'string') {
    const n = Number(myShareRaw)
    if (Number.isFinite(n)) myShare = n
  }

  const pr = row.pending
  const pending = pr === true || pr === 'true'

  const base: Transaction = {
    id,
    accountId,
    amount,
    date: date.slice(0, 10),
    categoryId,
    description,
    ...(myShare !== undefined ? { myShare } : {}),
    ...(pending ? { pending: true as const } : {}),
  }
  if (effectiveDate !== undefined) {
    ;(base as Transaction & { effectiveDate?: string | null }).effectiveDate =
      effectiveDate
  }
  if (tripId !== undefined) {
    ;(base as Transaction & { tripId?: number | null }).tripId = tripId
  }
  return detailCategory !== undefined
    ? { ...base, detailCategory }
    : base
}

function mapServerTrip(row: Record<string, unknown>): Trip | null {
  if (typeof row.id !== 'number' || !Number.isFinite(row.id)) return null
  if (typeof row.name !== 'string' || !row.name.trim()) return null
  const startDate =
    typeof row.startDate === 'string' ? row.startDate.slice(0, 10) : null
  if (!startDate || startDate.length < 10) return null
  const endDate =
    row.endDate === null || row.endDate === undefined
      ? null
      : typeof row.endDate === 'string'
        ? row.endDate.slice(0, 10)
        : null
  let budgetLimit: number | null = null
  if (row.budgetLimit !== null && row.budgetLimit !== undefined) {
    const n = Number(row.budgetLimit)
    if (Number.isFinite(n)) budgetLimit = n
  }
  const color =
    row.color === null || row.color === undefined
      ? null
      : typeof row.color === 'string'
        ? row.color
        : null
  const createdAt =
    typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString()
  return {
    id: row.id,
    name: row.name.trim(),
    startDate,
    endDate,
    budgetLimit,
    color,
    createdAt,
  }
}

export async function fetchTransactionsFromServer(): Promise<Transaction[] | null> {
  try {
    const { data } = await userDataApi.get<{ transactions?: unknown }>(
      '/transactions',
    )
    const list = Array.isArray(data.transactions) ? data.transactions : []
    const out: Transaction[] = []
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const tx = mapServerTransaction(row as Record<string, unknown>)
      if (tx) out.push(tx)
    }
    return out
  } catch {
    return null
  }
}

export async function fetchTripsFromServer(): Promise<Trip[] | null> {
  try {
    const { data } = await userDataApi.get<{ trips?: unknown }>('/trips')
    const list = Array.isArray(data.trips) ? data.trips : []
    const out: Trip[] = []
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const t = mapServerTrip(row as Record<string, unknown>)
      if (t) out.push(t)
    }
    return out
  } catch {
    return null
  }
}

export async function fetchBudgetsFromServer(): Promise<MonthlyBudgetsStoredV1 | null> {
  try {
    const { data } = await userDataApi.get<MonthlyBudgetsStoredV1>('/budgets')
    if (data && data.v === 1 && data.categories && typeof data.categories === 'object') {
      return {
        v: 1,
        categories: data.categories,
        totalMonthly:
          data.totalMonthly === undefined ? null : data.totalMonthly,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function putBudgetsToServer(
  payload: MonthlyBudgetsStoredV1,
): Promise<boolean> {
  try {
    await userDataApi.put('/budgets', payload)
    return true
  } catch {
    return false
  }
}

export async function fetchCategoriesFromServer(): Promise<ServerCategory[] | null> {
  try {
    const { data } = await userDataApi.get<{ categories?: unknown }>('/categories')
    const list = Array.isArray(data.categories) ? data.categories : []
    const out: ServerCategory[] = []
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const id = typeof r.id === 'string' ? r.id : ''
      const label = typeof r.label === 'string' ? r.label : ''
      const color = typeof r.color === 'string' ? r.color : '#94a3b8'
      const source = r.source === 'user' ? 'user' : 'teller'
      if (!id || !label) continue
      out.push({ id, label, color, source })
    }
    return out
  } catch {
    return null
  }
}

export type CreateCategoryOnServerResult =
  | { ok: true; id: string }
  | { ok: false; duplicate: boolean }

export async function createCategoryOnServer(input: {
  label: string
  color: string
}): Promise<CreateCategoryOnServerResult> {
  try {
    const { data } = await userDataApi.post<{ id?: unknown }>('/categories', {
      label: input.label,
      color: input.color,
    })
    const id = typeof data?.id === 'string' ? data.id : null
    if (!id) return { ok: false, duplicate: false }
    return { ok: true, id }
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      return { ok: false, duplicate: true }
    }
    return { ok: false, duplicate: false }
  }
}

export async function updateCategoryColorOnServer(input: {
  id: string
  color: string
}): Promise<boolean> {
  try {
    await userDataApi.patch(`/categories/${encodeURIComponent(input.id)}`, {
      color: input.color,
    })
    return true
  } catch {
    return false
  }
}

export async function deleteCategoryOnServer(id: string): Promise<boolean> {
  try {
    await userDataApi.delete(`/categories/${encodeURIComponent(id)}`)
    return true
  } catch {
    return false
  }
}

export async function hydrateServerCachesAfterLogin(): Promise<void> {
  let linkedAccounts: Account[] | null = null
  try {
    const { fetchAccounts } = await import('@/lib/api')
    linkedAccounts = await fetchAccounts()
    storage.saveAccounts(linkedAccounts)
  } catch {
    /* accounts will hydrate on first sync */
  }
  const cats = await fetchCategoriesFromServer()
  if (cats) {
    storage.saveCategories(cats)
  }
  const bud = await fetchBudgetsFromServer()
  if (bud) storage.saveMonthlyBudgets(bud, { skipRemote: true })
  if (linkedAccounts !== null && linkedAccounts.length === 0) {
    storage.saveTransactions([])
  } else {
    const txs = await fetchTransactionsFromServer()
    if (txs && linkedAccounts !== null && linkedAccounts.length > 0) {
      const allowed = new Set(linkedAccounts.map((a) => a.id))
      storage.saveTransactions(txs.filter((t) => allowed.has(t.accountId)))
    } else if (txs) {
      storage.saveTransactions(txs)
    }
  }
  const trips = await fetchTripsFromServer()
  if (trips) storage.saveTrips(trips)
}

export async function createTripOnServer(input: {
  name: string
  startDate: string
  endDate: string | null
  budgetLimit: number | null
  color: string | null
}): Promise<Trip | null> {
  try {
    const { data } = await userDataApi.post<{ id: number }>('/trips', {
      name: input.name,
      start_date: input.startDate.slice(0, 10),
      end_date: input.endDate,
      budget_limit: input.budgetLimit,
      color: input.color,
    })
    const id = data?.id
    if (!Number.isFinite(id)) return null
    const trips = await fetchTripsFromServer()
    if (trips) storage.saveTrips(trips)
    return trips?.find((t) => t.id === id) ?? null
  } catch {
    return null
  }
}

export async function updateTripOnServer(
  tripId: number,
  patch: Partial<{
    name: string
    startDate: string
    endDate: string | null
    budgetLimit: number | null
    color: string | null
  }>,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name
    if (patch.startDate !== undefined) body.start_date = patch.startDate
    if (patch.endDate !== undefined) body.end_date = patch.endDate
    if (patch.budgetLimit !== undefined) body.budget_limit = patch.budgetLimit
    if (patch.color !== undefined) body.color = patch.color
    await userDataApi.patch(`/trips/${tripId}`, body)
    const trips = await fetchTripsFromServer()
    if (trips) storage.saveTrips(trips)
    return true
  } catch {
    return false
  }
}

export async function deleteTripOnServer(tripId: number): Promise<boolean> {
  try {
    await userDataApi.delete(`/trips/${tripId}`)
    const trips = await fetchTripsFromServer()
    if (trips) storage.saveTrips(trips)
    const txs = await fetchTransactionsFromServer()
    if (txs) storage.saveTransactions(txs)
    return true
  } catch {
    return false
  }
}

export async function allocateTransactionOnServer(
  transactionId: string,
  body:
    | { type: 'date'; effective_date: string }
    | { type: 'trip'; trip_id: number }
    | { type: 'my_share'; my_share: number | null }
    | { type: 'none' },
): Promise<boolean> {
  try {
    await userDataApi.patch(
      `/transactions/${encodeURIComponent(transactionId)}/allocate`,
      body,
    )
    const txs = await fetchTransactionsFromServer()
    if (txs) storage.saveTransactions(txs)
    return true
  } catch {
    return false
  }
}
