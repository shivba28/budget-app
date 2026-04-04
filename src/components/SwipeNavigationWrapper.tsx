import type { ReactElement } from 'react'
import { useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { MAIN_APP_TAB_PATHS } from '@/constants/mainTabRoutes'
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation'
import { useTabDirection } from '@/hooks/useTabDirection'

const ease = [0.32, 0.72, 0, 1] as const

/**
 * dir > 0: forward in tab order (e.g. Transactions → Insights). Outgoing slides off to the
 * left; incoming starts fully off the right edge.
 * dir < 0: backward. Outgoing exits right; incoming starts off the left.
 */
const pageVariants = {
  enter: (dir: number) =>
    dir === 0
      ? { opacity: 0 }
      : {
          x: dir > 0 ? '100%' : '-100%',
          opacity: 0,
        },
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) =>
    dir === 0
      ? { opacity: 0 }
      : {
          x: dir > 0 ? '-100%' : '100%',
          opacity: 0,
        },
}

const reducedVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

/**
 * Main tab shell: swipe between routes (see {@link useSwipeNavigation}) + slide transitions
 * aligned with dock order. Container uses pan-y so vertical scroll stays native.
 */
export function SwipeNavigationWrapper(): ReactElement {
  const location = useLocation()
  const direction = useTabDirection(location.pathname)
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  useSwipeNavigation(MAIN_APP_TAB_PATHS, rootRef)

  return (
    <div
      ref={rootRef}
      className="swipe-nav-root relative min-h-0 flex-1 overflow-hidden touch-pan-y"
    >
      <AnimatePresence
        mode="popLayout"
        initial={false}
        custom={direction}
      >
        <motion.div
          key={location.pathname}
          role="presentation"
          custom={direction}
          variants={reduceMotion ? reducedVariants : pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            reduceMotion
              ? { duration: 0.12 }
              : { type: 'tween', duration: 0.25, ease: ease }
          }
          className="absolute inset-0 z-0 flex min-h-0 flex-col overflow-x-hidden overflow-y-auto"
          style={{ willChange: 'transform, opacity' }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
