<template>
  <div id="app-root">
    <router-view v-if="!isTabPage" v-slot="{ Component }">
      <transition name="app-page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <div v-else class="app-layout">
      <main class="app-content">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>

      <nav class="floating-dock-wrap" aria-label="主要导航">
        <div class="floating-dock">
          <router-link
            v-for="tab in tabs"
            :key="tab.path"
            :to="tab.path"
            class="dock-item"
            :class="{ active: currentRoute === tab.path }"
          >
            <div class="dock-pill">
              <Icon :name="tab.icon" :size="20" />
            </div>
            <span class="dock-label">{{ tab.label }}</span>
          </router-link>
        </div>
      </nav>
    </div>

    <WidgetExpandHost />

    <div v-if="shouldShowOverlay" class="force-update-mask" @click.self="enterApp">
      <div class="force-update-card">
        <h2>{{ overlayTitle }}</h2>
        <p class="force-ver">当前 {{ currentVersionLabel }}（{{ currentVersionInfo.versionCode || '未知代码' }}） · 最新 {{ latestVersionLabel }}（{{ releaseCode(forceGate || update.latestInfo) || '未知代码' }}）</p>
        <p class="force-notes" v-if="forceGate?.releaseNotes && !update.visible">{{ forceGate.releaseNotes }}</p>
        <div v-if="update.visible" class="update-progress-block">
          <div class="update-progress-track">
            <div class="update-progress-fill" :style="{ width: Math.max(update.percent, 2) + '%' }"></div>
          </div>
          <p class="update-progress-text">{{ update.statusText }}</p>
        </div>
        <button
          class="force-primary"
          :disabled="update.busy && update.status === 'downloading'"
          @click="downloadUpdate"
        >{{ updateButtonText }}</button>
        <button class="force-exit" @click="enterApp">关闭，进入应用</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showToast } from '@/utils/appToast'
import { App as CapacitorApp } from '@capacitor/app'
import Icon from '@/components/Icon.vue'
import { useInAppUpdate } from '@/composables/useInAppUpdate'
import { formatAppVersion, getNativeAppInfo, isUpdateAvailable, listenAppResume } from '@/utils/apkUpdate'
import WidgetExpandHost from '@/components/WidgetExpandHost.vue'
import { widgetExpand, closeWidget } from '@/composables/useWidgetExpand'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1'
const route = useRoute()
const router = useRouter()
const store = useAppStore()
const update = useInAppUpdate()
const currentRoute = computed(() => route.path)
const forceGate = ref(null)
const dismissedUpdateCode = ref(readDismissedUpdateCode())
const currentVersionInfo = ref({ versionName: APP_VERSION, versionCode: 0 })
const currentVersionLabel = computed(() => formatAppVersion(currentVersionInfo.value.versionName))
const latestVersionLabel = computed(() => formatAppVersion(
  (forceGate.value || update.latestInfo)?.latestVersion || currentVersionInfo.value.versionName
))
let stopResumeListen = null

function isUpdateBusy() {
  return update.busy || update.status === 'downloading' || update.status === 'needPermission' || update.status === 'installing'
}

function readDismissedUpdateCode() {
  try { return Number(sessionStorage.getItem('xueduDismissedUpdateCode')) || 0 } catch { return 0 }
}

function releaseCode(info) {
  return Number(info?.versionCode) || 0
}

const shouldShowOverlay = computed(() => {
  const info = forceGate.value || update.latestInfo
  if (info?.forceUpdate === true && isUpdateAvailable(currentVersionInfo.value, info)) return true
  const code = releaseCode(info)
  if (code > 0 && dismissedUpdateCode.value === code) return false
  if (update.visible && (update.status === 'downloading' || update.status === 'needPermission' || update.status === 'installing' || update.status === 'error')) return true
  return !!(forceGate.value && isUpdateAvailable(currentVersionInfo.value, forceGate.value))
})

const overlayTitle = computed(() => {
  if (update.status === 'installing') return '请完成安装'
  if (update.visible) return '正在更新'
  return '发现新版本'
})

const updateButtonText = computed(() => {
  if (update.busy && update.status === 'downloading') return '正在下载…'
  if (update.status === 'error') return '重新下载'
  if (update.status === 'installing' || update.status === 'needPermission') return '重新打开安装'
  return '立即更新'
})

const tabs = [
  { path: '/home', label: '首页', icon: 'home' },
  { path: '/schedule', label: '课表', icon: 'schedule' },
  { path: '/grades', label: '成绩', icon: 'grades' },
  { path: '/exam', label: '考试', icon: 'exam' },
  { path: '/profile', label: '我的', icon: 'profile' },
]

