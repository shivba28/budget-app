import type { ReactElement } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg'

const INK = '#111111'
const CREAM = '#FAFAF5'
const YELLOW = '#F5C842'
const MUTED = '#D8D1C7'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

// Shared stroke style for pencil-sketch feel
const SK = { stroke: INK, strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const SK_THIN = { stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const SK_DASHED = { ...SK_THIN, strokeDasharray: '4 3' }

// ─── No Transactions ────────────────────────────────────────────────────────
function NoTransactionsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Receipt body */}
      <Rect x={32} y={10} width={76} height={88} rx={2} fill={CREAM} {...SK} />
      {/* Zigzag bottom of receipt */}
      <Path
        d="M32 98 L40 90 L48 98 L56 90 L64 98 L72 90 L80 98 L88 90 L96 98 L108 98"
        fill="none"
        {...SK}
      />
      {/* Lines on receipt */}
      <Line x1={44} y1={26} x2={96} y2={26} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      <Line x1={44} y1={36} x2={84} y2={36} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      <Line x1={44} y1={46} x2={90} y2={46} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      <Line x1={44} y1={56} x2={78} y2={56} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      {/* Dollar amount area */}
      <Rect x={44} y={66} width={52} height={14} rx={1} fill={YELLOW} {...SK_THIN} />
      <Line x1={50} y1={73} x2={90} y2={73} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      {/* Plus badge */}
      <Circle cx={108} cy={22} r={14} fill={YELLOW} {...SK} />
      <Line x1={108} y1={15} x2={108} y2={29} {...SK} />
      <Line x1={101} y1={22} x2={115} y2={22} {...SK} />
      {/* Pencil scribble lines */}
      <Path d="M22 105 Q30 100 38 106" fill="none" {...SK_DASHED} />
      <Path d="M102 105 Q110 102 118 107" fill="none" {...SK_DASHED} />
    </Svg>
  )
}

// ─── No Trips ────────────────────────────────────────────────────────────────
function NoTripsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Suitcase body */}
      <Rect x={28} y={36} width={84} height={62} rx={4} fill={CREAM} {...SK} />
      {/* Suitcase handle */}
      <Path d="M52 36 L52 24 Q52 18 60 18 L80 18 Q88 18 88 24 L88 36" fill="none" {...SK} />
      {/* Center divider */}
      <Line x1={28} y1={67} x2={112} y2={67} {...SK} />
      {/* Latches */}
      <Rect x={62} y={60} width={16} height={14} rx={2} fill={YELLOW} {...SK_THIN} />
      <Line x1={70} y1={64} x2={70} y2={70} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      {/* Corner wheels */}
      <Circle cx={42} cy={100} r={5} fill={MUTED} {...SK_THIN} />
      <Circle cx={98} cy={100} r={5} fill={MUTED} {...SK_THIN} />
      {/* Sticker patch */}
      <Rect x={32} y={42} width={20} height={14} rx={1} fill="#FFB3B3" {...SK_THIN} />
      {/* Pencil scribble */}
      <Path d="M20 110 Q30 105 40 110" fill="none" {...SK_DASHED} />
      <Path d="M100 110 Q115 107 125 112" fill="none" {...SK_DASHED} />
    </Svg>
  )
}

// ─── No Linked Accounts ───────────────────────────────────────────────────────
function NoAccountsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Bank building */}
      <Rect x={24} y={50} width={92} height={56} rx={1} fill={CREAM} {...SK} />
      {/* Roof / pediment */}
      <Path d="M18 52 L70 18 L122 52 Z" fill={YELLOW} {...SK} />
      {/* Columns */}
      <Rect x={34} y={54} width={8} height={48} fill={CREAM} {...SK_THIN} />
      <Rect x={52} y={54} width={8} height={48} fill={CREAM} {...SK_THIN} />
      <Rect x={80} y={54} width={8} height={48} fill={CREAM} {...SK_THIN} />
      <Rect x={98} y={54} width={8} height={48} fill={CREAM} {...SK_THIN} />
      {/* Door */}
      <Rect x={58} y={74} width={24} height={30} rx={1} fill={MUTED} {...SK_THIN} />
      {/* Link/chain icon - broken */}
      <Path d="M88 28 Q96 24 100 30 Q104 36 98 40 L90 44" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <Path d="M76 42 Q68 46 72 52 Q76 58 82 54 L90 50" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <Line x1={86} y1={38} x2={82} y2={46} stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="3 3" />
    </Svg>
  )
}

