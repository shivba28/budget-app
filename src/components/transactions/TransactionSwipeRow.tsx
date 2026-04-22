import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'

import type { TransactionRow } from '@/src/db/queries/transactions'
import { tokens } from '@/src/theme/tokens'

type Props = {
  tx: TransactionRow
  onPress: () => void
  onAllocate: (tx: TransactionRow) => void
  children: ReactNode
}

export function TransactionSwipeRow({
  tx,
  onPress,
  onAllocate,
  children,
}: Props) {
  return (
    <ReanimatedSwipeable
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={(_p, _t, methods) => (
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              onAllocate(tx)
              methods.close()
            }}
            style={({ pressed }) => [
              styles.allocateBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.allocateLabel}>Allocate</Text>
          </Pressable>
        </View>
      )}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowWrap, pressed && { opacity: 0.9 }]}
      >
        {children}
      </Pressable>
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  rowWrap: {
    width: '100%',
    backgroundColor: tokens.color.card,
  },
  actions: {
    justifyContent: 'center',
    alignItems: 'stretch',
    width: 104,
  },
  allocateBtn: {
    flex: 1,
    backgroundColor: tokens.color.accent,
    borderLeftWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 0,
  },
  allocateLabel: {
    fontWeight: '900',
    fontSize: 12,
    color: tokens.color.fg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
