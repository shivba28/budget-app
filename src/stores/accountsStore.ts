import { create } from 'zustand'

import { MANUAL_ENROLLMENT_ID } from '@/src/db/constants'
import type { AccountRow } from '@/src/db/queries/accounts'
import * as q from '@/src/db/queries/accounts'
import * as txq from '@/src/db/queries/transactions'

type State = {
  items: AccountRow[]
  load: () => void
  add: (input: { name: string; institution?: string | null; type?: string | null }) => void
  update: (
    id: string,
    patch: Partial<Pick<AccountRow, 'name' | 'institution' | 'type'>>,
  ) => void
  remove: (id: string) => boolean
}

function newId(): string {
  return `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export const useAccountsStore = create<State>((set, get) => ({
  items: [],
  load: () => set({ items: q.listManualAccounts() }),
  add: (input) => {
    q.insertAccount({
      id: newId(),
      name: input.name,
      institution: input.institution ?? null,
      type: input.type ?? 'manual',
      enrollment_id: MANUAL_ENROLLMENT_ID,
      last_seen_tx_id: null,
      last_synced: null,
      depository_amounts_inverted: 0,
      include_in_insights: 1,
    })
    get().load()
  },
  update: (id, patch) => {
    q.updateAccount(id, patch)
    get().load()
  },
  remove: (id) => {
    if (txq.countForAccount(id) > 0) return false
    q.deleteAccount(id)
    get().load()
    return true
  },
}))