const isTabPage = computed(() => {
  return tabs.some(t => t.path === route.path)
})

async function resolveInstalledVersion() {
  const native = await getNativeAppInfo()
  currentVersionInfo.value = {
    versionName: native?.versionName ? String(native.versionName) : APP_VERSION,
    versionCode: Number(native?.versionCode) || 0
  }
  return currentVersionInfo.value
}

async function refreshUpdateGate() {
  if (isUpdateBusy()) return
  const current = await resolveInstalledVersion()
  const info = await store.checkUpdate(current.versionName, current.versionCode)
  if (!info || !info.success || !isUpdateAvailable(current, info)) {
    forceGate.value = null
    return
  }
  const code = releaseCode(info)
  if (info.forceUpdate !== true && code > 0 && dismissedUpdateCode.value === code) {
    forceGate.value = null
    return
  }
  forceGate.value = info
}

async function downloadUpdate() {
  if (isUpdateBusy()) return
  let info = forceGate.value || update.latestInfo
  if (!info || !info.fullDownloadUrl) {
    const current = await resolveInstalledVersion()
    const latest = await store.checkUpdate(current.versionName, current.versionCode)
    if (!latest || !latest.fullDownloadUrl || !isUpdateAvailable(current, latest)) {
      showToast('暂无可用更新')
      enterApp()
      return
    }
    info = latest
    forceGate.value = latest
  }
  try {
    await update.startUpdate(info)
  } catch (e) {
    showToast((e && e.message) || '暂无安装包')
  }
}

function enterApp() {
  const info = forceGate.value || update.latestInfo
  if (info?.forceUpdate === true) return
  const code = releaseCode(info)
  if (code > 0) {
    dismissedUpdateCode.value = code
    try { sessionStorage.setItem('xueduDismissedUpdateCode', String(code)) } catch {}
  }
  forceGate.value = null
  if (update.status === 'error') update.reset()
}

// ---------------------------------------------------------------------------
// 安卓返回键：默认行为是直接 finish 掉 Activity（看起来像“退回手机桌面”）。
// 这里接管：先关展开的卡片页 → 再走路由回退 → 只有真正在底部 tab 根页时才退出。
// ---------------------------------------------------------------------------
let backListener = null
let lastBackAt = 0
let clockTimer = null

function isRootPage(path) {
  return path === '/login' || tabs.some(t => t.path === path)
}

function isLayerOpen(el) {
  if (!el) return false
  // display:none 的父层里，子元素 computed display 仍可能是 block，用矩形更准
  return el.getClientRects().length > 0
}

// 返回键优先关掉屏幕上还开着的 Vant 浮层，否则用户按返回会直接退出 App。
// 注意：只有“确实关掉了”才返回 true，否则会把返回键吞掉却不关东西。
function visibleLayers(sel) {
  return [...document.querySelectorAll(sel)].filter(isLayerOpen)
}

function closeTopVantLayer() {
  // app-toast 只是提示，不能吞掉返回键，否则「再按一次退出」永远走不到 exitApp
  // Vant 关掉后仍把实例留在 DOM 里（display:none），必须只挑当前可见的那一层
  const dialog = visibleLayers('.van-dialog').pop()
  if (dialog) {
    const btn = dialog.querySelector('.van-dialog__cancel') ||
      dialog.querySelector('.van-dialog__footer button')
    if (btn) {
      btn.click()
      return true
    }
    return false
  }
  const sheet = visibleLayers('.van-action-sheet').pop()
  if (sheet) {
    const closeBtn = sheet.querySelector('.menu-close-btn, .van-action-sheet__cancel, .van-popup__close-icon, .van-action-sheet__close')
    if (closeBtn) {
      closeBtn.click()
      return true
    }
    const overlay = visibleLayers('.van-overlay').pop()
    if (overlay) {
      overlay.click()
      return true
    }
    return false
  }
  return false
}

let backHandling = false

async function handleNativeBack() {
  // 某些 ROM 会在同一帧连发两次返回。去抖只挡误触，不能挡住「再按一次退出」。
  if (backHandling) {
    if (isRootPage(route.path) && lastBackAt && Date.now() - lastBackAt < 2000) {
      try { await CapacitorApp.exitApp() } catch (e) {}
    }
    return
  }
  backHandling = true
  window.setTimeout(() => { backHandling = false }, 400)

  if (widgetExpand.page && !widgetExpand.closing) {
    closeWidget()
    return
  }
  if (closeTopVantLayer()) return
  if (!isRootPage(route.path)) {
    if (window.history.length > 1) router.back()
    else router.replace('/home')
    return
  }
  if (Date.now() - lastBackAt < 2000) {
    try {
      await CapacitorApp.exitApp()
    } catch (e) {}
    return
  }
  lastBackAt = Date.now()
  showToast('再按一次返回退出软件')
}

