import type { ReactElement } from 'react'
import { useBackgroundBankSync } from '@/hooks/useBackgroundBankSync'

type Props = {
  readonly enabled: boolean
}

/** Side-effect: stale-while-foreground bank transaction refresh (see hook). */
export function BankAutoSync({ enabled }: Props): ReactElement | null {
  useBackgroundBankSync(enabled)
  return null
}
