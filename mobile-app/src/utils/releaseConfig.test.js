import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('package and lockfile share the app version', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package-lock.json'), 'utf8'))
  assert.equal(lockfile.version, packageJson.version)
  assert.equal(lockfile.packages[''].version, packageJson.version)
})

test('Capacitor source and Android asset configs keep safe, matching release settings', () => {
  const sourceConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'capacitor.config.json'), 'utf8'))
  assert.equal(sourceConfig.server.cleartext, false)
  assert.equal(sourceConfig.server.androidScheme, 'https')
  assert.equal(sourceConfig.android.allowMixedContent, false)
  const androidConfigPath = path.join(mobileRoot, 'android/app/src/main/assets/capacitor.config.json')
  if (!fs.existsSync(androidConfigPath)) {
    assert.notEqual(process.env.REQUIRE_ANDROID_ASSETS, '1', 'Android config must exist after Capacitor sync')
    return
  }
  const androidConfig = JSON.parse(fs.readFileSync(androidConfigPath, 'utf8'))
  assert.equal(androidConfig.server.cleartext, false)
  assert.equal(androidConfig.android.allowMixedContent, false)
  assert.equal(androidConfig.server.androidScheme, sourceConfig.server.androidScheme)
  assert.equal(androidConfig.android.backgroundColor, sourceConfig.android.backgroundColor)
  assert.equal(androidConfig.plugins.SplashScreen.backgroundColor, sourceConfig.plugins.SplashScreen.backgroundColor)
})

test('Android manifest and network policy reject cleartext and exclude credential caches from backup', () => {
  const manifest = fs.readFileSync(path.join(mobileRoot, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  const networkPolicy = fs.readFileSync(path.join(mobileRoot, 'android/app/src/main/res/xml/network_security_config.xml'), 'utf8')
  assert.match(manifest, /android:usesCleartextTraffic="false"/)
  assert.match(manifest, /android:allowBackup="false"/)
  assert.match(networkPolicy, /<base-config cleartextTrafficPermitted="false">/)
  assert.doesNotMatch(networkPolicy, /cleartextTrafficPermitted="true"/)
})
