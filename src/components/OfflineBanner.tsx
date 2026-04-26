import NetInfo from '@react-native-community/netinfo'
import { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, Text } from 'react-native'

const INK = '#111111'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

export function OfflineBanner() {
  const isOffline = useRef(false)
  const height = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const show = () => {
      Animated.parallel([
        Animated.timing(height, { toValue: 30, duration: 220, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: false }),
      ]).start()
    }
    const hide = () => {
      Animated.parallel([
        Animated.timing(height, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }),
      ]).start()
    }

    const unsub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false
      if (offline === isOffline.current) return
      isOffline.current = offline
      if (offline) show()
      else hide()
    })

    // Check immediately on mount
    void NetInfo.fetch().then((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false
      isOffline.current = offline
      if (offline) show()
    })

    return unsub
  }, [height, opacity])

  return (
    <Animated.View style={[styles.banner, { height, opacity }]}>
      <Text style={styles.text} numberOfLines={1}>
        ◆ OFFLINE — Changes save locally
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: INK,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '800',
    color: '#F5C842',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})
