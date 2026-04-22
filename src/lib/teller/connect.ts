export function getTellerApplicationId(): string {
  return (
    process.env.EXPO_PUBLIC_TELLER_APP_ID ??
    process.env.EXPO_PUBLIC_TELLER_APPLICATION_ID ??
    ''
  )
}

export function getTellerEnvironment(): string {
  return process.env.EXPO_PUBLIC_TELLER_ENV ?? 'sandbox'
}

export function getTellerConnectEnvironment():
  | 'sandbox'
  | 'development'
  | 'production' {
  const e = getTellerEnvironment()
  if (e === 'development' || e === 'production' || e === 'sandbox') return e
  return 'sandbox'
}

export function isTellerSandbox(): boolean {
  return getTellerEnvironment() === 'sandbox'
}
