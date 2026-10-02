<template>
  <teleport to="body">
    <div
      v-if="widgetExpand.page"
      class="widget-backdrop"
      :class="{ show: widgetExpand.open && !widgetExpand.closing }"
      @click="closeWidget"
    ></div>

    <!-- 源卡片残影：只做首尾衔接，不参与缩放 -->
    <div
      v-if="widgetExpand.page && widgetExpand.ghostHtml"
      class="widget-ghost-layer"
      :style="ghostLayerStyle"
      aria-hidden="true"
    >
      <div class="widget-card-ghost" :class="{ 'is-fading': ghostFading }" v-html="widgetExpand.ghostHtml"></div>
    </div>

    <!-- 会长大的“卡片框”：只有背景与圆角，不含任何文字，纯合成层动画 -->
    <div
      v-if="widgetExpand.page"
      ref="frameRef"
      class="widget-frame"
      :class="{ 'is-settled': widgetExpand.settled && !widgetExpand.closing }"
      :style="frameStyle"
    ></div>

    <!-- 内容层：始终按最终尺寸排版，只做等比微缩放 + 淡入，栅格化一次即可 -->
    <div
      v-if="widgetExpand.page"
      ref="overlayRef"
      class="widget-overlay"
      :class="{ 'is-settled': widgetExpand.settled && !widgetExpand.closing }"
      :style="overlayStyle"
    >
      <div v-if="mountPage" class="widget-overlay-inner">
        <component :is="pageComponent" />
      </div>
      <div v-else-if="widgetExpand.page && !widgetExpand.closing" class="widget-overlay-inner widget-overlay-placeholder">正在打开…</div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { widgetExpand, closeWidget, markWidgetSettled } from '@/composables/useWidgetExpand'
import { showToast } from '@/utils/appToast'

function loadPage(loader) {
  return defineAsyncComponent({
    loader,
    onError(_err, _retry, fail) {
      try { fail() } catch (e) {}
      closeWidget()
      showToast('页面加载失败，请稍后重试')
    }
  })
}

const pages = {
  'calendar-weather': loadPage(() => import('@/views/CalendarWeather.vue')),
  schedule: loadPage(() => import('@/views/Schedule.vue')),
  program: loadPage(() => import('@/views/Program.vue')),
  classrooms: loadPage(() => import('@/views/Classrooms.vue')),
  grades: loadPage(() => import('@/views/Grades.vue')),
  assistant: loadPage(() => import('@/views/Assistant.vue'))
}

const frameRef = ref(null)
const overlayRef = ref(null)
const mountPage = ref(false)
const ghostFading = ref(false)

let frameAnim = null
let contentAnim = null
let ghostTimer = 0

// 先快后缓，收尾不弹跳
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'

const pageComponent = computed(() => pages[widgetExpand.page] || null)

/**
 * 几何：把整屏的框按 (卡片宽/屏宽, 卡片高/屏高) 反向缩到卡片位置。
 * 旧版卡顿的根因是「外层非等比缩放 + 内层反向缩放」两层互相抵消，
 * 内容每帧都要按新的栅格比例重画，文字还会被拉扁。
 * 现在拆成两层：框层做非等比缩放（里面没有文字，纯合成，很便宜），
 * 内容层固定最终尺寸只做等比微缩放，两边各自只需栅格化一次。
 */
function geom() {
  const o = widgetExpand.origin
  if (!o) return null
  const vw = o.vw || window.innerWidth || 1
  const vh = o.vh || window.innerHeight || 1
  return {
    vw,
    vh,
    sx: Math.max(0.04, o.width / vw),
    sy: Math.max(0.04, o.height / vh),
    left: o.left,
    top: o.top,
    radius: Math.round(o.radiusPx || 22)
  }
}

const frameStyle = computed(() => {
  if (!widgetExpand.pending) return {}
  const g = geom()
  if (!g) return {}
  return {
    transform: 'translate3d(' + g.left + 'px,' + g.top + 'px,0) scale(' + g.sx + ',' + g.sy + ')',
    borderRadius: g.radius + 'px'
  }
})

const overlayStyle = computed(() => {
  // 安卓 WebView：全屏层上的 opacity:0 + transform 会被合成成近白实心块。
  // 内容层在框还没长开时保持 hidden，定格后再显示，全程不要透明合成层。
  if (widgetExpand.pending || widgetExpand.closing || !widgetExpand.settled) {
    return { visibility: 'hidden', display: 'none' }
  }
  return { visibility: 'visible', display: 'block' }
})

