import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Check, Lock } from 'lucide-react'
import { CATEGORIES } from '@/constants/categories'
import { formatCurrencyAmount, getCategoryPillColor } from '@/lib/api'
import { markLandingAsSeen } from '@/lib/storage'
import './Landing.css'
import './Summary.css'

const SLIDE_COUNT = 4
const AUTO_MS = 4000
const SWIPE_PX = 48

/** Demo spend shares — same category colors as Insights pie via {@link getCategoryPillColor}. */
const LANDING_PIE_DEMO: Readonly<Record<string, number>> = {
  food: 520,
  groceries: 380,
  transport: 240,
  housing: 680,
  utilities: 190,
  entertainment: 165,
  other: 95,
}

const LANDING_PIE_DATA = CATEGORIES.map((c) => ({
  name: c.label,
  categoryId: c.id,
  value: LANDING_PIE_DEMO[c.id] ?? 100,
  fill: getCategoryPillColor(c.id),
}))

function LandingPieVisual({
  animKey,
  reduceMotion,
}: {
  readonly animKey: number
  readonly reduceMotion: boolean
}): ReactElement {
  return (
    <div className="landing-visual landing-pie-chart" key={animKey}>
      <div className="chart-wrap summary-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={LANDING_PIE_DATA}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={88}
              paddingAngle={2}
              isAnimationActive={!reduceMotion}
            >
              {LANDING_PIE_DATA.map((entry) => (
                <Cell key={entry.categoryId} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const PILL_LABELS = [
  'Dining',
  'Transport',
  'Shopping',
  'Groceries',
  'Entertainment',
] as const

/** Deterministic “random” USD amount per label (stable across re-renders). */
function fakeSpendAmountForLabel(label: string): number {
  let h = 2166136261
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = Math.abs(h >>> 0)
  const dollars = 35 + (u % 520)
  const cents = u % 100
  return dollars + cents / 100
}

function LandingPillsVisual({
  animKey,
  reduceMotion,
}: {
  readonly animKey: number
  readonly reduceMotion: boolean
}): ReactElement {
  const t = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.4, ease: [0, 0, 0.2, 1] as const }

  return (
    <div className="landing-visual landing-pills" key={animKey}>
      {PILL_LABELS.map((label, i) => (
        <motion.div
          key={`${animKey}-${label}`}
          className="landing-pill"
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...t, delay: reduceMotion ? 0 : 0.08 + i * 0.1 }}
        >
          <span className="landing-pill__label">{label}</span>
          <span className="landing-pill__amount">
            {formatCurrencyAmount(fakeSpendAmountForLabel(label))}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

const BAR_ROWS = [
  { month: 'Jan', categoryId: 'food', scale: 0.58 },
  { month: 'Feb', categoryId: 'transport', scale: 0.76 },
  { month: 'Mar', categoryId: 'groceries', scale: 0.52 },
  { month: 'Apr', categoryId: 'entertainment', scale: 0.92 },
  { month: 'May', categoryId: 'housing', scale: 0.68 },
  { month: 'Jun', categoryId: 'utilities', scale: 0.45 },
  { month: 'Jul', categoryId: 'food', scale: 0.84 },
  { month: 'Aug', categoryId: 'other', scale: 0.63 },
  { month: 'Sep', categoryId: 'transport', scale: 0.71 },
  { month: 'Oct', categoryId: 'groceries', scale: 0.88 },
] as const

function LandingBarsVisual({
  animKey,
  reduceMotion,
}: {
  readonly animKey: number
  readonly reduceMotion: boolean
}): ReactElement {
  const t = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.5, ease: [0, 0, 0.2, 1] as const }

  return (
    <div className="landing-visual landing-bars" key={animKey}>
      <div className="landing-bars__plot">
        <div className="landing-bars__grid-bg" aria-hidden />
        <div className="landing-bars__columns">
          {BAR_ROWS.map((row, i) => (
            <div key={`${animKey}-${row.month}`} className="landing-bar-track">
              <div className="landing-bar-fill-wrap">
                <motion.div
                  className="landing-bar-fill"
                  style={{
                    height: `${row.scale * 100}%`,
                    background: getCategoryPillColor(row.categoryId),
                  }}
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ ...t, delay: reduceMotion ? 0 : 0.04 + i * 0.055 }}
                />
              </div>
              <span className="landing-bar-label">{row.month}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LandingLockVisual({
  animKey,
  reduceMotion,
}: {
  readonly animKey: number
  readonly reduceMotion: boolean
}): ReactElement {
  const t = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.45, ease: [0, 0, 0.2, 1] as const }

  return (
    <div className="landing-visual landing-lock" key={animKey}>
      <div className="landing-lock__cluster">
        <motion.div
          className="landing-lock__icon"
          initial={{ opacity: 0.35, scale: 1.12, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={t}
        >
          <Lock strokeWidth={1.75} size={72} aria-hidden />
        </motion.div>
        <motion.div
          className="landing-lock__check"
          style={{
            position: 'absolute',
            right: '-0.15rem',
            bottom: '-0.15rem',
          }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : { ...t, delay: 0.38, duration: 0.35 }
          }
        >
          <Check strokeWidth={2.5} size={36} aria-hidden />
        </motion.div>
      </div>
    </div>
  )
}

const SLIDES = [
  {
    title: 'See where your money goes',
    subtitle: 'Every transaction, beautifully organized',
    Visual: LandingPieVisual,
  },
  {
    title: 'Track spending by category',
    subtitle: 'Dining, transport, shopping - all in one place',
    Visual: LandingPillsVisual,
  },
  {
    title: 'Your monthly snapshot',
    subtitle: 'Know your biggest month-over-month changes',
    Visual: LandingBarsVisual,
  },
  {
    title: 'Bank-level security',
    subtitle: 'Your credentials never touch our servers.',
    Visual: LandingLockVisual,
  },
] as const

export function Landing(): ReactElement {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [animTick, setAnimTick] = useState(0)
  const [autoEpoch, setAutoEpoch] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % SLIDE_COUNT)
      setAnimTick((t) => t + 1)
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [autoEpoch])

  const restartAuto = useCallback(() => {
    setAutoEpoch((e) => e + 1)
  }, [])

  const goTo = useCallback(
    (i: number) => {
      setActiveIndex(i)
      setAnimTick((t) => t + 1)
      restartAuto()
    },
    [restartAuto],
  )

  const next = useCallback(() => {
    setActiveIndex((i) => (i + 1) % SLIDE_COUNT)
    setAnimTick((t) => t + 1)
    restartAuto()
  }, [restartAuto])

  const prev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT)
    setAnimTick((t) => t + 1)
    restartAuto()
  }, [restartAuto])

  const onTouchStart = (e: React.TouchEvent): void => {
    if (e.touches.length !== 1) {
      touchStartX.current = null
      return
    }
    touchStartX.current = e.touches[0]!.clientX
  }

  const onTouchEnd = (e: React.TouchEvent): void => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start
    if (Math.abs(dx) < SWIPE_PX) return
    if (dx < 0) next()
    else prev()
  }

  function onCta(): void {
    markLandingAsSeen()
    navigate('/login', { replace: true })
  }

  const slide = SLIDES[activeIndex]!
  const Visual = slide.Visual
  const crossFade = reduceMotion
    ? { duration: 0.12 }
    : { duration: 0.22, ease: [0, 0, 0.2, 1] as const }

  return (
    <div className="landing-root w-full max-w-sm">
      <header className="landing-header">
        <img
          className="landing-logo"
          src="/pwa-192x192.png"
          alt=""
          width={192}
          height={192}
        />
        <h1 className="landing-brand">Budget Tracker</h1>
      </header>

      <div
        className="landing-carousel"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="region"
        aria-roledescription="carousel"
        aria-label="App overview"
      >
        <div className="landing-carousel__viewport">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeIndex}
              className="landing-carousel__slide flex flex-col items-center justify-center"
              initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }}
              transition={crossFade}
              style={{ willChange: 'transform, opacity' }}
            >
              <Visual animKey={animTick} reduceMotion={!!reduceMotion} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="landing-slide-text">
          <h2 id={`landing-slide-${activeIndex}-title`}>{slide.title}</h2>
          <p id={`landing-slide-${activeIndex}-desc`}>{slide.subtitle}</p>
        </div>
      </div>

      <div
        className="landing-dots"
        role="tablist"
        aria-label="Slides"
      >
        {SLIDES.map((_, i) => (
          <button
            key={String(i)}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Slide ${i + 1}`}
            className={
              i === activeIndex ? 'landing-dot landing-dot--active' : 'landing-dot'
            }
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <footer className="landing-footer">
        <button
          type="button"
          className="landing-cta"
          onClick={onCta}
        >
          <span className="landing-cta__shimmer" aria-hidden />
          <span className="landing-cta__label">Take Control</span>
        </button>
      </footer>
    </div>
  )
}
