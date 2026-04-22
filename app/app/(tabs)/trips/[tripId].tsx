import { useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'

export default function TripDetailScreen() {
  const router = useRouter()
  const { tripId } = useLocalSearchParams<{ tripId?: string }>()
  const id = tripId ? Number(tripId) : NaN
  const items = useTripsStore((s) => s.items)
  const load = useTripsStore((s) => s.load)
  const update = useTripsStore((s) => s.update)
  const remove = useTripsStore((s) => s.remove)

  const trip = useMemo(
    () => items.find((t) => t.id === id),
    [items, id],
  )

  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!trip) return
    setName(trip.name)
    setBudget(
      trip.budget_limit != null ? String(trip.budget_limit) : '',
    )
    setStart(trip.start_date ?? '')
    setEnd(trip.end_date ?? '')
  }, [trip])

  if (!Number.isFinite(id)) {
    return (
      <BrutalScreen title="Trip" subtitle="Invalid link">
        <BrutalBackRow onBack={() => router.back()} />
        <Text style={styles.err}>Missing trip id.</Text>
      </BrutalScreen>
    )
  }

  if (!trip) {
    return (
      <BrutalScreen title="Trip" subtitle="Not found">
        <BrutalBackRow onBack={() => router.back()} />
        <Text style={styles.err}>This trip may have been deleted.</Text>
      </BrutalScreen>
    )
  }

  const onSave = () => {
    const lim = budget.trim() === '' ? null : Number(budget)
    update(id, {
      name: name.trim() || trip.name,
      start_date: start.trim() || null,
      end_date: end.trim() || null,
      budget_limit: lim !== null && !Number.isNaN(lim) ? lim : null,
    })
  }

  const onDelete = () => {
    Alert.alert(
      'Delete trip',
      'Transactions linked to this trip will be unlinked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            remove(id)
            router.back()
          },
        },
      ],
    )
  }

  return (
    <BrutalScreen title={trip.name} subtitle="Edit trip">
      <BrutalBackRow onBack={() => router.back()} />
      <BrutalCard>
        <BrutalTextField label="Name" value={name} onChangeText={setName} />
        <BrutalTextField
          label="Budget cap (optional)"
          value={budget}
          onChangeText={setBudget}
          keyboardType="decimal-pad"
        />
        <BrutalTextField
          label="Start date (YYYY-MM-DD)"
          value={start}
          onChangeText={setStart}
          placeholder="2026-06-01"
        />
        <BrutalTextField
          label="End date (YYYY-MM-DD)"
          value={end}
          onChangeText={setEnd}
        />
        <View style={styles.actions}>
          <BrutalButton title="Save" onPress={onSave} />
          <BrutalButton title="Delete trip" variant="neutral" onPress={onDelete} />
        </View>
      </BrutalCard>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  err: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
  },
  actions: {
    gap: tokens.space[3],
    marginTop: tokens.space[2],
  },
})
