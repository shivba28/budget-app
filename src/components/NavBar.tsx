import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutList, Lightbulb, Plane, Plus, Settings } from 'lucide-react'
import {
  NAV_PLUS_DISABLED_EVENT,
  OPEN_ADD_TRANSACTION_EVENT,
  OPEN_ADD_TRIP_EVENT,
} from '@/constants/navFabEvents'
import { cn } from '@/lib/utils'
import { useNavScroll } from '@/contexts/NavScrollContext'

/** One curve + duration for CSS and Framer so dock collapse/expand stays in lockstep. */
const DOCK_DURATION_MS = 300
const DOCK_EASE_BEZIER = [0.32, 0.72, 0, 1] as const
/** Literal classes so Tailwind can emit utilities (avoid dynamic `duration-[…]` strings). */
const dockTransitionClass =
  'duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'

function dockMotionTransition(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return { type: 'tween' as const, duration: 0.15, ease: 'linear' as const }
  }
  return {
    type: 'tween' as const,
    duration: DOCK_DURATION_MS / 1000,
    ease: [...DOCK_EASE_BEZIER] as [number, number, number, number],
  }
}

/** Spring for + visibility / dock reflow (matches TransactionAllocateSheet reduced-motion pattern). */
function plusSpringTransition(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return { duration: 0.01 }
  }
  return { type: 'spring' as const, stiffness: 400, damping: 34, mass: 0.8 }
}

const plusVariants = {
  visible: {
    y: 0,
    scale: 1,
    opacity: 1,
  },
  hidden: {
    y: 80,
    scale: 0,
    opacity: 0,
  },
}

/** Flex-grow when the + slot is collapsed so the four tabs share space smoothly. */
const NAV_ITEM_FLEX_EXPANDED = 1.28

const navLinkBase = cn(
  'relative z-0 flex h-full min-h-0 w-full flex-col items-center justify-center rounded-[1.35rem] px-1 outline-none',
  `transition-[color,transform,gap,padding] ${dockTransitionClass}`,
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
)

const labelTransition = cn(
  'block max-w-full truncate text-center text-[0.65rem] font-medium leading-tight',
  `transition-[max-height,opacity,margin-top] ${dockTransitionClass}`,
)

type DockLinkProps = {
  readonly to: string
  readonly end?: boolean
  readonly label: string
  readonly Icon: LucideIcon
  readonly labelsVisible: boolean
  readonly reduceMotion: boolean | null
  /** When set, treat the link as active (e.g. nested routes under `/app/trips/:id`). */
  readonly forceActive?: boolean
}

function DockLink({
  to,
  end,
  label,
  Icon,
  labelsVisible,
  reduceMotion,
  forceActive,
}: DockLinkProps): ReactElement {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          navLinkBase,
          labelsVisible ? 'gap-0.5 py-1.5' : 'gap-0 py-1',
          forceActive ?? isActive
            ? 'app-nav__link--active text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {({ isActive }) => {
        const active = forceActive ?? isActive
        return (
          <>
            {active ? (
              <motion.span
                layoutId="main-nav-pill"
                className="absolute inset-0 -z-10 rounded-[2.5rem] bg-foreground/12 dark:bg-foreground/18"
                transition={dockMotionTransition(reduceMotion)}
              />
            ) : null}
            <motion.span
              animate={{
                scale: active ? 1.06 : 1,
                opacity: active ? 1 : 0.88,
              }}
              transition={dockMotionTransition(reduceMotion)}
              className="inline-flex"
            >
              <Icon className="size-[1.2rem] shrink-0" strokeWidth={2} />
            </motion.span>
            <span
              aria-hidden
              className={cn(
                labelTransition,
                labelsVisible
                  ? 'mt-0.5 max-h-6 opacity-100'
                  : 'mt-0 max-h-0 overflow-hidden opacity-0',
              )}
            >
              {label}
            </span>
          </>
        )
      }}
    </NavLink>
  )
}

/**
 * Extra diameter so the + sits above the frosted bar (slot height stays bar-sized;
 * the button is absolutely centered and overflows vertically).
 */
const FAB_OVERFLOW_DIAMETER_PX = 16
/** Equal horizontal gutter between Insights / Trips and the + when the FAB is shown. */
const FAB_ADJACENT_GUTTER_PX = 6

type DockMetrics = { barHeightPx: number; fabDiameterPx: number }

