import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { useRouter } from 'expo-router'
import Svg, { Circle, Line, Path as SvgPath, Text as SvgText } from 'react-native-svg'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { useAuthStore } from '@/src/auth/authStore'
import { tokens } from '@/src/theme/tokens'

const { width: SCREEN_W } = Dimensions.get('window')

const CREAM = tokens.color.bg
const INK = tokens.color.fg
const EYEBROW = '#FF3B00'
const BLUE = '#0047FF'
const CHART_YELLOW = '#FFD600'
const YELLOW = '#F5C842'
const GRAY = '#888888'
const FEAT_EYEBROW = '#FFD600'
const ORANGE_LINE = '#FF3B00'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })
const DISPLAY = Platform.select({
  ios: 'AvenirNext-Heavy',
  android: 'sans-serif-condensed',
  default: undefined,
})

function formatMoney(n: number): string {
  const v = Math.round(n * 100) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDonutSlices(): { label: string; value: number; color: string }[] {
  const labels = ['Food', 'Housing', 'Transport', 'Other'] as const
  const colors = ['#FF3B00', '#0047FF', '#FFD600', '#888888'] as const
  const raw = labels.map(() => randInt(8, 40))
  const sum = raw.reduce((a, b) => a + b, 0)
  return labels.map((label, i) => ({
    label,
    value: Math.round((raw[i]! / sum) * 10000) / 100,
    color: colors[i]!,
  }))
}

// —— Skia donut ——
const DONUT_SIZE = 160
const STROKE_WIDTH = 20
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2
const CENTER = DONUT_SIZE / 2
const GAP_DEGREES = 1

type OnboardingDonutSliceProps = {
  startAngle: number
  sweepAngle: number
  color: string
  delay: number
  active: boolean
  replayKey: number
}

function OnboardingDonutSlice({
  startAngle,
  sweepAngle,
  color,
  delay,
  active,
  replayKey,
}: OnboardingDonutSliceProps) {
  const startSV = useSharedValue(startAngle)
  const sweepSV = useSharedValue(0)

  useEffect(() => {
    startSV.value = withTiming(startAngle, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
  }, [startAngle, startSV])

  useEffect(() => {
    if (!active) return
    sweepSV.value = 0
    sweepSV.value = withDelay(
      delay,
      withTiming(sweepAngle, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
      }),
    )
  }, [active, replayKey, sweepAngle, delay, sweepSV])

  const path = useDerivedValue(() => {
    const currentSweep = Math.max(0, Math.min(359.999, sweepSV.value))
    if (currentSweep <= 0.001) return Skia.Path.Make()

    const toRad = (deg: number) => (deg * Math.PI) / 180
    const start = toRad(startSV.value - 90)
    const end = toRad(startSV.value - 90 + currentSweep)

    const x0 = CENTER + RADIUS * Math.cos(start)
    const y0 = CENTER + RADIUS * Math.sin(start)
    const x1 = CENTER + RADIUS * Math.cos(end)
    const y1 = CENTER + RADIUS * Math.sin(end)

    const largeArc = currentSweep > 180 ? 1 : 0
    const d = `M ${x0} ${y0} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x1} ${y1}`
    return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
  }, [startSV, sweepSV])

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={STROKE_WIDTH}
      strokeCap="round"
      color={color}
    />
  )
}

