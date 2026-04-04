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
  readonly date: string
  readonly categoryId: string
  readonly description: string
  /** Raw Teller `details.category` when present (used for Insights grouping). */
  readonly detailCategory?: string
}

export interface ConnectedAccountInfo {
  readonly accountId: string
  readonly accountName: string
  readonly institutionName: string
}
