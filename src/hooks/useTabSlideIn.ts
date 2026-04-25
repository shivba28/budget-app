import { useCallback } from 'react'
import { Dimensions } from 'react-native'
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { useFocusEffect } from 'expo-router'

import { useSwipeNavStore } from '@/src/stores/swipeNavStore'

const SCREEN_WIDTH = Dimensions.get('window').width

const SPRING = { damping: 28, stiffness: 220, mass: 0.8 }

/**
 * Returns an animated style that slides the screen in from the direction set
 * by `swipeNavStore` whenever the screen gains focus via a swipe gesture.
 * Tap navigation is unaffected (enterDirection is null → no animation).
 */
export function useTabSlideIn() {
  const translateX = useSharedValue(0)

  useFocusEffect(
    useCallback(() => {
      const dir = useSwipeNavStore.getState().enterDirection
      if (dir === 'from-right') {
        translateX.value = SCREEN_WIDTH
        translateX.value = withSpring(0, SPRING)
        useSwipeNavStore.getState().setEnterDirection(null)
      } else if (dir === 'from-left') {
        translateX.value = -SCREEN_WIDTH
        translateX.value = withSpring(0, SPRING)
        useSwipeNavStore.getState().setEnterDirection(null)
      }
    }, [translateX]),
  )

  return useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))
}
