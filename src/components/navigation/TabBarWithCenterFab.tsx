import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
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
import { useState } from 'react'

const FAB_TABS = new Set(['transactions', 'trips'])

const FAB = {
  ink: '#111111',
  yellow: '#F5C842',
  icon: '#FAFAF5',
} as const

const AnimatedPressable = createAnimatedComponent(Pressable)
const FAB_SIZE = 70
const BAR_HEIGHT = 50

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

function FabSlot({ onPress, a11yLabel, visible, bottomPad }: { onPress: () => void; a11yLabel: string; visible: boolean; bottomPad: number }) {
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
    <Animated.View style={[styles.fabOverlay, { bottom: bottomPad + ((BAR_HEIGHT + 10) - FAB_SIZE) / 2 }, animStyle]}>
      <AddButton onPress={onPress} a11yLabel={a11yLabel} />
    </Animated.View>
  )
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const iconName =
    name === 'transactions'
      ? 'list'
      : name === 'insights'
        ? 'pie-chart'
        : name === 'trips'
          ? 'airplane'
          : 'settings'

  return (
    <View style={{ opacity: active ? 1 : 0.7 }}>
      <Ionicons name={iconName} size={28} color={FAB.icon} />
    </View>
  )
}

export function TabBarWithCenterFab(props: BottomTabBarProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const routeName = props.state.routes[props.state.index]?.name
  const showFab = routeName != null && FAB_TABS.has(routeName)
  const bottomPad = Math.max(insets.bottom, 10)

  const onFabPress = () => {
    if (routeName === 'transactions') router.push('/app/transaction-new')
    else if (routeName === 'trips') router.push('/app/trip-new')
  }

  const a11yLabel = routeName === 'transactions' ? 'Add transaction' : 'Add trip'

  const slots = useMemo(() => {
    const byName = new Map(props.state.routes.map((r) => [r.name, r]))
    const order = showFab
      ? (['transactions', 'insights', '__add__', 'trips', 'settings'] as const)
      : (['transactions', 'insights', 'trips', 'settings'] as const)
    return order.map((name) => {
      if (name === '__add__') return null
      return byName.get(name) ?? null
    })
  }, [props.state.routes, showFab])

  return (
    <View style={styles.wrap}>
      <View
        pointerEvents="box-none"
        style={[styles.floatingWrap, { bottom: 0, paddingBottom: bottomPad }]}
      >
        <View style={styles.floatingBar}>
          <Animated.View style={styles.row} layout={LinearTransition.duration(260)}>
            {slots.map((route, i) => {
              if (showFab && i === 2) {
                return <View key="__add__" style={styles.fabPlaceholder} />
              }
              if (!route) return <View key={`missing-${i}`} style={styles.item} />

              const idx = props.state.routes.findIndex((r) => r.key === route.key)
              const isFocused = props.state.index === idx
              const onPress = () => {
                const event = props.navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!isFocused && !event.defaultPrevented) {
                  props.navigation.navigate(route.name as never)
                }
              }

              return (
                <AnimatedPressable
                  key={route.key}
                  onPress={onPress}
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isFocused }}
                  layout={LinearTransition.duration(260)}
                >
                  <TabIcon name={route.name} active={isFocused} />
                </AnimatedPressable>
              )
            })}
          </Animated.View>
        </View>

        {/* FAB outside floatingBar, manually animated */}
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
    left: 14,
    right: 14,
    zIndex: 5,
  },
  floatingBar: {
    borderWidth: 3,
    borderColor: FAB.icon,
    backgroundColor: FAB.ink,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: FAB.ink,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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