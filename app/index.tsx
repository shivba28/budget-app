import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useAuthGateHref } from '@/src/auth/useAuthGateHref'
import { tokens } from '@/src/theme/tokens'

export default function Index() {
  const href = useAuthGateHref()
  if (!href) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={tokens.color.fg} size="large" />
      </View>
    )
  }
  return <Redirect href={href} />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.bg,
  },
})
