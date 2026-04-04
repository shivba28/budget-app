/** Built-in monthly spend caps per category (USD) when user has not set a custom value. */
export const MONTHLY_BUDGET_DEFAULTS_BY_CATEGORY: Readonly<Record<string, number>> = {
  food: 400,
  groceries: 600,
  transport: 350,
  housing: 1500,
  utilities: 280,
  entertainment: 250,
  other: 350,
}
