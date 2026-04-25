import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Ionicons } from '@expo/vector-icons'

import type { TransactionRow } from '@/src/db/queries/transactions'
import { tokens } from '@/src/theme/tokens'

type Props = {
  tx: TransactionRow
  onAllocate: (tx: TransactionRow) => void
  onEdit: (tx: TransactionRow) => void
  onDelete: (tx: TransactionRow) => void
  children: ReactNode
}

export function TransactionSwipeRow({
  tx,
  onAllocate,
  onEdit,
  onDelete,
  children,
}: Props) {
  const renderActions = (_p: unknown, _t: unknown, methods: { close: () => void }) => {
    if (tx.source === 'manual') {
      return (
        <View style={styles.actions}>
          <Pressable onPress={() => { onEdit(tx); methods.close() }}>
            {({ pressed }) => (
              <View
                style={[
                  styles.iconBox,
                  styles.editBox,
                  pressed && styles.iconBoxPressed,
                ]}
                pointerEvents="none"
              >
                <Ionicons name="pencil" size={20} color={tokens.color.fg} />
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => { onDelete(tx); methods.close() }}>
            {({ pressed }) => (
              <View
                style={[
                  styles.iconBox,
                  styles.deleteBox,
                  pressed && styles.iconBoxPressed,
                ]}
                pointerEvents="none"
              >
                <Ionicons name="trash" size={20} color="#fff" />
              </View>
            )}
          </Pressable>
        </View>
      )
    }
    return (
      <View style={styles.actions}>
        <Pressable onPress={() => { onAllocate(tx); methods.close() }}>
          {({ pressed }) => (
            <View
              style={[
                styles.iconBox,
                styles.allocateBox,
                pressed && styles.iconBoxPressed,
              ]}
              pointerEvents="none"
            >
              <Ionicons name="albums-outline" size={22} color={tokens.color.fg} />
            </View>
          )}
        </Pressable>
      </View>
    )
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={renderActions}
    >
      <View style={styles.rowWrap}>
        {children}
      </View>
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  rowWrap: {
    width: '100%',
    backgroundColor: tokens.color.card,
  },
  actions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
    marginBottom: 10,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tokens.color.border,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  editBox: {
    backgroundColor: '#D4D4C4',
  },
  deleteBox: {
    backgroundColor: '#CC2222',
  },
  allocateBox: {
    backgroundColor: '#F5C842',
  },
  iconBoxPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
})
