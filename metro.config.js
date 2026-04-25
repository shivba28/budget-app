const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Allow bundling Teller mTLS cert assets (PEM kept for reference; p12 is what's used at runtime).
config.resolver.assetExts = [...config.resolver.assetExts, 'pem', 'p12']

module.exports = withNativeWind(config, { input: './global.css' })
