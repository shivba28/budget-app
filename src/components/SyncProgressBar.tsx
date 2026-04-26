/**
 * Thin animated progress bar that appears at the very top of the screen
 * while a silent background sync is running. Disappears automatically when
 * done. Non-blocking — the user sees cached data the whole time.
 */

import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

import { useSyncStore } from '../stores/syncStore'

const BAR_HEIGHT = 3
const YELLOW = '#F5C842'

export function SyncProgressBar() {
  const status = useSyncStore((s) => s.status)
  const progress = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (status === 'syncing') {
      // Reset and fade in
      progress.setValue(0)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: false }),
        // Animate to 85% — leaves room for the "done" snap to 100%
        Animated.timing(progress, {
          toValue: 0.85,
          duration: 8000,
          useNativeDriver: false,
        }),
      ]).start()
    } else if (status === 'done' || status === 'error') {
      // Snap to full width, then fade out
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.delay(300),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start(() => progress.setValue(0))
    }
  }, [status])

  const widthStyle = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={styles.track} pointerEvents="none">
      <Animated.View style={[styles.fill, { width: widthStyle as any, opacity }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    zIndex: 9999,
    overflow: 'hidden',
  },
  fill: {
    height: BAR_HEIGHT,
    backgroundColor: YELLOW,
    shadowColor: YELLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
})
