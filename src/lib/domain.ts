export interface Account {
  readonly id: string
  readonly name: string
  /** Teller Connect enrollment this account belongs to (routing + disconnect). */
  readonly enrollmentId: string
  readonly institution?: {
    readonly name?: string
  }
}

export interface Transaction {
  readonly id: string
  readonly accountId: string
  readonly amount: number
  /** Bank posting date (YYYY-MM-DD). */
  readonly date: string
  readonly categoryId: string
  readonly description: string
  /** Server-backed; manual entries use `manual`. */
  readonly source?: 'bank' | 'manual'
  /** Display name for manual account (when `source === 'manual'`). */
  readonly accountLabel?: string
  /** Raw Teller `details.category` when present (used for Insights grouping). */
  readonly detailCategory?: string
  /** When set, use this as the user’s personal cost instead of the full amount. */
  readonly myShare?: number | null
  /**
   * When set (and no trip), budget/insights month uses this date’s calendar month instead of `date`.
   */
  readonly effectiveDate?: string | null
  /** When set, trip rules apply; `effectiveDate` is ignored. */
  readonly tripId?: number | null
  /** When true, row is not shown on the Transactions page (still stored for when it posts). */
  readonly pending?: boolean
  /**
   * User marked a pending bank charge as posted (server-backed). Keeps the row visible
   * until Teller clears pending, without overwriting this flag on sync.
   */
  readonly userConfirmed?: boolean
}

export interface ManualAccount {
  readonly id: string
  readonly name: string
  readonly createdAt: string
}

export interface Trip {
  readonly id: number
  readonly name: string
  /** YYYY-MM-DD */
  readonly startDate: string
  readonly endDate: string | null
  readonly budgetLimit: number | null
  readonly color: string | null
  readonly createdAt: string
}

export interface ConnectedAccountInfo {
  readonly accountId: string
  readonly accountName: string
  readonly institutionName: string
}
