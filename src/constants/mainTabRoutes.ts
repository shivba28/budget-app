/** Left-to-right tab order for main shell (dock + swipe). */
export const MAIN_APP_TAB_PATHS = [
  '/app/transactions',
  '/app/insights',
  '/app/trips',
  '/app/settings',
] as const

export type MainAppTabPath = (typeof MAIN_APP_TAB_PATHS)[number]

export function normalizeAppPathname(pathname: string): string {
  return pathname.endsWith('/') && pathname !== '/'
    ? pathname.slice(0, -1)
    : pathname
}

/** Index in {@link MAIN_APP_TAB_PATHS}, or `-1` if not a main tab. */
export function mainTabIndex(pathname: string): number {
  const p = normalizeAppPathname(pathname)
  if (p === '/app/trips' || p.startsWith('/app/trips/')) {
    return MAIN_APP_TAB_PATHS.indexOf('/app/trips')
  }
  return MAIN_APP_TAB_PATHS.indexOf(p as MainAppTabPath)
}

/**
 * Index for tab-direction math; unknown routes map to `0` (matches prior Summary behavior).
 */
export function mainTabIndexOrDefault(pathname: string): number {
  const i = mainTabIndex(pathname)
  return i === -1 ? 0 : i
}
