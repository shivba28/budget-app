import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'budget-tracker-rn',
  slug: config.slug ?? 'budget-tracker-rn',
  plugins: Array.from(
    new Set([...(config.plugins ?? []), 'expo-router', 'expo-dev-client']),
  ),
  ios: {
    ...(config.ios ?? {}),
    bundleIdentifier:
      config.ios?.bundleIdentifier ?? 'com.shewbaka.budgettracker',
    infoPlist: {
      ...(config.ios?.infoPlist as Record<string, unknown> | undefined),
      NSFaceIDUsageDescription:
        'Unlock Budget Tracker with Face ID, Touch ID, or your device passcode when enabled.',
    },
  },
  android: {
    ...(config.android ?? {}),
    package: config.android?.package ?? 'com.shewbaka.budgettracker',
  },
  extra: {
    ...(typeof config.extra === 'object' && config.extra !== null ? config.extra : {}),
  },
})
