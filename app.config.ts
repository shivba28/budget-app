import type { ConfigContext, ExpoConfig } from 'expo/config'
import { withEntitlementsPlist, type ConfigPlugin } from '@expo/config-plugins'

/**
 * Config plugin that removes the `aps-environment` entitlement.
 * expo-notifications injects it automatically, but personal Apple ID teams
 * don't support Push Notifications, so the entitlement breaks local builds.
 */
const withNoApsEnvironment: ConfigPlugin = (cfg) =>
  withEntitlementsPlist(cfg, (mod) => {
    delete mod.modResults['aps-environment']
    return mod
  })

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'budget-tracker-rn',
  slug: config.slug ?? 'budget-tracker-rn',
  icon: (config as any).icon ?? './assets/icon.png',
  plugins: [
    ...(config.plugins ?? []),
    'expo-router',
    'expo-dev-client',
    [
      'expo-build-properties',
      {
        ios: {
          // Workaround: prebuilt React Native pods can fail when the project path contains spaces.
          // Building from source avoids the `React-Core-prebuilt` podspec validation error.
          buildReactNativeFromSource: true,
        },
      },
    ],
    '@react-native-community/datetimepicker',
    'expo-background-task',
    'expo-live-activity',
    withNoApsEnvironment,
  ] as any,
  ios: {
    ...(config.ios ?? {}),
    icon: (config.ios as any)?.icon ?? './assets/icon.png',
    bundleIdentifier:
      config.ios?.bundleIdentifier ?? 'com.shewbaka.budgettracker',
    infoPlist: {
      ...(config.ios?.infoPlist as Record<string, unknown> | undefined),
      // Allow 120Hz (ProMotion) on supported iPhones.
      CADisableMinimumFrameDurationOnPhone: true,
      NSSupportsLiveActivities: true,
      NSFaceIDUsageDescription:
        'Unlock Budget Tracker with Face ID, Touch ID, or your device passcode when enabled.',
    },
  },
  android: {
    ...(config.android ?? {}),
    icon: (config.android as any)?.icon ?? './assets/icon.png',
    adaptiveIcon: (config.android as any)?.adaptiveIcon ?? {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#F5C842',
    },
    package: config.android?.package ?? 'com.shewbaka.budgettracker',
  },
  extra: {
    ...(typeof config.extra === 'object' && config.extra !== null ? config.extra : {}),
  },
})
