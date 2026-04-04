import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useReducedMotion } from 'framer-motion'

type NavScrollContextValue = {
  readonly labelsVisible: boolean
  readonly expandNav: () => void
  /** Claim the active scroll surface (replaces any previous registration). */
  readonly setScrollRoot: (el: HTMLElement | null) => void
  /**
   * Drop registration only if `el` is still the active root. Used on unmount so an
   * exiting route (AnimatePresence) does not clear a newer page’s scroll root.
   */
  readonly releaseScrollRoot: (el: HTMLElement | null) => void
}

const NavScrollContext = createContext<NavScrollContextValue | null>(null)

/** Pixels per processed frame; keep small so slow drags still flip the dock (8px was too coarse). */
const SCROLL_DIRECTION_EPS = 1
const NEAR_TOP_PX = 12

export function NavScrollProvider({ children }: { children: ReactNode }) {
  const [scrollRoot, setScrollRootState] = useState<HTMLElement | null>(null)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const lastScrollTop = useRef(0)
  const reduceMotion = useReducedMotion()

  const setScrollRoot = useCallback((el: HTMLElement | null) => {
    setScrollRootState(el)
  }, [])

  const releaseScrollRoot = useCallback((el: HTMLElement | null) => {
    if (el === null) return
    setScrollRootState((current) => (current === el ? null : current))
  }, [])

  const expandNav = useCallback(() => {
    setLabelsVisible(true)
  }, [])

  useEffect(() => {
    if (!scrollRoot) return

    lastScrollTop.current = scrollRoot.scrollTop

    const expandRaf = requestAnimationFrame(() => {
      setLabelsVisible(true)
    })

    if (reduceMotion) {
      return () => cancelAnimationFrame(expandRaf)
    }

    let ticking = false

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const el = scrollRoot
        const st = el.scrollTop
        const delta = st - lastScrollTop.current
        lastScrollTop.current = st

        if (el.scrollHeight <= el.clientHeight + 2) {
          setLabelsVisible(true)
          return
        }

        if (st <= NEAR_TOP_PX) {
          setLabelsVisible(true)
          return
        }

        if (delta > SCROLL_DIRECTION_EPS) {
          setLabelsVisible(false)
        } else if (delta < -SCROLL_DIRECTION_EPS) {
          setLabelsVisible(true)
        }
      })
    }

    scrollRoot.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(expandRaf)
      scrollRoot.removeEventListener('scroll', onScroll)
    }
  }, [scrollRoot, reduceMotion])

  const value = useMemo(
    (): NavScrollContextValue => ({
      labelsVisible: reduceMotion ? true : labelsVisible,
      expandNav,
      setScrollRoot,
      releaseScrollRoot,
    }),
    [labelsVisible, expandNav, setScrollRoot, releaseScrollRoot, reduceMotion],
  )

  return (
    <NavScrollContext.Provider value={value}>
      {children}
    </NavScrollContext.Provider>
  )
}

export function useNavScroll(): NavScrollContextValue {
  const ctx = useContext(NavScrollContext)
  if (!ctx) {
    throw new Error('useNavScroll must be used within NavScrollProvider')
  }
  return ctx
}

/** Attach the page’s vertical scroll element so scroll direction can drive the dock. */
export function useRegisterNavScrollRoot<T extends HTMLElement>(
  ref: RefObject<T | null>,
): void {
  const { setScrollRoot, releaseScrollRoot } = useNavScroll()

  useLayoutEffect(() => {
    const el = ref.current
    if (el) setScrollRoot(el)
    return () => releaseScrollRoot(el)
  }, [setScrollRoot, releaseScrollRoot, ref])
}