function OnboardingDonut({
  values,
  active,
  replayKey,
}: {
  values: { label: string; value: number; color: string }[]
  active: boolean
  replayKey: number
}) {
  const data = values.filter((v) => v.value > 0)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (data.length === 0) return null

  const capAngleDeg = ((STROKE_WIDTH / 2) / RADIUS) * (180 / Math.PI)
  const n = data.length
  const desiredGap = GAP_DEGREES + capAngleDeg * 2
  const maxGap = n > 0 ? 360 / n - 0.5 : 0
  let effectiveGap = Math.max(0, Math.min(desiredGap, maxGap))
  let totalGapDegrees = effectiveGap * n
  let availableDegrees = 360 - totalGapDegrees
  if (availableDegrees < 5) {
    effectiveGap = 0
    totalGapDegrees = 0
    availableDegrees = 360
  }

  type SliceAngle = {
    label: string
    startAngle: number
    sweepAngle: number
    color: string
    delay: number
  }

  const slices: SliceAngle[] = []
  let cursor = 0
  data.forEach((d, i) => {
    const rawSweep = total > 0 ? (d.value / total) * availableDegrees : 0
    const sweep = Math.max(0, rawSweep)
    slices.push({
      label: d.label,
      startAngle: cursor,
      sweepAngle: sweep,
      color: d.color,
      delay: i * 120,
    })
    cursor += rawSweep + effectiveGap
  })

  const totalDollars = useMemo(() => randInt(2500, 8200), [values])

  return (
    // Column layout: donut centered, legend below
    <View style={styles.donutCol}>
      <View style={styles.donutCanvasWrap}>
        <Canvas style={{ width: DONUT_SIZE, height: DONUT_SIZE + 1 }}>
          <Path
            path={(() => {
              const d = `M ${CENTER} ${STROKE_WIDTH / 2} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.001} ${STROKE_WIDTH / 2}`
              return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make()
            })()}
            style="stroke"
            strokeWidth={STROKE_WIDTH}
            color="transparent"
          />
          {slices.map((s) => (
            <OnboardingDonutSlice
              key={s.label}
              startAngle={s.startAngle}
              sweepAngle={s.sweepAngle}
              color={s.color}
              delay={s.delay}
              active={active}
              replayKey={replayKey}
            />
          ))}
        </Canvas>
        <View pointerEvents="none" style={styles.donutCenter}>
          <Text style={styles.donutCenterValue}>{formatMoney(totalDollars)}</Text>
          <Text style={styles.donutCenterSub}>total</Text>
        </View>
      </View>

      {/* Legend below the donut */}
      <View style={styles.donutLegend}>
        {data.map((it) => (
          <View key={it.label} style={styles.legendRow}>
            <View style={[styles.legendSq, { backgroundColor: it.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {it.label} {Math.round((it.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const BAR_TARGETS_A = [0.7, 0.85, 0.63, 0.95, 0.78, 1]
const BAR_TARGETS_B = [0.8, 0.8, 0.8, 0.88, 0.88, 1]
const BAR_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function OnboardingBarChart({ active }: { active: boolean }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!active) {
      progress.value = 0
      return
    }
    progress.value = 0
    progress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    })
  }, [active, progress])

  const barH = 230

  return (
    <View>
      <View style={styles.barLegendRow}>
        <View style={styles.barLegendItem}>
          <View style={[styles.barLegendSwatch, { backgroundColor: BLUE }]} />
          <Text style={styles.barLegendText}>Actual</Text>
        </View>
        <View style={styles.barLegendItem}>
          <View style={[styles.barLegendSwatch, { backgroundColor: CHART_YELLOW }]} />
          <Text style={styles.barLegendText}>Budget</Text>
        </View>
      </View>
      <View style={[styles.barChart, { height: barH }]}>
        {BAR_LABELS.map((_, i) => (
          <View key={i} style={styles.barGroup}>
            <BarPair
              progress={progress}
              targetA={BAR_TARGETS_A[i]!}
              targetB={BAR_TARGETS_B[i]!}
              maxH={barH}
              actualOver={i === 3}
            />
          </View>
        ))}
      </View>
      <View style={styles.barMonthRow}>
        {BAR_LABELS.map((m) => (
          <Text key={m} style={styles.barMonth}>
            {m}
          </Text>
        ))}
      </View>
    </View>
  )
}

function BarPair({
  progress,
  targetA,
  targetB,
  maxH,
  actualOver,
}: {
  progress: SharedValue<number>
  targetA: number
  targetB: number
  maxH: number
  actualOver: boolean
}) {
  const styleA = useAnimatedStyle(() => ({
    height: Math.max(2, progress.value * targetA * maxH),
  }))
  const styleB = useAnimatedStyle(() => ({
    height: Math.max(2, progress.value * targetB * maxH),
  }))

  return (
    <>
      <Animated.View
        style={[
          styles.bar,
          styleA,
          { backgroundColor: actualOver ? EYEBROW : BLUE },
        ]}
      />
      <Animated.View style={[styles.bar, styleB, { backgroundColor: CHART_YELLOW }]} />
    </>
  )
}

// Steeper line: y goes from 90 (near bottom) to 3 (near top) over x 10–210
// viewBox "0 0 220 110"  — baseline at y=97, labels at y=107
const LINE_PTS: [number, number][] = [
  [10, 90],
  [30, 80],
  [50, 68],
  [70, 57],
  [90, 45],
  [110, 34],
  [130, 24],
  [150, 15],
  [170, 9],
  [190, 5],
  [210, 3],
]

function polylineLength(pts: [number, number][]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i - 1]![0]
    const dy = pts[i]![1] - pts[i - 1]![1]
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return len
}

const LINE_PATH_D = LINE_PTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
const LINE_LEN = polylineLength(LINE_PTS)

const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath)

function OnboardingLineChart({ active }: { active: boolean }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!active) {
      progress.value = 0
      return
    }
    progress.value = 0
    progress.value = withTiming(1, {
      duration: 1400,
      easing: Easing.out(Easing.cubic),
    })
  }, [active, progress])

  // Fill closes at the baseline (y=97)
  const fillD = `${LINE_PATH_D} L210,97 L10,97 Z`

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: LINE_LEN * (1 - progress.value),
  }))

  const fillProps = useAnimatedProps(() => ({
    opacity: 0.1 * progress.value,
  }))

  return (
    <Svg width="100%" height={230} viewBox="0 0 220 110" preserveAspectRatio="xMidYMid meet">
      {/* Baseline and grid lines */}
      <Line x1="0" y1="97" x2="220" y2="97" stroke="#ddd" strokeWidth={1} />
      <Line x1="0" y1="66" x2="220" y2="66" stroke="#ddd" strokeWidth={0.5} />
      <Line x1="0" y1="35" x2="220" y2="35" stroke="#ddd" strokeWidth={0.5} />

      {/* Fill under line */}
      <AnimatedSvgPath
        d={fillD}
        fill={ORANGE_LINE}
        animatedProps={fillProps}
      />
      {/* Line */}
      <AnimatedSvgPath
        d={LINE_PATH_D}
        fill="none"
        stroke={ORANGE_LINE}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${LINE_LEN}`}
        animatedProps={lineProps}
      />

      {/* Anchor dots */}
      <Circle cx={10} cy={90} r={3.5} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />
      <Circle cx={110} cy={34} r={3.5} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />
      <Circle cx={210} cy={3} r={3.5} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />

      {/* Value label at peak */}
      <SvgText x={207} y={12} fontSize={7} fill={INK} textAnchor="end" fontFamily={MONO}>
        $4,800
      </SvgText>

      {/* Month labels below baseline */}
      <SvgText x={7} y={108} fontSize={7} fill={GRAY} fontFamily={MONO}>
        Jan
      </SvgText>
      <SvgText x={110} y={108} fontSize={7} fill={GRAY} textAnchor="middle" fontFamily={MONO}>
        Jun
      </SvgText>
      <SvgText x={213} y={108} fontSize={7} fill={GRAY} textAnchor="end" fontFamily={MONO}>
        Dec
      </SvgText>
    </Svg>
  )
}

const TRIP_PCT = 0.69

function OnboardingTripProgress({ active }: { active: boolean }) {
  const w = useSharedValue(0)

  useEffect(() => {
    if (!active) {
      w.value = 0
      return
    }
    w.value = 0
    w.value = withDelay(
      200,
      withTiming(TRIP_PCT * 100, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    )
  }, [active, w])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${w.value}%` as `${number}%`,
  }))

  return (
    <View style={styles.tripCard}>
      <Text style={styles.tripLabel}>Tokyo Trip · Nov</Text>
      <View style={styles.tripAmountRow}>
        <Text style={styles.tripAmount}>
          $1,240 <Text style={styles.tripAmountCap}> / $1,800</Text>
        </Text>
        <Text style={styles.tripPct}>69%</Text>
      </View>
      <View style={styles.tripTrack}>
        <Animated.View style={[styles.tripFill, fillStyle]} />
      </View>
    </View>
  )
}