// ─── No Insights ─────────────────────────────────────────────────────────────
function NoInsightsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Chart axes */}
      <Line x1={24} y1={16} x2={24} y2={96} {...SK} />
      <Line x1={24} y1={96} x2={120} y2={96} {...SK} />
      {/* Y-axis ticks */}
      <Line x1={20} y1={36} x2={28} y2={36} {...SK_THIN} />
      <Line x1={20} y1={56} x2={28} y2={56} {...SK_THIN} />
      <Line x1={20} y1={76} x2={28} y2={76} {...SK_THIN} />
      {/* Bars — rough/sketchy heights */}
      <Rect x={34} y={54} width={16} height={42} fill={YELLOW} {...SK_THIN} />
      <Rect x={58} y={38} width={16} height={58} fill={MUTED} {...SK_THIN} />
      <Rect x={82} y={64} width={16} height={32} fill={YELLOW} {...SK_THIN} />
      <Rect x={106} y={44} width={16} height={52} fill={MUTED} {...SK_THIN} />
      {/* Magnifying glass over chart */}
      <Circle cx={100} cy={38} r={20} fill="rgba(245,200,66,0.18)" {...SK} />
      <Line x1={114} y1={52} x2={126} y2={64} {...SK} />
      {/* Question mark inside magnifier */}
      <Path d="M96 30 Q96 26 100 26 Q104 26 104 30 Q104 34 100 36 L100 40" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={100} cy={44} r={1.5} fill={INK} />
    </Svg>
  )
}

// ─── No Budgets ───────────────────────────────────────────────────────────────
function NoBudgetsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Clipboard */}
      <Rect x={28} y={20} width={84} height={90} rx={2} fill={CREAM} {...SK} />
      {/* Clip at top */}
      <Rect x={52} y={14} width={36} height={14} rx={3} fill={MUTED} {...SK} />
      <Rect x={60} y={10} width={20} height={10} rx={2} fill={CREAM} {...SK_THIN} />
      {/* Checkboxes and lines */}
      <Rect x={38} y={38} width={10} height={10} rx={1} fill={CREAM} {...SK_THIN} />
      <Line x1={54} y1={43} x2={96} y2={43} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      <Rect x={38} y={56} width={10} height={10} rx={1} fill={YELLOW} {...SK_THIN} />
      <Path d="M40 61 L43 64 L48 57" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={54} y1={61} x2={88} y2={61} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      <Rect x={38} y={74} width={10} height={10} rx={1} fill={CREAM} {...SK_THIN} />
      <Line x1={54} y1={79} x2={92} y2={79} stroke={MUTED} strokeWidth={3} strokeLinecap="round" />
      {/* Dollar sign */}
      <SvgText
        x={95}
        y={108}
        fontSize={28}
        fontWeight="900"
        fill={YELLOW}
        stroke={INK}
        strokeWidth={1}
        fontFamily={MONO ?? 'monospace'}
      >
        $
      </SvgText>
    </Svg>
  )
}

