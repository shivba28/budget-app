import '@aejkatappaja/phantom-ui'
import type { ReactElement, ReactNode } from 'react'

export type PhantomUiBlockProps = {
  readonly loading: boolean
  readonly children: ReactNode
  readonly className?: string
  readonly animation?: 'shimmer' | 'pulse' | 'breathe' | 'solid'
  readonly count?: number
  /** Pixel gap between repeated rows when `count` &gt; 1. */
  readonly countGap?: number
  readonly reveal?: number
}

/** React wrapper for the phantom-ui custom element (structure-aware skeleton). */
export function PhantomUiBlock({
  loading,
  children,
  className,
  animation = 'shimmer',
  count,
  countGap,
  reveal = 0.22,
}: PhantomUiBlockProps): ReactElement {
  const gapProps: Record<string, unknown> =
    countGap != null ? { 'count-gap': countGap } : {}
  return (
    <phantom-ui
      loading={loading}
      animation={animation}
      class={className}
      reveal={reveal}
      {...(count != null ? { count } : {})}
      {...gapProps}
    >
      {children}
    </phantom-ui>
  )
}
