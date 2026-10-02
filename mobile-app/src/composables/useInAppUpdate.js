import { reactive, computed } from 'vue'
import { downloadAndInstallApk, formatBytes } from '@/utils/apkUpdate'

const state = reactive({
  visible: false,
  busy: false,
  percent: 0,
  received: 0,
  total: 0,
  status: 'idle',
  errorMsg: '',
  latestInfo: null
})

const statusText = computed(() => {
  if (state.status === 'needPermission') return '请允许安装未知应用，返回后将自动继续'
  if (state.status === 'installing') return '下载完成，请在系统安装界面完成安装。装好后返回即可继续使用。'
  if (state.status === 'error') return state.errorMsg || '更新失败'
  if (state.status === 'downloading') {
    const size = state.total > 0
      ? (formatBytes(state.received) + ' / ' + formatBytes(state.total))
      : formatBytes(state.received)
    return '正在下载安装包 ' + state.percent + '%（' + size + '）'
  }
  return '准备下载新版本'
})

function reset() {
  state.visible = false
  state.busy = false
  state.percent = 0
  state.received = 0
  state.total = 0
  state.status = 'idle'
  state.errorMsg = ''
  state.latestInfo = null
}

async function startUpdate(info) {
  if (!info || !info.fullDownloadUrl) {
    throw new Error('暂无安装包')
  }
  if (state.busy) return
  state.latestInfo = info
  state.visible = true
  state.busy = true
  state.percent = 0
  state.received = 0
  state.total = 0
  state.status = 'downloading'
  state.errorMsg = ''
  try {
    await downloadAndInstallApk(info.fullDownloadUrl, (p) => {
      if (p.status) state.status = p.status
      if (p.percent != null) state.percent = p.percent
      if (p.received != null) state.received = p.received
      if (p.total != null) state.total = p.total
      if (p.message) state.errorMsg = p.message
      if (p.status === 'needPermission' || p.status === 'installing') {
        state.busy = false
      }
    })
    state.status = 'installing'
  } catch (e) {
    state.status = 'error'
    state.errorMsg = (e && e.message) ? e.message : '更新失败'
  } finally {
    state.busy = false
  }
}

function retry() {
  if (state.latestInfo) return startUpdate(state.latestInfo)
}

function closeOverlay() {
  reset()
}

export function useInAppUpdate() {
  return {
    state,
    get visible() { return state.visible },
    set visible(v) { state.visible = v },
    get busy() { return state.busy },
    set busy(v) { state.busy = v },
    get percent() { return state.percent },
    get received() { return state.received },
    get total() { return state.total },
    get status() { return state.status },
    get errorMsg() { return state.errorMsg },
    get latestInfo() { return state.latestInfo },
    statusText,
    startUpdate,
    retry,
    closeOverlay,
    reset,
    formatBytes
  }
}
