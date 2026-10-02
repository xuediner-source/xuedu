import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidRoot = path.join(projectRoot, 'android')
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
const mode = process.argv[2] || 'sync'
const isWindows = process.platform === 'win32'

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!['sync', 'debug', 'release'].includes(mode)) {
  fail('用法：node scripts/build-android.mjs [sync|debug|release]')
}

const versionName = String(process.env.APP_VERSION || process.env.VITE_APP_VERSION || packageJson.version).trim()
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(versionName)) {
  fail(`无效的 App 版本号：${versionName}`)
}

const versionCode = String(process.env.ANDROID_VERSION_CODE || '251').trim()
if (!/^\d+$/.test(versionCode) || Number(versionCode) < 1 || Number(versionCode) > 2100000000) {
  fail('ANDROID_VERSION_CODE 必须是 1 到 2100000000 之间的整数')
}
const appChannel = String(process.env.APP_CHANNEL || process.env.VITE_APP_CHANNEL || 'test').trim()

const childEnv = {
  ...process.env,
  APP_VERSION: versionName,
  VITE_APP_VERSION: versionName,
  APP_CHANNEL: appChannel,
  VITE_APP_CHANNEL: appChannel,
  ANDROID_VERSION_CODE: versionCode,
}

if (mode === 'debug' || mode === 'release') checkAndroidRequirements()
if (mode === 'release') checkReleaseSigning()

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit',
    shell: isWindows,
    ...options,
  })
  if (result.error) fail(`无法运行 ${command}：${result.error.message}`)
  if (result.status !== 0) process.exit(result.status || 1)
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) {
    run(process.execPath, [npmExecPath, ...args])
  } else {
    run(isWindows ? 'npm.cmd' : 'npm', args)
  }
}

function checkAndroidRequirements() {
  const javaPath = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java')
    : 'java'
  const java = spawnSync(javaPath, ['-version'], { encoding: 'utf8' })
  const javaOutput = `${java.stdout || ''}\n${java.stderr || ''}`
  const javaMajor = javaOutput.match(/version\s+"(?:1\.)?(\d+)/)?.[1]
  if (java.error || javaMajor !== '17') {
    fail('Android APK 构建需要 JDK 17。请配置 JAVA_HOME 或 PATH 后重试。')
  }

  const hasAndroidSdk = Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT)
    || fs.existsSync(path.join(androidRoot, 'local.properties'))
  if (!hasAndroidSdk) {
    fail('未找到 Android SDK。请配置 ANDROID_HOME / ANDROID_SDK_ROOT，或在 android/local.properties 中配置 sdk.dir。')
  }
}

function checkReleaseSigning() {
  const required = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]
  const missing = required.filter((name) => !String(process.env[name] || '').trim())
  if (missing.length) {
    fail(`Release APK 签名需要通过环境变量提供：${missing.join(', ')}`)
  }
  if (!path.isAbsolute(process.env.ANDROID_KEYSTORE_PATH)) {
    fail('ANDROID_KEYSTORE_PATH 必须使用绝对路径')
  }
  try {
    fs.accessSync(process.env.ANDROID_KEYSTORE_PATH, fs.constants.R_OK)
  } catch {
    fail('ANDROID_KEYSTORE_PATH 必须指向可读取的签名文件')
  }
}

console.log(`构建学渡 Web 资源，版本 ${versionName}…`)
runNpm(['run', 'build'])

console.log('同步 Capacitor Android 项目…')
runNpm(['exec', '--no', '--', 'cap', 'sync', 'android'])

if (mode === 'debug' || mode === 'release') {
  const gradle = path.join(androidRoot, isWindows ? 'gradlew.bat' : 'gradlew')
  const task = mode === 'debug' ? 'assembleDebug' : 'assembleRelease'
  const gradleArgs = [task, `-PappVersionName=${versionName}`, `-PappVersionCode=${versionCode}`]
  console.log(mode === 'debug' ? '构建 Android debug APK…' : `构建已签名 Android release APK，版本 ${versionName} (${versionCode})…`)
  run(gradle, gradleArgs, { cwd: androidRoot })
  console.log(mode === 'debug'
    ? 'Debug APK：android/app/build/outputs/apk/debug/app-debug.apk'
    : 'Release APK：android/app/build/outputs/apk/release/app-release.apk')
}