function bindBackButton() {
  try {
    CapacitorApp.addListener('backButton', handleNativeBack).then((handle) => {
      backListener = handle
    }).catch(() => {})
  } catch (e) {}
}

onMounted(async () => {
  bindBackButton()
  store.updateClock()
  clockTimer = window.setInterval(store.updateClock, 30000)
  window.addEventListener('online', onNetworkChange)
  window.addEventListener('offline', onNetworkChange)
  stopResumeListen = listenAppResume(() => {
    store.updateClock()
    refreshScheduleInBackground()
    if (!isUpdateBusy()) refreshUpdateGate()
  })
  document.addEventListener('visibilitychange', onVisible)
  if (store.isLoggedIn) {
    const alive = await store.restoreSession()
    if (alive) refreshScheduleInBackground()
  }
  await refreshUpdateGate()
})

function onVisible() {
  if (document.visibilityState === 'visible') {
    store.updateClock()
    refreshScheduleInBackground()
    if (!isUpdateBusy()) refreshUpdateGate()
  }
}

function refreshScheduleInBackground() {
  if (store.isLoggedIn && !store.isOffline && !store.sessionExpired && (!store.scheduleSyncedAt || Date.now() - store.scheduleSyncedAt > 60000)) {
    void store.fetchSchedule()
  }
}

function onNetworkChange() {
  store.setOffline(navigator.onLine === false)
  if (!store.isOffline) refreshScheduleInBackground()
}

onUnmounted(() => {
  window.clearInterval(clockTimer)
  window.removeEventListener('online', onNetworkChange)
  window.removeEventListener('offline', onNetworkChange)
  if (backListener) {
    try { backListener.remove() } catch {}
    backListener = null
  }
  document.removeEventListener('visibilitychange', onVisible)
  if (stopResumeListen) stopResumeListen()
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
  position: relative;
}

.app-content {
  flex: 1;
  /* 底栏改为贴底仪器条后，预留交给各 Tab 页的 --dock-clearance，这里不再垫悬浮胶囊空隙 */
  padding-bottom: 0;
  /* 路由 out-in 切换时旧页已卸载、新页未挂载，这里给底色避免闪一下白 */
  background: var(--bg-app);
}

/* Apple HIG Inset Capsule Dock：悬浮药丸胶囊，不透明近白底 + 轻微边框投影，内容从两侧与底部安全露出，无融化遮罩 */
.floating-dock-wrap {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  pointer-events: none;
  padding: 0 16px calc(var(--safe-bottom) + 12px);
  display: flex;
  justify-content: center;
}

.floating-dock {
  pointer-events: auto;
  width: 100%;
  max-width: 440px;
  height: 64px;
  background: var(--surface-card-solid);
  border-radius: 36px;
  box-shadow: var(--shadow-dock);
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
}

.dock-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: #1e293b;
  cursor: pointer;
  padding: 4px 0;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.dock-pill {
  width: 48px;
  height: 28px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1e293b;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.dock-label {
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  margin-top: 2px;
  letter-spacing: -0.2px;
  transition: all 0.2s ease;
}

.dock-item.active .dock-pill {
  background: var(--primary-bubble);
  color: var(--primary-deep);
  transform: translateY(-1px);
}

.dock-item.active .dock-label {
  font-weight: 700;
  color: var(--primary-deep);
}

.dock-item:active {
  transform: scale(0.92);
}

@media (min-width: 760px) {
  .floating-dock {
    max-width: 520px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-item, .dock-pill {
    transition: none !important;
  }
}

.force-update-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(22, 21, 19, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.force-update-card {
  width: 100%;
  max-width: 360px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card-lg);
  padding: 28px 22px 20px;
  text-align: center;
  box-shadow: var(--shadow-card);
}

.force-update-card h2 {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.force-ver {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

.force-notes {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-line;
  text-align: left;
  line-height: 1.5;
}

.force-primary,
.force-exit {
  width: 100%;
  border: none;
  border-radius: var(--radius-card);
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 12px;
}

.force-primary {
  background: var(--accent);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.25);
}

.force-exit {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.force-primary:disabled {
  opacity: 0.72;
  cursor: default;
}

.update-progress-block {
  margin-top: 16px;
  text-align: left;
}

.update-progress-track {
  height: 8px;
  border-radius: 4px;
  background: var(--border);
  overflow: hidden;
}

.update-progress-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--accent);
  transition: width 0.18s ease;
}

.update-progress-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  font-weight: 600;
}
</style>
