import { Redirect } from 'expo-router'

/** Default entry under `/app` → main tab. */
export default function AppIndex() {
  return <Redirect href="/app/(tabs)/transactions" />
}