const ghostLayerStyle = computed(() => {
  const o = widgetExpand.origin
  if (!o) return {}
  return {
    top: o.top + 'px',
    left: o.left + 'px',
    width: o.width + 'px',
    height: o.height + 'px',
    borderRadius: o.radius
  }
})

function cancelAnims() {
  if (frameAnim) {
    try { frameAnim.cancel() } catch {}
  }
  frameAnim = null
  contentAnim = null
}

function prefersReducedMotion() {
  try {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}

// 低端机：圆角每帧重算 mask 太贵，直接跳过圆角动画（小尺寸下 22px 圆角本来也几乎看不见）
function isLowEndDevice() {
  try {
    const cores = navigator.hardwareConcurrency || 8
    const mem = navigator.deviceMemory || 4
    return cores <= 4 || mem <= 2
  } catch (e) {
    return false
  }
}

function runAnim(open) {
  const g = geom()
  const frame = frameRef.value
  const overlay = overlayRef.value
  if (!g || !frame || !overlay) {
    // 元素缺失时也要定格，否则会留一块近白的框
    if (open) markWidgetSettled()
    return
  }
  cancelAnims()

  // 无障碍 / 不支持 WAAPI / 低端机：直接跳到最终状态，不做动画
  if (typeof frame.animate !== 'function' || prefersReducedMotion()) {
    if (open) markWidgetSettled()
    return
  }

  const duration = widgetExpand.duration
  const from = 'translate3d(' + g.left + 'px,' + g.top + 'px,0) scale(' + g.sx + ',' + g.sy + ')'
  const to = 'translate3d(0px,0px,0) scale(1,1)'
  const animateRadius = !isLowEndDevice()

  // 只动画“卡片框”。内容层用 visibility 显隐，避免 WebView 把透明全屏层画成白框。
  const frameKeys = open
    ? [
        animateRadius
          ? { transform: from, borderRadius: g.radius + 'px' }
          : { transform: from, borderRadius: '0px' },
        { transform: to, borderRadius: '0px' }
      ]
    : [
        { transform: to, borderRadius: '0px' },
        animateRadius
          ? { transform: from, borderRadius: g.radius + 'px' }
          : { transform: from, borderRadius: '0px' }
      ]
  frameAnim = frame.animate(frameKeys, { duration, easing, fill: 'forwards' })

  frameAnim.onfinish = () => {
    if (open && widgetExpand.page && !widgetExpand.closing) {
      markWidgetSettled()
    }
  }
}

watch(
  () => widgetExpand.page,
  (page) => {
    document.documentElement.classList.toggle('widget-overlay-open', !!page)
    // 这里不重置 mountPage：快速“关闭→立刻开另一个卡片”时，
    // 提前卸载会让异步组件重新加载，中间出现空白帧。挂载交给 open watch 统一管理。
    ghostFading.value = false
    if (!page) {
      cancelAnims()
      mountPage.value = false
    }
  }
)

watch(
  () => widgetExpand.open,
  async (open) => {
    if (!open || widgetExpand.closing) return
    mountPage.value = false
    ghostFading.value = false
    // 首帧：框缩在卡片位置，内容层 visibility:hidden，避免透明全屏合成白块
    await nextTick()
    // 先把整页挂上并强制完成布局，动画期间就只剩 transform / opacity
    mountPage.value = true
    await nextTick()
    const inner = overlayRef.value && overlayRef.value.firstElementChild
    if (inner) void inner.offsetHeight
    runAnim(true)
    if (ghostTimer) window.clearTimeout(ghostTimer)
    ghostTimer = window.setTimeout(() => {
      ghostFading.value = true
    }, 70)
  }
)

watch(
  () => widgetExpand.settled,
  (settled) => {
    if (!settled) return
    cancelAnims()
    const f = frameRef.value
    if (f) {
      f.style.transform = ''
      f.style.borderRadius = ''
    }
    const o = overlayRef.value
    if (o) {
      o.style.transform = ''
      o.style.opacity = ''
      o.style.visibility = ''
    }
  }
)

watch(
  () => widgetExpand.closing,
  async (closing) => {
    if (!closing) return
    ghostFading.value = false
    // 立刻卸掉页面，避免分组 Tab / sticky 层在 WebView 里跟着缩小框留残影
    mountPage.value = false
    await nextTick()
    runAnim(false)
  }
)

watch(
  () => !!(widgetExpand.page && !widgetExpand.settled),
  (animating) => {
    document.documentElement.classList.toggle('widget-animating', animating)
  }
)

onBeforeUnmount(() => {
  cancelAnims()
  if (ghostTimer) window.clearTimeout(ghostTimer)
  document.documentElement.classList.remove('widget-overlay-open', 'widget-animating')
})
</script>