function measureDockMetrics(dock: HTMLElement): DockMetrics | null {
  const nav = dock.querySelector('nav')
  if (!nav) return null
  const firstLink = nav.querySelector('a')
  if (!firstLink) return null
  const linkH = firstLink.getBoundingClientRect().height
  const navCs = getComputedStyle(nav)
  const navPadY =
    (parseFloat(navCs.paddingTop) || 0) + (parseFloat(navCs.paddingBottom) || 0)
  const barHeightPx = Math.ceil(linkH + navPadY)
  const fabDiameterPx = Math.max(44, barHeightPx + FAB_OVERFLOW_DIAMETER_PX)
  return { barHeightPx, fabDiameterPx }
}

/**
 * Dock sits inside `.app-shell` (absolute, not portaled) so backdrop-filter blurs the
 * same scrolling surface as the app — like Safari’s overlaid toolbar.
 */
export function NavBar(): ReactElement {
  const reduceMotion = useReducedMotion()
  const { pathname } = useLocation()
  const { labelsVisible, expandNav } = useNavScroll()
  const [contextDisablesPlus, setContextDisablesPlus] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockMetrics, setDockMetrics] = useState<DockMetrics | null>(null)
  const tripsPathActive =
    pathname === '/app/trips' || pathname.startsWith('/app/trips/')
  const transactionsPathActive =
    pathname === '/app/transactions' ||
    pathname.startsWith('/app/transactions/')

  const showPlus =
    pathname.includes('/transactions') || pathname.includes('/trips')
  const plusDisabled = !showPlus || contextDisablesPlus

  useEffect(() => {
    const h = (e: Event): void => {
      const d = (e as CustomEvent<{ disabled?: boolean }>).detail
      setContextDisablesPlus(d?.disabled === true)
    }
    window.addEventListener(NAV_PLUS_DISABLED_EVENT, h as EventListener)
    return () =>
      window.removeEventListener(NAV_PLUS_DISABLED_EVENT, h as EventListener)
  }, [])

  useEffect(() => {
    setContextDisablesPlus(false)
  }, [pathname])

  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock) return

    const measure = (): void => {
      const m = measureDockMetrics(dock)
      if (m != null) setDockMetrics(m)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(dock)
    const nav = dock.querySelector('nav')
    if (nav) ro.observe(nav)
    return () => ro.disconnect()
  }, [labelsVisible, reduceMotion, pathname])

  const plusLabel = transactionsPathActive
    ? 'Add manual transaction'
    : tripsPathActive
      ? 'Add trip'
      : 'Add'

  const fabPx = dockMetrics?.fabDiameterPx ?? 56
  const plusIconPx = Math.max(18, Math.round(fabPx * 0.44))
  const plusSpring = plusSpringTransition(reduceMotion)

  const plusTransition = reduceMotion
    ? { duration: 0.01 }
    : {
        visible: {
          type: 'spring' as const,
          stiffness: 400,
          damping: 34,
          mass: 0.8,
        },
        hidden: {
          y: {
            type: 'keyframes' as const,
            values: [0, 0, 80],
            times: [0, 0.92, 1],
            duration: 0.28,
            ease: 'linear',
          },
          scale: {
            type: 'keyframes' as const,
            values: [1, 1.25, 0],
            times: [0, 0.3, 1],
            duration: 0.28,
            ease: ['easeOut', 'easeIn'],
          },
          opacity: {
            duration: 0.18,
            delay: 0.1,
            ease: 'easeIn',
          },
        },
      }

  return (
    <div
      ref={dockRef}
      className={cn(
        'app-nav-dock pointer-events-none absolute inset-x-0 bottom-4 z-[200]',
        'flex justify-center px-[max(0.75rem,4%)] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <nav
        className={cn(
          'pointer-events-auto relative flex max-w-[min(340px,calc(100%-1.5rem))] items-center justify-around gap-0.5 overflow-visible rounded-[2.5rem]',
          'border border-white/40 shadow-[0_10px_40px_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.55)]',
          'bg-white/[0.2] backdrop-blur-[28px] backdrop-saturate-[1.35]',
          '[-webkit-backdrop-filter:blur(28px)_saturate(1.35)]',
          'dark:border-white/20 dark:bg-white/[0.08] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.12)]',
          'dark:backdrop-blur-[32px] dark:[-webkit-backdrop-filter:blur(32px)_saturate(1.2)]',
          `transition-[width,max-width,padding] ${dockTransitionClass}`,
          labelsVisible ? 'w-full min-h-0 py-1 px-1' : 'w-[50%] min-h-0 py-1 px-1',
        )}
        aria-label="Main"
        onPointerDown={() => {
          if (!labelsVisible) expandNav()
        }}
      >
        <div className="flex min-h-0 w-full min-w-0 items-stretch gap-0.5">
          <motion.div
            className="flex h-full min-h-0 min-w-0 basis-0 flex-col"
            initial={false}
            animate={{
              flexGrow: showPlus ? NAV_ITEM_FLEX_EXPANDED : 1,
              flexShrink: 1,
              flexBasis: 0,
            }}
            transition={plusSpring}
          >
            <DockLink
              to="/app/transactions"
              end
              label="Transactions"
              Icon={LayoutList}
              labelsVisible={labelsVisible}
              reduceMotion={reduceMotion}
            />
          </motion.div>
          <motion.div
            className="flex h-full min-h-0 min-w-0 basis-0 flex-col"
            initial={false}
            animate={{
              flexGrow: showPlus ? NAV_ITEM_FLEX_EXPANDED : 1,
              flexShrink: 1,
              flexBasis: 0,
              marginRight: showPlus ? FAB_ADJACENT_GUTTER_PX : 0,
            }}
            transition={plusSpring}
          >
            <DockLink
              to="/app/insights"
              label="Insights"
              Icon={Lightbulb}
              labelsVisible={labelsVisible}
              reduceMotion={reduceMotion}
            />
          </motion.div>
          <motion.div
            aria-hidden
            className={cn(
              'pointer-events-none min-w-0 shrink-0 grow-0 overflow-hidden',
              /* Out of layout when FAB is off: a 0-width flex item still gets gap on both sides. */
              !showPlus && 'hidden',
            )}
            initial={false}
            animate={{ width: showPlus ? fabPx : 0 }}
            transition={plusSpring}
          />
          <motion.div
            className="flex h-full min-h-0 min-w-0 basis-0 flex-col"
            initial={false}
            animate={{
              flexGrow: showPlus ? NAV_ITEM_FLEX_EXPANDED : 1,
              flexShrink: 1,
              flexBasis: 0,
              marginLeft: showPlus ? FAB_ADJACENT_GUTTER_PX : 0,
            }}
            transition={plusSpring}
          >
            <DockLink
              to="/app/trips"
              label="Trips"
              Icon={Plane}
              labelsVisible={labelsVisible}
              reduceMotion={reduceMotion}
              forceActive={tripsPathActive}
            />
          </motion.div>
          <motion.div
            className="flex h-full min-h-0 min-w-0 basis-0 flex-col"
            initial={false}
            animate={{
              flexGrow: showPlus ? NAV_ITEM_FLEX_EXPANDED : 1,
              flexShrink: 1,
              flexBasis: 0,
            }}
            transition={plusSpring}
          >
            <DockLink
              to="/app/settings"
              label="Settings"
              Icon={Settings}
              labelsVisible={labelsVisible}
              reduceMotion={reduceMotion}
            />
          </motion.div>
        </div>

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          aria-hidden={!showPlus}
        >
          <motion.div
            className="flex items-center justify-center"
            initial={false}
            variants={plusVariants}
            animate={showPlus ? 'visible' : 'hidden'}
            transition={plusTransition}
            style={{
              width: fabPx,
              height: fabPx,
              pointerEvents: showPlus ? 'auto' : 'none',
            }}
          >
            <button
              type="button"
              aria-label={plusLabel}
              aria-hidden={!showPlus}
              tabIndex={showPlus ? 0 : -1}
              disabled={plusDisabled}
              style={{ width: fabPx, height: fabPx }}
              className={cn(
                'relative flex items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-lg',
                'outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                showPlus
                  ? 'pointer-events-auto'
                  : 'pointer-events-none',
                plusDisabled
                  ? 'cursor-not-allowed'
                  : 'hover:opacity-95 active:scale-[0.96]',
              )}
              onClick={() => {
                if (plusDisabled) return
                if (transactionsPathActive) {
                  window.dispatchEvent(
                    new CustomEvent(OPEN_ADD_TRANSACTION_EVENT),
                  )
                  return
                }
                if (tripsPathActive) {
                  window.dispatchEvent(new CustomEvent(OPEN_ADD_TRIP_EVENT))
                }
              }}
            >
              {plusDisabled && showPlus ? (
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 z-[1] rounded-full',
                    'backdrop-blur-md backdrop-saturate-150',
                    'bg-background/45 dark:bg-background/50',
                    '[-webkit-backdrop-filter:blur(12px)_saturate(1.5)]',
                  )}
                  aria-hidden
                />
              ) : null}
              <Plus
                className="relative z-[2] shrink-0 stroke-[2.35]"
                width={plusIconPx}
                height={plusIconPx}
                aria-hidden
              />
            </button>
          </motion.div>
        </div>
      </nav>
    </div>
  )
}
