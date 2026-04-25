import { Dimensions, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useEffect } from 'react'
import { usePathname } from 'expo-router'

import { useTabStore } from '@/src/stores/tabStore'
import { TabBarWithCenterFab } from '@/src/components/navigation/TabBarWithCenterFab'

// Import all tab screens directly so they can be rendered simultaneously
import TransactionsScreen from './transactions'
import InsightsScreen from './insights'
import TripsListScreen from './trips/index'
import SettingsScreen from './settings'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const N = 4

function pathToIndex(pathname: string): number {
  if (pathname.startsWith('/app/insights')) return 1
  if (pathname.startsWith('/app/trips')) return 2
  if (pathname.startsWith('/app/settings')) return 3
  return 0
}

export default function TabsLayout() {
  const pathname = usePathname()
  const { activeIndex, setActiveIndex } = useTabStore()

  // Initialise from URL on first mount so deep-links land on the right tab
  useEffect(() => {
    const idx = pathToIndex(pathname)
    if (idx !== activeIndex) {
      setActiveIndex(idx)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Horizontal offset: 0 = transactions, -SW = insights, -2SW = trips, -3SW = settings
  const offsetX = useSharedValue(-activeIndex * SCREEN_WIDTH)

  // SharedValue mirror of activeIndex so gesture worklets can read it without closure capture
  const activeIndexSV = useSharedValue(activeIndex)

  // When activeIndex changes (tab tap or programmatic), spring to the new position
  useEffect(() => {
    activeIndexSV.value = activeIndex
    offsetX.value = withSpring(-activeIndex * SCREEN_WIDTH, {
      damping: 28,
      stiffness: 280,
      mass: 0.9,
    })
  }, [activeIndex])

  const navigateTo = (idx: number) => {
    setActiveIndex(idx)
  }

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      'worklet'
      cancelAnimation(offsetX)
    })
    .onUpdate((e) => {
      'worklet'
      const base = -activeIndexSV.value * SCREEN_WIDTH
      let dx = e.translationX
      // Rubber-band at the edges
      if ((activeIndexSV.value === 0 && dx > 0) || (activeIndexSV.value === N - 1 && dx < 0)) {
        dx = dx * 0.15
      }
      offsetX.value = base + dx
    })
    .onEnd((e) => {
      'worklet'
      const idx = activeIndexSV.value
      const velocity = e.velocityX
      const translation = e.translationX

      const fast = Math.abs(velocity) > 400
      const far = Math.abs(translation) > SCREEN_WIDTH * 0.32

      let nextIdx = idx
      if (fast || far) {
        if (translation < 0 && idx < N - 1) nextIdx = idx + 1
        else if (translation > 0 && idx > 0) nextIdx = idx - 1
      }

      offsetX.value = withSpring(
        -nextIdx * SCREEN_WIDTH,
        { damping: 26, stiffness: 260, mass: 0.9, velocity: -velocity },
        (finished) => {
          if (finished && nextIdx !== idx) {
            runOnJS(navigateTo)(nextIdx)
          }
        },
      )
    })

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }))

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.row, rowStyle]}>
          <View style={styles.page}>
            <TransactionsScreen />
          </View>
          <View style={styles.page}>
            <InsightsScreen />
          </View>
          <View style={styles.page}>
            <TripsListScreen />
          </View>
          <View style={styles.page}>
            <SettingsScreen />
          </View>
        </Animated.View>

        <TabBarWithCenterFab currentIndex={activeIndex} onTabPress={navigateTo} />
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * N,
  },
  page: {
    width: SCREEN_WIDTH,
    overflow: 'hidden',
  },
})
