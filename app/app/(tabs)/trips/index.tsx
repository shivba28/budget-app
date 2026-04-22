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

import {
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'

export default function TripsListScreen() {
  const router = useRouter()
  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const add = useTripsStore((s) => s.add)
  const [name, setName] = useState('')
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

  const onAdd = () => {
    const n = name.trim()
    if (!n) return
    const id = add({ name: n })
    setName('')
    router.push(`/app/(tabs)/trips/${id}`)
  }

  return (
    <BrutalScreen title="Trips" subtitle="Tag spending by getaway">
      <BrutalCard>
        <BrutalTextField
          label="New trip name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Iceland 2026"
        />
        <BrutalButton title="Create trip" onPress={onAdd} />
      </BrutalCard>
      <Text style={styles.section}>YOUR TRIPS</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No trips yet — add one above.</Text>
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
    marginTop: tokens.space[5],
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
