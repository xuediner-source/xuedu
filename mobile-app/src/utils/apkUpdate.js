import { Capacitor, registerPlugin } from '@capacitor/core'

const ApkUpdater = registerPlugin('ApkUpdater')

export const APP_CHANNEL = typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'test'

export function formatAppVersion(versionName, channel = APP_CHANNEL) {
  const version = String(versionName || '0.0.1')
  return channel === 'test' ? `测试版${version}` : `v${version}`
}

export function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}

export function formatBytes(n) {
  const num = Number(n) || 0
  if (num < 1024) return num + ' B'
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB'
  return (num / (1024 * 1024)).toFixed(1) + ' MB'
}

export function compareVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

export function isUpdateAvailable(currentVersion, latestInfo) {
  const currentCode = Number(currentVersion?.versionCode)
  const latestCode = Number(latestInfo?.versionCode)
  if (Number.isSafeInteger(currentCode) && currentCode > 0
      && Number.isSafeInteger(latestCode) && latestCode > 0) {
    return latestCode > currentCode
  }

  return compareVersion(currentVersion?.versionName, latestInfo?.latestVersion) < 0
    || !!latestInfo?.hasUpdate
    || !!latestInfo?.updateAvailable
}

export async function getNativeAppInfo() {
  if (!isNativeAndroid()) return null
  try {
    return await ApkUpdater.getInfo()
  } catch {
    return null
  }
}

export function listenAppResume(callback) {
  if (!isNativeAndroid() || typeof callback !== 'function') {
    return () => {}
  }
  let handle = null
  ApkUpdater.addListener('appResume', callback).then((h) => { handle = h }).catch(() => {})
  return () => {
    try { handle && handle.remove && handle.remove() } catch {}
  }
}

export async function downloadAndInstallApk(url, onProgress) {
  if (!url) throw new Error('暂无安装包')
  if (isNativeAndroid()) {
    return nativeDownload(url, onProgress)
  }
  return webDownload(url, onProgress)
}

async function nativeDownload(url, onProgress) {
  const handles = []
  try {
    await new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn) => (payload) => {
        if (settled) return
        settled = true
        fn(payload)
      }
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('下载超时，请检查网络后重试'))
        }
      }, 180000)

      Promise.all([
        ApkUpdater.addListener('progress', (e) => {
          onProgress && onProgress({
            status: 'downloading',
            percent: Number(e.percent) || 0,
            received: Number(e.received) || 0,
            total: Number(e.total) || 0
          })
        }),
        ApkUpdater.addListener('needPermission', (e) => {
          onProgress && onProgress({
            status: 'needPermission',
            percent: 100,
            message: (e && e.message) || '请允许安装未知应用，返回后将自动继续'
          })
        }),
        ApkUpdater.addListener('installing', () => {
          onProgress && onProgress({ status: 'installing', percent: 100 })
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve()
          }
        }),
        ApkUpdater.addListener('complete', finish((payload) => {
          clearTimeout(timer)
          resolve(payload)
        })),
        ApkUpdater.addListener('error', finish((e) => {
          clearTimeout(timer)
          reject(new Error((e && e.message) || '更新失败'))
        }))
      ]).then((list) => {
        handles.push.apply(handles, list)
        return ApkUpdater.startDownload({ url })
      }).catch((err) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(err)
        }
      })
    })
  } finally {
    await Promise.all(handles.map((h) => {
      try { return h.remove() } catch { return null }
    }))
  }
}

function webDownload(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'blob'
    const timer = setTimeout(() => {
      xhr.abort()
      reject(new Error('下载超时，请检查网络后重试'))
    }, 180000)
    xhr.onprogress = (e) => {
      onProgress && onProgress({
        status: 'downloading',
        percent: e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0,
        received: e.loaded || 0,
        total: e.total || 0
      })
    }
    xhr.onload = () => {
      clearTimeout(timer)
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('下载失败（HTTP ' + xhr.status + '）'))
        return
      }
      const blob = xhr.response
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = '交大课表.apk'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
      onProgress && onProgress({ status: 'installing', percent: 100 })
      resolve()
    }
    xhr.onerror = () => {
      clearTimeout(timer)
      reject(new Error('网络错误，下载失败'))
    }
    xhr.send()
  })
}
