import { reactive } from 'vue'

const widgetExpand = reactive({
  page: null,
  focus: '',
  origin: null,
  ghostHtml: '',
  pending: false,
  open: false,
  settled: false,
  closing: false,
  ignorePop: false,
  duration: 260
})

let popBound = false
let sourceEl = null
let closeTimer = 0
let settleTimer = 0

const pageLoaders = {
  'calendar-weather': () => import('@/views/CalendarWeather.vue'),
  schedule: () => import('@/views/Schedule.vue'),
  program: () => import('@/views/Program.vue'),
  classrooms: () => import('@/views/Classrooms.vue'),
  grades: () => import('@/views/Grades.vue'),
  assistant: () => import('@/views/Assistant.vue')
}

function parseRadius(value) {
  const n = parseFloat(String(value || '20').split(' ')[0])
  return Number.isFinite(n) ? n : 20
}

function rectFromEl(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return null
  const cs = getComputedStyle(el)
  const vw = window.innerWidth || 1
  const vh = window.innerHeight || 1
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    radius: cs.borderRadius || '20px',
    radiusPx: parseRadius(cs.borderRadius),
    vw,
    vh
  }
}

function captureGhost(el) {
  if (!el || typeof el.cloneNode !== 'function') return ''
  const clone = el.cloneNode(true)
  clone.classList.remove('widget-card')
  clone.removeAttribute('id')
  clone.style.cssText = 'transform:none;animation:none;margin:0;width:100%;height:100%;box-sizing:border-box;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;filter:none'
  clone.setAttribute('aria-hidden', 'true')
  return clone.outerHTML
}

function hideSource(el) {
  showSource()
  sourceEl = el || null
  if (sourceEl) sourceEl.classList.add('widget-source-hidden')
}

function showSource() {
  if (sourceEl) sourceEl.classList.remove('widget-source-hidden')
  sourceEl = null
}

function bindPopstate() {
  if (popBound || typeof window === 'undefined') return
  popBound = true
  window.addEventListener('popstate', () => {
    if (widgetExpand.ignorePop) {
      widgetExpand.ignorePop = false
      return
    }
    if (widgetExpand.page && !widgetExpand.closing) {
      startCloseAnimation()
    }
  })
}

function clearTimers() {
  if (closeTimer) {
    window.clearTimeout(closeTimer)
    closeTimer = 0
  }
  if (settleTimer) {
    window.clearTimeout(settleTimer)
    settleTimer = 0
  }
}

function resetState() {
  showSource()
  widgetExpand.page = null
  widgetExpand.focus = ''
  widgetExpand.origin = null
  widgetExpand.ghostHtml = ''
  widgetExpand.pending = false
  widgetExpand.open = false
  widgetExpand.settled = false
  widgetExpand.closing = false
}

function startCloseAnimation() {
  if (!widgetExpand.page || widgetExpand.closing) return false
  clearTimers()
  widgetExpand.settled = false
  widgetExpand.closing = true
  // 让 frameStyle/overlayStyle 回到“卡片姿态”：
  // 如果浮层已经定格过（pending 已被清），关闭动画一旦被打断就会留一块铺满整屏的近白框。
  // 置回 true 后，即使动画被取消，看到的也是缩在卡片位置的框 + 残影。
  widgetExpand.pending = true
  widgetExpand.open = false

  closeTimer = window.setTimeout(() => {
    resetState()
  }, widgetExpand.duration + 64)
  return true
}

export function markWidgetSettled() {
  if (widgetExpand.page && !widgetExpand.closing) {
    // pending 必须一起清掉，否则首帧姿态（scale + opacity 0）会一直盖在已定格的浮层上
    widgetExpand.pending = false
    widgetExpand.settled = true
  }
}

export function openWidget(el, page, focus = '') {
  const origin = rectFromEl(el)
  if (!origin || !page) return false
  bindPopstate()
  clearTimers()
  widgetExpand.origin = origin
  widgetExpand.ghostHtml = captureGhost(el)
  widgetExpand.page = page
  widgetExpand.focus = focus || ''
  widgetExpand.closing = false
  widgetExpand.settled = false
  widgetExpand.open = false
  // pending 期间 overlay 以“小尺寸 + 透明”的首帧姿态渲染，避免闪一下全屏
  widgetExpand.pending = true
  hideSource(el)
  try {
    pageLoaders[page]?.()
  } catch {}
  try {
    history.pushState({ widgetOverlay: page, widgetFocus: focus || '' }, '')
  } catch {}
  // 同步打开：不再等两层 rAF，交给宿主组件先挂载内容再启动动画
  widgetExpand.open = true
  // 兜底定格：万一 onfinish 没触发（低端机掉帧 / 页面被切走），也不会留一块近白框
  settleTimer = window.setTimeout(() => {
    if (widgetExpand.page === page && !widgetExpand.closing && !widgetExpand.settled) {
      widgetExpand.pending = false
      widgetExpand.settled = true
    }
  }, widgetExpand.duration + 220)
  return true
}

export function closeWidget() {
  if (!widgetExpand.page || widgetExpand.closing) return false
  startCloseAnimation()
  if (typeof history !== 'undefined' && history.state && history.state.widgetOverlay) {
    widgetExpand.ignorePop = true
    try {
      history.back()
    } catch (e) {
      widgetExpand.ignorePop = false
    }
    // 部分 WebView 在历史栈底不派发 popstate，加超时保险，避免 ignorePop 永久卡住
    window.setTimeout(() => {
      widgetExpand.ignorePop = false
    }, 600)
  }
  return true
}

export function clearWidgetOrigin() {
  clearTimers()
  resetState()
}

export function useWidgetExpand() {
  return { widgetExpand, openWidget, closeWidget, clearWidgetOrigin, markWidgetSettled }
}

export { widgetExpand }
