import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * 安卓 WebView 里 navigator.share 是不存在的（Web Share API 只有 Chrome 浏览器才有），
 * 所以「导入系统日历 / 分享课表图片」以前点了没反应：
 * 先试 navigator.share 失败，再退回 <a download>，而 WebView 没有下载监听器，同样没反应。
 * 这里改成 Capacitor 原生分享：先写进缓存目录，再交给系统分享面板（可选日历/文件/微信…）。
 */
export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform()
  } catch (e) {
    return false
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/**
 * @param {{ fileName: string, base64?: string, text?: string, title?: string, dialogTitle?: string }} opts
 * @returns {Promise<{ ok: boolean, uri?: string, reason?: string }>}
 */
export async function shareFileNative(opts) {
  if (!isNativeApp()) return { ok: false, reason: 'web' }
  // 用纯 ASCII 文件名：安卓 MimeTypeMap 遇到中文名提不出扩展名，MIME 会退化成 */*
  const raw = String(opts.fileName || 'xuedu.bin')
  const ext = (raw.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin'
  const safeName = 'cqjtu_share_' + Date.now() + '.' + ext
  const path = 'xuedu-share/' + safeName
  const data = opts.base64 || utf8ToBase64(String(opts.text || ''))
  try {
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true
    })
    const got = await Filesystem.getUri({ path, directory: Directory.Cache })
    // 只传 files，不要传 text/url：Capacitor 6 一旦收到 text 会把 Intent 的 MIME 改成 text/plain，
    // 系统日历就不会出现在分享候选里了。
    await Share.share({
      title: opts.title || '学渡分享',
      files: [got.uri],
      dialogTitle: opts.dialogTitle || '选择导入或保存位置'
    })
    return { ok: true, uri: got.uri }
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'share-failed' }
  }
}