// ─── No Events ────────────────────────────────────────────────────────────────
function NoEventsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Calendar body */}
      <Rect x={22} y={28} width={96} height={82} rx={3} fill={CREAM} {...SK} />
      {/* Calendar header bar */}
      <Rect x={22} y={28} width={96} height={22} rx={3} fill={YELLOW} {...SK} />
      {/* Ring hooks */}
      <Rect x={44} y={20} width={8} height={16} rx={4} fill={MUTED} {...SK_THIN} />
      <Rect x={88} y={20} width={8} height={16} rx={4} fill={MUTED} {...SK_THIN} />
      {/* Day grid lines */}
      <Line x1={22} y1={68} x2={118} y2={68} {...SK_THIN} />
      <Line x1={22} y1={88} x2={118} y2={88} {...SK_THIN} />
      <Line x1={54} y1={50} x2={54} y2={110} {...SK_THIN} />
      <Line x1={86} y1={50} x2={86} y2={110} {...SK_THIN} />
      {/* Star / event marker */}
      <Path d="M70 55 L73 63 L82 63 L75 68 L78 76 L70 71 L62 76 L65 68 L58 63 L67 63 Z"
        fill={INK} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      {/* Small dots in other cells */}
      <Circle cx={40} cy={78} r={4} fill={MUTED} {...SK_THIN} />
      <Circle cx={102} cy={78} r={4} fill={MUTED} {...SK_THIN} />
      <Circle cx={40} cy={99} r={4} fill={YELLOW} {...SK_THIN} />
      {/* Sparkle */}
      <Path d="M112 22 L114 26 L118 28 L114 30 L112 34 L110 30 L106 28 L110 26 Z"
        fill={YELLOW} {...SK_THIN} />
    </Svg>
  )
}

// ─── No Savings Goals ─────────────────────────────────────────────────────────
function NoSavingsGoalsIllustration() {
  return (
    <Svg width={140} height={120} viewBox="0 0 140 120">
      {/* Jar body */}
      <Rect x={36} y={46} width={68} height={60} rx={6} fill={CREAM} {...SK} />
      {/* Jar neck */}
      <Rect x={44} y={32} width={52} height={18} rx={3} fill={MUTED} {...SK} />
      {/* Lid */}
      <Rect x={38} y={22} width={64} height={14} rx={4} fill={INK} />
      {/* Coin slot in lid */}
      <Rect x={58} y={20} width={24} height={6} rx={3} fill={CREAM} />
      {/* Coin in air — circle with $ */}
      <Circle cx={70} cy={11} r={10} fill={YELLOW} {...SK} />
      <SvgText
        x={70} y={14}
        textAnchor="middle"
        fontSize={9}
        fontWeight="900"
        fill={INK}
        fontFamily={MONO}
      >$</SvgText>
      {/* Stacked coins inside jar — uniform size */}
      <Ellipse cx={70} cy={88} rx={10} ry={4} fill={YELLOW} {...SK_THIN} />
      <Ellipse cx={70} cy={80} rx={10} ry={4} fill={YELLOW} {...SK_THIN} />
      <Ellipse cx={70} cy={72} rx={10} ry={4} fill={YELLOW} {...SK_THIN} />
      <Ellipse cx={70} cy={64} rx={10} ry={4} fill={YELLOW} {...SK_THIN} />
      {/* Jar shine */}
      <Line x1={44} y1={52} x2={44} y2={96} stroke={CREAM} strokeWidth={4} strokeLinecap="round" strokeOpacity={0.55} />
      {/* Progress bar below */}
      <Rect x={22} y={114} width={96} height={6} rx={3} fill={MUTED} {...SK_THIN} />
      <Rect x={22} y={114} width={44} height={6} rx={3} fill={YELLOW} />
    </Svg>
  )
}

// ─── Illustration map ─────────────────────────────────────────────────────────
type IllustrationVariant = 'transactions' | 'trips' | 'accounts' | 'insights' | 'budgets' | 'events' | 'savings-goals'

const ILLUSTRATIONS: Record<IllustrationVariant, () => ReactElement> = {
  transactions: NoTransactionsIllustration,
  trips: NoTripsIllustration,
  accounts: NoAccountsIllustration,
  insights: NoInsightsIllustration,
  budgets: NoBudgetsIllustration,
  events: NoEventsIllustration,
  'savings-goals': NoSavingsGoalsIllustration,
}

// ─── EmptyState component ─────────────────────────────────────────────────────
type EmptyStateProps = {
  variant: IllustrationVariant
  title: string
  subtitle?: string
}

export function EmptyState({ variant, title, subtitle }: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[variant]
  return (
    <View style={styles.container}>
      <View style={styles.illustrationWrap}>
        <Illustration />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 16,
  },
  illustrationWrap: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    shadowColor: INK,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
    padding: 12,
  },
  textWrap: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '900',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 18,
  },
})
