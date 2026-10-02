import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatAppVersion, isUpdateAvailable } from './apkUpdate.js'

test('test builds show the agreed public test version label', () => {
  assert.equal(formatAppVersion('0.0.1', 'test'), '测试版0.0.1')
  assert.equal(formatAppVersion('2.2.29', 'stable'), 'v2.2.29')
})

test('Android version code takes precedence over reset test version names and stale flags', () => {
  assert.equal(isUpdateAvailable(
    { versionName: '0.0.1', versionCode: 250 },
    { latestVersion: '2.2.28', versionCode: 249, hasUpdate: true, updateAvailable: true }
  ), false)
  assert.equal(isUpdateAvailable(
    { versionName: '0.0.1', versionCode: 250 },
    { latestVersion: '0.0.1', versionCode: 251, hasUpdate: false }
  ), true)
})

test('semantic version comparison remains the fallback when version codes are absent', () => {
  assert.equal(isUpdateAvailable(
    { versionName: '2.2.28', versionCode: 0 },
    { latestVersion: '2.2.29', versionCode: 0 }
  ), true)
  assert.equal(isUpdateAvailable(
    { versionName: '0.0.1', versionCode: 250 },
    { latestVersion: '0.0.1', versionCode: 0, hasUpdate: false }
  ), false)
})
