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

// —— Skia donut (same sweep animation pattern as insights) ——
const DONUT_SIZE = 100
const STROKE_WIDTH = 14
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
    <View style={styles.donutRow}>
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

  const barH = 80

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

const LINE_PTS: [number, number][] = [
  [10, 72],
  [30, 68],
  [50, 63],
  [70, 58],
  [90, 50],
  [110, 44],
  [130, 36],
  [150, 29],
  [170, 24],
  [190, 17],
  [210, 10],
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

  const fillD = `${LINE_PATH_D} L210,75 L10,75 Z`

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: LINE_LEN * (1 - progress.value),
  }))

  const fillProps = useAnimatedProps(() => ({
    opacity: 0.08 * progress.value,
  }))

  return (
    <Svg width="100%" height={90} viewBox="0 0 220 90" preserveAspectRatio="xMidYMid meet">
      <Line x1="0" y1="75" x2="220" y2="75" stroke="#ddd" strokeWidth={1} />
      <Line x1="0" y1="50" x2="220" y2="50" stroke="#ddd" strokeWidth={0.5} />
      <Line x1="0" y1="25" x2="220" y2="25" stroke="#ddd" strokeWidth={0.5} />
      <AnimatedSvgPath
        d={fillD}
        fill={ORANGE_LINE}
        animatedProps={fillProps}
      />
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
      <Circle cx={10} cy={72} r={3} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />
      <Circle cx={110} cy={44} r={3} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />
      <Circle cx={210} cy={10} r={3} fill={ORANGE_LINE} stroke={INK} strokeWidth={1.2} />
      <SvgText x={207} y={8} fontSize={6} fill={INK} textAnchor="end" fontFamily={MONO}>
        $4,800
      </SvgText>
      <SvgText x={7} y={85} fontSize={6} fill={GRAY} fontFamily={MONO}>
        Jan
      </SvgText>
      <SvgText x={110} y={85} fontSize={6} fill={GRAY} textAnchor="middle" fontFamily={MONO}>
        Jun
      </SvgText>
      <SvgText x={210} y={85} fontSize={6} fill={GRAY} textAnchor="end" fontFamily={MONO}>
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
    variant: 'dark',
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
      return (
        <View style={[styles.slide, isDark && styles.slideDark, { width: SCREEN_W }]}>
          <Text style={[styles.slideEyebrow, isDark && styles.slideEyebrowDark]}>{item.eyebrow}</Text>
          <Text style={[styles.slideTitle, isDark && styles.slideTitleDark]}>{item.title[0]}</Text>
          <Text style={[styles.slideTitle, isDark && styles.slideTitleDark]}>{item.title[1]}</Text>
          <Text style={[styles.slideBody, isDark && styles.slideBodyDark]}>{item.body}</Text>

          <View style={styles.chartFlex}>
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
                    icon={<Ionicons name="lock-closed-outline" size={14} color={FEAT_EYEBROW} />}
                    title="PIN + FaceID"
                    body="Secure enclave. Never transmitted."
                  />
                  <FeatCard
                    icon={<Ionicons name="time-outline" size={14} color={FEAT_EYEBROW} />}
                    title="Auto-lock"
                    body="Inactivity locks instantly."
                  />
                  <FeatCard
                    icon={<Ionicons name="trending-up-outline" size={14} color={EYEBROW} />}
                    title="Live Charts"
                    body="Donut, bar & line — always on."
                  />
                  <FeatCard
                    icon={<Ionicons name="airplane-outline" size={14} color={FEAT_EYEBROW} />}
                    title="Trip Budgets"
                    body="Envelopes per adventure."
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
      <View style={styles.slideLabelRow}>
        <View style={styles.slidePill}>
          <Text style={styles.slidePillText}>Slide</Text>
        </View>
        <Text style={styles.slideCounter}>
          {index + 1} / {SLIDES.length}
        </Text>
      </View>

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
        <Pressable onPress={next} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}>
          <Text style={styles.ctaText}>{index >= SLIDES.length - 1 ? 'Get started' : 'Next →'}</Text>
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
  slideLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  slidePill: {
    backgroundColor: INK,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  slidePillText: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '700',
    color: CREAM,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  slideCounter: {
    fontFamily: MONO,
    fontSize: 12,
    color: GRAY,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  slideDark: {
    backgroundColor: INK,
    marginHorizontal: 0,
  },
  slideEyebrow: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: EYEBROW,
    marginBottom: 4,
  },
  slideEyebrowDark: {
    color: FEAT_EYEBROW,
  },
  slideTitle: {
    fontFamily: DISPLAY,
    fontSize: 38,
    lineHeight: 38,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
    color: INK,
    letterSpacing: 0.5,
  },
  slideTitleDark: {
    color: CREAM,
  },
  slideBody: {
    fontFamily: MONO,
    fontSize: 10,
    color: INK,
    opacity: 0.6,
    lineHeight: 15,
    marginTop: 6,
    marginBottom: 12,
  },
  slideBodyDark: {
    color: CREAM,
  },
  chartFlex: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  chartArea: {
    width: '100%',
    backgroundColor: tokens.color.card,
    borderWidth: 2,
    borderColor: INK,
    padding: 12,
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
    marginBottom: 8,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 12,
    color: INK,
    fontWeight: Platform.OS === 'android' ? '700' : undefined,
  },
  donutCenterSub: {
    fontFamily: MONO,
    fontSize: 7,
    color: GRAY,
    marginTop: 2,
  },
  donutLegend: {
    flex: 1,
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSq: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: INK,
  },
  legendText: {
    fontFamily: MONO,
    fontSize: 9,
    color: INK,
    flex: 1,
  },
  barLegendRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  barLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  barLegendSwatch: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: INK,
  },
  barLegendText: {
    fontFamily: MONO,
    fontSize: 8,
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
    marginTop: 5,
  },
  barMonth: {
    fontFamily: MONO,
    fontSize: 8,
    color: GRAY,
    flex: 1,
    textAlign: 'center',
  },
  darkCharts: {
    width: '100%',
    gap: 8,
  },
  featGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featCard: {
    width: (SCREEN_W - 40 - 6) / 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 10,
  },
  featIcon: {
    width: 24,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featTitle: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  featBody: {
    fontFamily: MONO,
    fontSize: 8,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 12,
  },
  tripCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tripLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
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
    color: CREAM,
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
    color: FEAT_EYEBROW,
  },
  tripTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  tripFill: {
    height: '100%',
    backgroundColor: FEAT_EYEBROW,
  },
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
    marginBottom: 12,
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
  cta: {
    width: '100%',
    backgroundColor: INK,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: EYEBROW,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  ctaText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: CREAM,
  },
})
