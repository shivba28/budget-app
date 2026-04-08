import type { ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutList, Lightbulb, Plane, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavScroll } from '@/contexts/NavScrollContext'

const navLinkBase =
  'relative z-0 flex min-w-0 flex-1 flex-col items-center justify-center rounded-[1.35rem] px-1 outline-none transition-[color,transform,gap,padding] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'

const labelTransition =
  'block max-w-full truncate text-center text-[0.65rem] font-medium leading-tight transition-[max-height,opacity,margin-top] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'

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
          labelsVisible ? 'gap-0.5 py-2.5' : 'gap-0 py-2',
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
                className="absolute inset-0 -z-10 rounded-[1.25rem] bg-foreground/12 dark:bg-foreground/18"
                transition={
                  reduceMotion
                    ? { duration: 0.15 }
                    : { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }
                }
              />
            ) : null}
            <motion.span
              animate={{
                scale: active ? 1.06 : 1,
                opacity: active ? 1 : 0.88,
              }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : { type: 'spring', stiffness: 380, damping: 28 }
              }
              className="inline-flex"
            >
              <Icon className="size-[1.35rem] shrink-0" strokeWidth={2} />
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
 * Dock sits inside `.app-shell` (absolute, not portaled) so backdrop-filter blurs the
 * same scrolling surface as the app — like Safari’s overlaid toolbar.
 */
export function NavBar(): ReactElement {
  const reduceMotion = useReducedMotion()
  const location = useLocation()
  const { labelsVisible, expandNav } = useNavScroll()
  const tripsPathActive =
    location.pathname === '/app/trips' ||
    location.pathname.startsWith('/app/trips/')

  return (
    <div
      className={cn(
        'app-nav-dock pointer-events-none absolute inset-x-0 bottom-0 z-[200]',
        'flex justify-center px-[max(0.75rem,4%)] pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <nav
        className={cn(
          'pointer-events-auto flex max-w-[min(300px,calc(100%-1.5rem))] items-stretch justify-around gap-0.5 rounded-[1.25rem]',
          'border border-white/40 shadow-[0_10px_40px_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,0.55)]',
          'bg-white/[0.2] backdrop-blur-[28px] backdrop-saturate-[1.35]',
          '[-webkit-backdrop-filter:blur(28px)_saturate(1.35)]',
          'dark:border-white/20 dark:bg-white/[0.08] dark:shadow-[0_12px_48px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.12)]',
          'dark:backdrop-blur-[32px] dark:[-webkit-backdrop-filter:blur(32px)_saturate(1.2)]',
          'transition-[width,max-width,padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          labelsVisible ? 'w-full py-1 px-1' : 'w-[50%] py-1 px-1',
        )}
        aria-label="Main"
        onPointerDown={() => {
          if (!labelsVisible) expandNav()
        }}
      >
        <DockLink
          to="/app/transactions"
          end
          label="Transactions"
          Icon={LayoutList}
          labelsVisible={labelsVisible}
          reduceMotion={reduceMotion}
        />
        <DockLink
          to="/app/insights"
          label="Insights"
          Icon={Lightbulb}
          labelsVisible={labelsVisible}
          reduceMotion={reduceMotion}
        />
        <DockLink
          to="/app/trips"
          label="Trips"
          Icon={Plane}
          labelsVisible={labelsVisible}
          reduceMotion={reduceMotion}
          forceActive={tripsPathActive}
        />
        <DockLink
          to="/app/settings"
          label="Settings"
          Icon={Settings}
          labelsVisible={labelsVisible}
          reduceMotion={reduceMotion}
        />
      </nav>
    </div>
  )
}
