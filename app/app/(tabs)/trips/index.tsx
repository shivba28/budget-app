import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import { BrutalScreen } from '@/src/components/Brutalist'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'

export default function TripsListScreen() {
  const router = useRouter()
  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
    setRefreshing(false)
  }, [load])

  return (
    <BrutalScreen title="Trips" subtitle="Tag spending by getaway · use + below to add a trip">
      <Text style={styles.section}>YOUR TRIPS</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No trips yet — tap the + button in the tab bar to create one.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/app/(tabs)/trips/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.rowTitle}>{item.name}</Text>
            {item.budget_limit != null ? (
              <Text style={styles.rowMeta}>Cap {item.budget_limit}</Text>
            ) : null}
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: tokens.space[2],
    marginBottom: tokens.space[3],
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
  },
  list: { paddingBottom: tokens.space[6], gap: tokens.space[2] },
  empty: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    opacity: 0.7,
    paddingVertical: tokens.space[4],
  },
  row: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.card,
    padding: tokens.space[4],
  },
  rowTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: tokens.color.fg,
  },
  rowMeta: {
    marginTop: tokens.space[2],
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.fg,
    opacity: 0.65,
  },
})
