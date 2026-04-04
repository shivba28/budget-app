import { useRef } from 'react'
import { mainTabIndexOrDefault } from '@/constants/mainTabRoutes'

function tabIndex(pathname: string): number {
  return mainTabIndexOrDefault(pathname)
}

/**
 * +1 when moving to a tab to the right, -1 when moving left, 0 on first paint / same tab.
 *
 * The direction for the *last* navigation is kept stable across re-renders on the same route.
 * If we recomputed `0` whenever `prev === pathname`, AnimatePresence would pass `custom={0}`
 * mid-transition and kill horizontal slides (opacity-only exit).
 *
 * On the frame `pathname` changes, we update direction synchronously (same as pathname in render).
 */
export function useTabDirection(pathname: string): number {
  const prevRef = useRef<string | null>(null)
  const directionRef = useRef(0)

  const prev = prevRef.current
  if (prev !== null && prev !== pathname) {
    const pi = tabIndex(prev)
    const ni = tabIndex(pathname)
    directionRef.current = ni > pi ? 1 : ni < pi ? -1 : 0
  }

  prevRef.current = pathname

  return directionRef.current
}
