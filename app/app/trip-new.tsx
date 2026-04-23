import { useState } from 'react'
import { useRouter } from 'expo-router'

import {
  BrutalBackRow,
  BrutalButton,
  BrutalCard,
  BrutalScreen,
  BrutalTextField,
} from '@/src/components/Brutalist'
import { useTripsStore } from '@/src/stores/tripsStore'

export default function TripNewScreen() {
  const router = useRouter()
  const add = useTripsStore((s) => s.add)
  const [name, setName] = useState('')

  const onCreate = () => {
    const n = name.trim()
    if (!n) return
    const id = add({ name: n })
    router.replace(`/app/(tabs)/trips/${id}`)
  }

  return (
    <BrutalScreen title="New trip" subtitle="Name your getaway">
      <BrutalBackRow onBack={() => router.back()} />
      <BrutalCard>
        <BrutalTextField
          label="New trip name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Iceland 2026"
        />
        <BrutalButton title="Create trip" onPress={onCreate} />
      </BrutalCard>
    </BrutalScreen>
  )
}
