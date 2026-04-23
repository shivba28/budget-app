import { useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { useAuthStore } from '@/src/auth/authStore'
import { BrutalButton } from '@/src/components/Brutalist'
import { tokens } from '@/src/theme/tokens'

const { width: SCREEN_W } = Dimensions.get('window')

type Slide = {
  key: string
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    key: '1',
    title: 'Your money, on-device',
    body: 'No cloud database. Bank tokens stay in the secure enclave; budgets and trips live in SQLite.',
  },
  {
    key: '2',
    title: 'Neo-brutal clarity',
    body: 'Hard edges, loud type, and pencil-drawn moments so the app feels human — not another pastel fintech.',
  },
  {
    key: '3',
    title: 'Lock it down',
    body: 'A PIN plus Face ID or Touch ID on your phone. Inactivity lock keeps nosy friends out.',
  },
]

function SketchHero({ seed }: { seed: number }) {
  const d =
    seed === 0
      ? 'M20 120 Q90 40 160 100 T300 90 M40 180 C100 140 180 220 260 170'
      : seed === 1
        ? 'M30 80 L120 200 M200 60 L150 200 M250 100 C300 40 320 160 280 190'
        : 'M50 100 C120 20 200 40 260 110 S320 200 220 210 M80 160 L240 150'
  return (
    <Svg width={SCREEN_W - tokens.space[5] * 2} height={160} viewBox="0 0 340 220">
      <Path
        d={d}
        stroke={tokens.color.fg}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

export default function OnboardingScreen() {
  const router = useRouter()
  const completeOnboardingPersisted = useAuthStore(
    (s) => s.completeOnboardingPersisted,
  )
  const [index, setIndex] = useState(0)
  const listRef = useRef<FlatList<Slide>>(null)

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const next = Math.round(x / SCREEN_W)
    if (next !== index) setIndex(next)
  }

  const renderItem: ListRenderItem<Slide> = ({ item, index: i }) => (
    <View style={{ width: SCREEN_W, paddingHorizontal: tokens.space[5] }}>
      <Text style={styles.labelCaps}>SECTION</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
      <View style={styles.hero}>
        <SketchHero seed={i} />
      </View>
    </View>
  )

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

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
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
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.dot,
              i === index ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <BrutalButton
          title={index >= SLIDES.length - 1 ? 'Get started' : 'Next'}
          onPress={next}
        />
        <BrutalButton
          title="Skip intro"
          variant="neutral"
          onPress={finish}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingTop: tokens.space[6],
  },
  labelCaps: {
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.fg,
    letterSpacing: 1,
    marginBottom: tokens.space[2],
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: tokens.color.fg,
    opacity: 0.88,
    fontFamily: tokens.font.mono,
    lineHeight: 22,
  },
  hero: {
    marginTop: tokens.space[5],
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.space[2],
    marginBottom: tokens.space[4],
  },
  dot: {
    width: 10,
    height: 10,
    borderWidth: tokens.border.w2,
    borderColor: tokens.color.border,
  },
  dotActive: {
    backgroundColor: tokens.color.accent,
  },
  dotInactive: {
    backgroundColor: tokens.color.card,
  },
  actions: {
    paddingHorizontal: tokens.space[5],
    paddingBottom: tokens.space[6],
    gap: tokens.space[3],
  },
})
