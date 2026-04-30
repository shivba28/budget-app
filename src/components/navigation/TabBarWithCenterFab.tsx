import { useUiSignals } from '@/src/stores/uiSignals'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { createAnimatedComponent } from 'react-native-reanimated'

// Indices of tabs that show the FAB
const FAB_INDICES = new Set([0, 2]) // 0=transactions, 2=trips

const FAB = {
  ink: '#111111',
  yellow: '#F5C842',
  icon: '#FAFAF5',
} as const

const AnimatedPressable = createAnimatedComponent(Pressable)
const FAB_SIZE = 70
const BAR_HEIGHT = 50

const TAB_ICONS: Array<keyof typeof Ionicons.glyphMap> = [
  'home',
  'pie-chart',
  'airplane',
  'settings',
]

interface Props {
  currentIndex: number
  onTabPress: (index: number) => void
}

function AddButton({ onPress, a11yLabel }: { onPress: () => void; a11yLabel: string }) {
  const pressed = useSharedValue(0)

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: withTiming(pressed.value * 2, { duration: 80 }) },
    ],
    shadowOpacity: withTiming(pressed.value === 1 ? 0 : 1, { duration: 80 }),
    shadowOffset: {
      width: withTiming(pressed.value === 1 ? 0 : 2, { duration: 80 }),
      height: withTiming(pressed.value === 1 ? 0 : 2, { duration: 80 }),
    },
  }))

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { pressed.value = 1 }}
      onPressOut={() => { pressed.value = 0 }}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Animated.View style={[styles.addBtn, animStyle]}>
        <Ionicons name="add" size={40} color={FAB.ink} />
      </Animated.View>
    </Pressable>
  )
}

function FabSlot({
  onPress,
  a11yLabel,
  visible,
  bottomPad,
}: {
  onPress: () => void
  a11yLabel: string
  visible: boolean
  bottomPad: number
}) {
  const [mounted, setMounted] = useState(visible)
  const translateY = useSharedValue(visible ? 0 : 100)
  const opacity = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = 100
      opacity.value = 0
      translateY.value = withTiming(0, { duration: 220 })
      opacity.value = withTiming(1, { duration: 220 })
    } else {
      translateY.value = withTiming(100, { duration: 220 })
      opacity.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  if (!mounted) return null

  return (
    <Animated.View
      style={[
        styles.fabOverlay,
        { bottom: bottomPad + ((BAR_HEIGHT + 10) - FAB_SIZE) / 2 },
        animStyle,
      ]}
    >
      <AddButton onPress={onPress} a11yLabel={a11yLabel} />
    </Animated.View>
  )
}

function TabIcon({ index, active }: { index: number; active: boolean }) {
  return (
    <View style={{ opacity: active ? 1 : 0.7 }}>
      <Ionicons name={TAB_ICONS[index]!} size={28} color={FAB.icon} />
    </View>
  )
}

export function TabBarWithCenterFab({ currentIndex, onTabPress }: Props) {
  const triggerAddTrip = useUiSignals((s) => s.triggerAddTrip)
  const triggerAddTransaction = useUiSignals((s) => s.triggerAddTransaction)
  const insets = useSafeAreaInsets()

  const showFab = FAB_INDICES.has(currentIndex)
  const bottomPad = Math.max(insets.bottom, 10)

  const onFabPress = () => {
    if (currentIndex === 0) triggerAddTransaction()
    else if (currentIndex === 2) triggerAddTrip()
  }

  const a11yLabel = currentIndex === 0 ? 'Add transaction' : 'Add trip or event'

  // Build the slot list: 4 tab icons with a centre placeholder when FAB is shown
  const slots = showFab
    ? [0, 1, '__add__' as const, 2, 3]
    : [0, 1, 2, 3]

  return (
    <View style={styles.wrap}>
      <View
        pointerEvents="box-none"
        style={[styles.floatingWrap, { bottom: 0, paddingBottom: bottomPad }]}
      >
        <View style={styles.floatingBar}>
          <Animated.View style={styles.row} layout={LinearTransition.duration(260)}>
            {slots.map((slot, i) => {
              if (slot === '__add__') {
                return <View key="__add__" style={styles.fabPlaceholder} />
              }
              const tabIndex = slot as number
              const isFocused = currentIndex === tabIndex
              return (
                <AnimatedPressable
                  key={tabIndex}
                  onPress={() => onTabPress(tabIndex)}
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isFocused }}
                  layout={LinearTransition.duration(260)}
                >
                  <TabIcon index={tabIndex} active={isFocused} />
                </AnimatedPressable>
              )
            })}
          </Animated.View>
        </View>

        <FabSlot
          visible={showFab}
          onPress={onFabPress}
          a11yLabel={a11yLabel}
          bottomPad={bottomPad}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  floatingWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 5,
  },
  floatingBar: {
    borderWidth: 3,
    borderColor: FAB.ink,
    backgroundColor: FAB.ink,
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 5,
    paddingHorizontal: 18,
    minHeight: BAR_HEIGHT,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
  },
  fabPlaceholder: {
    width: FAB_SIZE,
    height: 30,
  },
  fabOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 10,
  },
  addBtn: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 3,
    borderColor: FAB.icon,
    backgroundColor: FAB.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FAB.ink,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
})