type SlideDef = {
  key: string
  eyebrow: string
  title: [string, string]
  body: string
  variant: 'light' | 'dark'
}

const SLIDES: SlideDef[] = [
  {
    key: '1',
    eyebrow: 'Personal Finance',
    title: ['BUDGET', 'BRUTAL.'],
    body: 'Your money. On-device. Zero cloud. Just raw, honest numbers and brutal clarity.',
    variant: 'light',
  },
  {
    key: '2',
    eyebrow: 'Trends',
    title: ['SPEND VS', 'BUDGET.'],
    body: 'Six months of actuals against your plan. See exactly where you drift.',
    variant: 'light',
  },
  {
    key: '3',
    eyebrow: 'Savings',
    title: ['YOUR', 'RUNWAY.'],
    body: 'Watch the stack grow. Every month another brick in the wall.',
    variant: 'light',
  },
  {
    key: '4',
    eyebrow: 'Features',
    title: ['LOCK IT', 'DOWN.'],
    body: 'On-device. PIN + Face ID. Trip envelopes. All of it — yours.',
    variant: 'light',
  },
]

export default function OnboardingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const completeOnboardingPersisted = useAuthStore((s) => s.completeOnboardingPersisted)
  const [index, setIndex] = useState(0)
  const listRef = useRef<FlatList<SlideDef>>(null)

  const [donutSlices, setDonutSlices] = useState(() => randomDonutSlices())
  const [donutReplayKey, setDonutReplayKey] = useState(0)
  const leftFirstSlide = useRef(false)

  useEffect(() => {
    if (index !== 0) {
      leftFirstSlide.current = true
      return
    }
    if (!leftFirstSlide.current) return
    setDonutSlices(randomDonutSlices())
    setDonutReplayKey((k) => k + 1)
  }, [index])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const next = Math.round(x / SCREEN_W)
    if (next !== index) setIndex(next)
  }

  const finish = () => {
    completeOnboardingPersisted()
    router.replace('/setup-pin')
  }

  const next = () => {
    if (index >= SLIDES.length - 1) {
      finish()
      return
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true })
  }

  const goTo = useCallback((i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true })
  }, [])

  const renderItem: ListRenderItem<SlideDef> = useCallback(
    ({ item, index: i }) => {
      const isDark = item.variant === 'dark'
      const active = i === index
      const centerHero = item.key === '1'
      return (
        <View style={[styles.slide, isDark && styles.slideDark, { width: SCREEN_W }]}>
          {/* Text block — centered for all slides */}
          {centerHero ? null : (
            <View style={styles.slideTextWrap}>
              <Text style={[styles.slideEyebrow, isDark && styles.slideEyebrowDark]}>
                {item.eyebrow}
              </Text>
              <Text style={[styles.slideTitle, isDark && styles.slideTitleDark]}>{item.title[0]}</Text>
              <Text style={[styles.slideTitle, isDark && styles.slideTitleDark]}>{item.title[1]}</Text>
              <Text style={[styles.slideBody, isDark && styles.slideBodyDark]}>{item.body}</Text>
            </View>
          )}

          {/* Chart / visual area */}
          <View style={styles.chartFlex}>
            {centerHero ? (
              <View style={styles.heroBlock}>
                <Text style={styles.heroEyebrow}>{item.eyebrow}</Text>
                <Text style={styles.heroTitle}>{item.title[0]}</Text>
                <Text style={styles.heroTitle}>{item.title[1]}</Text>
              </View>
            ) : null}
            {item.key === '1' ? (
              <View style={styles.chartArea}>
                <Text style={styles.chartTag}>Monthly overview</Text>
                <OnboardingDonut values={donutSlices} active={active} replayKey={donutReplayKey} />
              </View>
            ) : null}
            {item.key === '2' ? (
              <View style={styles.chartArea}>
                <Text style={styles.chartTag}>Jul – Dec · Actual vs Budget</Text>
                <OnboardingBarChart active={active} />
              </View>
            ) : null}
            {item.key === '3' ? (
              <View style={styles.chartArea}>
                <Text style={styles.chartTag}>Cumulative savings · Jan – Dec</Text>
                <OnboardingLineChart active={active} />
              </View>
            ) : null}
            {item.key === '4' ? (
              <View style={styles.darkCharts}>
                <View style={styles.featGrid}>
                  <FeatCard
                    icon={<Ionicons name="lock-closed-outline" size={14} color={INK} />}
                    title="PIN + FaceID"
                    body="Secure enclave. Never transmitted."
                  />
                  <FeatCard
                    icon={<Ionicons name="time-outline" size={14} color={INK} />}
                    title="Auto-lock"
                    body="Inactivity locks instantly."
                  />
                  <FeatCard
                    icon={<Ionicons name="trending-up-outline" size={14} color={EYEBROW} />}
                    title="Live Charts"
                    body="Donut, bar & line — always on."
                  />
                  <FeatCard
                    icon={<Ionicons name="airplane-outline" size={14} color={INK} />}
                    title="Trip &amp; Event Budgets"
                    body="Envelopes per adventure or occasion."
                  />
                </View>
                <OnboardingTripProgress active={active} />
              </View>
            ) : null}
          </View>
        </View>
      )
    },
    [index, donutSlices, donutReplayKey],
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({
          length: SCREEN_W,
          offset: SCREEN_W * i,
          index: i,
        })}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={8}>
              <View style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            </Pressable>
          ))}
        </View>
        {/* CTA — neobrutalist style with press animation */}
        <Pressable onPress={next}>
          {({ pressed }) => (
            <View style={[styles.cta, pressed && styles.ctaPressed]} pointerEvents="none">
              <Text style={styles.ctaText}>{index >= SLIDES.length - 1 ? 'Get started' : 'Next →'}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function FeatCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <View style={styles.featCard}>
      <View style={styles.featIcon}>{icon}</View>
      <Text style={styles.featTitle}>{title}</Text>
      <Text style={styles.featBody}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CREAM,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideDark: {
    backgroundColor: INK,
  },

  // ── Text block (slides 2-4) ──────────────────────────────────────
  slideTextWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  slideEyebrow: {
    fontFamily: MONO,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: EYEBROW,
    marginBottom: 4,
    textAlign: 'center',
  },
  slideEyebrowDark: {
    color: FEAT_EYEBROW,
  },
  slideTitle: {
    fontFamily: DISPLAY,
    fontSize: 48,
    lineHeight: 48,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
    color: INK,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  slideTitleDark: {
    color: CREAM,
  },
  slideBody: {
    fontFamily: MONO,
    fontSize: 11,
    color: INK,
    opacity: 0.6,
    lineHeight: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  slideBodyDark: {
    color: CREAM,
  },

  // ── Chart flex wrapper ───────────────────────────────────────────
  chartFlex: {
    width: '100%',
    alignItems: 'center',
  },

  // ── Hero (slide 1) ───────────────────────────────────────────────
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  heroEyebrow: {
    fontFamily: MONO,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: EYEBROW,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroTitle: {
    fontFamily: DISPLAY,
    fontSize: 48,
    lineHeight: 48,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
    color: INK,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Chart card ───────────────────────────────────────────────────
  chartArea: {
    width: '100%',
    backgroundColor: tokens.color.card,
    borderWidth: 2,
    borderColor: INK,
    padding: 14,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  chartTag: {
    fontFamily: MONO,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: GRAY,
    marginBottom: 12,
  },

  // ── Donut (column: chart on top, legend below) ───────────────────
  donutCol: {
    alignItems: 'center',
    gap: 14,
  },
  donutCanvasWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
  },
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  donutCenterValue: {
    fontFamily: DISPLAY,
    fontSize: 13,
    color: INK,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
  },
  donutCenterSub: {
    fontFamily: MONO,
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },
  donutLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSq: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: INK,
  },
  legendText: {
    fontFamily: MONO,
    fontSize: 10,
    color: INK,
  },

  // ── Bar chart ────────────────────────────────────────────────────
  barLegendRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  barLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barLegendSwatch: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: INK,
  },
  barLegendText: {
    fontFamily: MONO,
    fontSize: 11,
    color: INK,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    flex: 1,
    borderWidth: 1,
    borderColor: INK,
    minHeight: 2,
  },
  barMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  barMonth: {
    fontFamily: MONO,
    fontSize: 11,
    color: GRAY,
    flex: 1,
    textAlign: 'center',
  },

  // ── Dark slide (slide 4) ─────────────────────────────────────────
  darkCharts: {
    width: '100%',
    gap: 10,
  },
  featGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featCard: {
    width: (SCREEN_W - 40 - 6) / 2,
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
    padding: 10,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  featIcon: {
    width: 24,
    height: 24,
    backgroundColor: YELLOW,
    borderWidth: 1.5,
    borderColor: INK,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featTitle: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: '700',
    color: INK,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  featBody: {
    fontFamily: MONO,
    fontSize: 8,
    color: INK,
    opacity: 0.55,
    lineHeight: 12,
  },
  tripCard: {
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: INK,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  tripLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: INK,
    opacity: 0.45,
    marginBottom: 3,
  },
  tripAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  tripAmount: {
    fontFamily: DISPLAY,
    fontSize: 22,
    color: INK,
    lineHeight: 24,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
  },
  tripAmountCap: {
    fontSize: 13,
    opacity: 0.4,
  },
  tripPct: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '700',
    color: EYEBROW,
  },
  tripTrack: {
    height: 5,
    backgroundColor: 'rgba(17,17,17,0.1)',
    borderWidth: 1,
    borderColor: INK,
    overflow: 'hidden',
  },
  tripFill: {
    height: '100%',
    backgroundColor: BLUE,
  },

  // ── Footer ───────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: INK,
    backgroundColor: CREAM,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderWidth: 2,
    borderColor: INK,
  },
  dotActive: {
    backgroundColor: INK,
  },
  dotInactive: {
    backgroundColor: 'transparent',
  },

  // ── CTA button — neobrutalist, matches app style ─────────────────
  cta: {
    width: '100%',
    backgroundColor: YELLOW,
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  ctaPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: INK,
  },
})
