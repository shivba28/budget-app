/**
 * Expo config plugin: enable SQLCipher AES-256 encryption in @op-engineering/op-sqlite.
 *
 * iOS  — Prepends `ENV['OP_SQLITE_USE_SQLCIPHER'] = '1'` to the generated Podfile so that
 *         the op-sqlite podspec picks up the flag and links against SQLCipher + OpenSSL.
 *
 * Android — The build flag is read from the OS environment variable OP_SQLITE_USE_SQLCIPHER.
 *            Set it in your EAS build profiles (see eas.json) or, for local builds, run:
 *              OP_SQLITE_USE_SQLCIPHER=1 npx expo run:android
 */

const { withDangerousMod } = require('@expo/config-plugins')
const path = require('path')
const fs = require('fs')

/**
 * Injects the SQLCipher env var into the iOS Podfile so it is set before `pod install` runs.
 */
const withSqlCipherIos = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')

      if (!fs.existsSync(podfilePath)) {
        // prebuild hasn't generated the Podfile yet — skip silently
        return config
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8')

      if (!podfile.includes('OP_SQLITE_USE_SQLCIPHER')) {
        // Prepend the env var before anything else in the Podfile
        podfile = "ENV['OP_SQLITE_USE_SQLCIPHER'] = '1' # injected by plugins/withSqlCipher.js\n" + podfile
        fs.writeFileSync(podfilePath, podfile)
        console.log('[withSqlCipher] ✅ Injected OP_SQLITE_USE_SQLCIPHER=1 into Podfile')
      }

      return config
    },
  ])
}

const withSqlCipher = (config) => {
  config = withSqlCipherIos(config)
  // Android: env var must be set externally (see eas.json or local build instructions above)
  return config
}

module.exports = withSqlCipher
