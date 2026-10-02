<template>
  <div class="page-container assistant-page">
    <!-- 顶栏：Apple Compact 导航条，44px 触控目标 -->
    <header class="as-top-nav">
      <button class="nav-icon-btn" type="button" aria-label="返回" @click="goBack">
        <Icon name="arrow-left" :size="20" color="#1C1C1E" />
      </button>
      <div class="as-title-wrap">
        <h1 class="nav-title">学渡助手</h1>
        <p class="as-sub">{{ canChat && serverKey ? '已接通学院 DeepSeek 接口' : '配置个人 DeepSeek 密钥' }}</p>
      </div>
      <button class="nav-icon-btn" type="button" aria-label="申请与密钥指南" @click="showGuide = !showGuide">
        <Icon name="sparkles" :size="18" :color="showGuide ? '#007AFF' : '#8E8E93'" />
      </button>
    </header>

    <main class="as-chassis" :class="{ 'as-chassis-idle': !canChat }">
      <!-- 申请指南区：纯白不透明卡片，可折叠 -->
      <section v-if="!canChat || (showGuide && !serverKey)" class="as-guide">
        <div class="as-guide-head">
          <h2>申请与配置 API 密钥</h2>
          <p>通过企业微信申请学院 DeepSeek 密钥，填入后即可使用。密钥仅保留在本次登录内存中；提问时，经学渡后端转发至学院接口，并附带相关教务数据用于回答。</p>
        </div>
        <ol class="as-steps">
          <li><b>打开企业微信</b>，进入工作台</li>
          <li>找到 <b>AI 服务</b> → <b>DS API key 申请</b></li>
          <li>按页面说明创建密钥，复制完整 Key</li>
          <li>回到学渡，粘贴到下方并保存</li>
        </ol>
        <div class="as-guide-actions">
          <button type="button" class="as-btn as-btn-primary as-wecom-btn" @click="openWeCom">打开企业微信申请</button>
        </div>
        <form class="as-key-form" @submit.prevent="saveKey">
          <label class="as-key-label" for="apiKeyInput">我的 API Key</label>
          <input
            id="apiKeyInput"
            v-model="keyDraft"
            class="as-key-input"
            type="password"
            autocomplete="off"
            placeholder="粘贴申请到的密钥"
          />
          <div class="as-key-row">
            <button class="as-btn as-btn-primary flex-1" type="submit">保存并开始使用</button>
            <button v-if="hasKey" class="as-btn as-btn-secondary" type="button" @click="clearKey">清除密钥</button>
          </div>
          <p v-if="hasKey" class="as-key-ok">本次登录可用密钥 {{ maskedKey }}</p>
        </form>
      </section>

      <!-- 会话流容器 -->
      <div ref="scrollerRef" class="as-thread">
        <!-- 空状态 -->
        <div v-if="!messages.length && canChat" class="as-empty">
          <BrandMark :size="48" />
          <h2 class="as-empty-title">学习的事，一起理清。</h2>
          <p class="as-empty-sub">查询课程、寻找空闲自习室，或梳理学业计划。</p>
          <div class="as-hints">
            <button v-for="h in hints" :key="h" type="button" class="as-hint-chip" @click="send(h)">{{ h }}</button>
          </div>
        </div>

        <!-- 消息气泡 -->
        <div v-for="(m, i) in messages" :key="i" class="as-bubble" :class="m.role">
          <div class="as-bubble-text">{{ m.content }}</div>
        </div>
        <!-- 思考中提示 -->
        <div v-if="loading && !streamingText" class="as-bubble assistant">
          <div class="as-bubble-text as-thinking">正在思考…</div>
        </div>
      </div>

      <!-- 错误提示 -->
      <p v-if="errorText" class="as-error">{{ errorText }}</p>

      <!-- 贴底独立输入操作层 (Chrome) -->
      <form class="as-composer" @submit.prevent="send()">
        <input
          v-model="draft"
          class="as-input"
          type="text"
          maxlength="2000"
          :placeholder="canChat ? '问学渡助手…' : '请先按上方步骤配置 API Key'"
          :disabled="loading || !canChat"
        />
        <button class="as-send-btn" type="submit" :disabled="loading || !draft.trim() || !canChat">
          发送
        </button>
      </form>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore, API_BASE, apiClient } from '@/store/app'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import BrandMark from '@/components/BrandMark.vue'
import { useWidgetPage } from '@/composables/useWidgetPage'

const KEY_STORE = 'xueduDsApiKey'
const router = useRouter()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()
const scrollerRef = ref(null)
const draft = ref('')
const keyDraft = ref('')
const loading = ref(false)
const showGuide = ref(false)
const errorText = ref('')
const streamingText = ref('')
const localKey = computed({ get: () => store.assistantKey, set: value => { store.assistantKey = value } })
localStorage.removeItem(KEY_STORE)
const serverKey = ref(false)
const historyKey = `xueduAssistant:${store.studentId}`
const messages = ref(readHistory())
let activeRequest = null
let requestTimer = null
function readHistory() {
  try { const value = JSON.parse(sessionStorage.getItem(historyKey) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
const hints = ['今天有什么课', '现在哪里有空教室', '我这学期绩点多少']
const hasKey = computed(() => !!String(localKey.value || '').trim())
const canChat = computed(() => serverKey.value || hasKey.value)
const maskedKey = computed(() => {
  const k = String(localKey.value || '').trim()
  if (k.length < 8) return '已保存'
  return k.slice(0, 4) + '····' + k.slice(-4)
})

function persist() {
  try { sessionStorage.setItem(historyKey, JSON.stringify(messages.value.slice(-30))) } catch {}
}

function goBack() {
  closeToWidget()
}

function saveKey() {
  const k = String(keyDraft.value || '').trim()
  if (k.length < 8) {
    showToast('请粘贴完整的 API Key')
    return
  }
  localKey.value = k
  keyDraft.value = ''
  showGuide.value = false
  errorText.value = ''
  showToast('本次登录已启用，可以开始提问')
}

function clearKey() {
  localKey.value = ''
  localStorage.removeItem(KEY_STORE)
  keyDraft.value = ''
  showGuide.value = true
  showToast('已清除本机密钥')
}

function openWeCom() {
  // 安卓 WebView 只处理主框架跳转，会拦掉 iframe 里的自定义 scheme，
  // 老的 iframe.src='wxwork://' 点了完全没反应。改用 intent:// 走主框架：
  // 系统会交给企业微信，没装时由 Android 自己兜底，不会让 WebView 白屏。
  const intentUrl = 'intent://#Intent;scheme=wxwork;package=com.tencent.wework;end'
  try {
    window.location.href = intentUrl
  } catch (e) {
    try { window.location.href = 'wxwork://' } catch (err) {}
  }
  window.setTimeout(() => {
    showToast('打开后：工作台 → AI服务 → DS API key申请')
  }, 900)
}

function scrollBottom() {
  nextTick(() => {
    const el = scrollerRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const PERIOD_SLOT_NAMES = [
  '第1-2节 08:20-09:45',
  '第3-5节 10:15-12:35',
  '第6-7节 14:00-15:25',
  '第8-10节 15:40-18:00',
  '第11-13节 19:00-21:25'
]
const CLASSROOM_ASK = /(空教室|空闲教室|空着|自习|没课.{0,4}教室|教室.{0,4}空|哪.{0,4}教室|找.{0,2}教室|蹭课|教室号)/

function pad2(n) {
  return String(n).padStart(2, '0')
}

function campusIdFromText(text) {
  const s = String(text || '')
  if (s.includes('南岸')) return '01'
  if (s.includes('科学城')) return '02'
  return store.campus === 'nanan' ? '01' : '02'
}

function campusNameOf(id) {
  return id === '01' ? '南岸校区' : '科学城校区'
}

function periodSlotFromNow() {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  if (m <= 614) return 0
  if (m <= 755) return 1
  if (m <= 925) return 2
  if (m <= 1080) return 3
  return 4
}

function periodSlotFromText(text) {
  const s = String(text || '')
  const m = s.match(/第?\s*(\d{1,2})\s*(?:[-~—到至]\s*(\d{1,2}))?\s*节/)
  if (m) {
    const start = Number(m[1])
    if (start <= 2) return 0
    if (start <= 5) return 1
    if (start <= 7) return 2
    if (start <= 10) return 3
    return 4
  }
  if (/晚上|晚自习|夜间/.test(s)) return 4
  if (/下午|午后/.test(s)) return 2
  if (/上午|早上|早晨|清早/.test(s)) return 0
  return periodSlotFromNow()
}

function weekdayFromText(text) {
  const s = String(text || '')
  const today = store.weekdayIndex() + 1
  if (/后天/.test(s)) return ((today + 1) % 7) + 1
  if (/明天|明日/.test(s)) return (today % 7) + 1
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const m = s.match(/周\s*([一二三四五六日天])/)
  if (m && map[m[1]]) return map[m[1]]
  return today
}

async function buildClassroomContext(question) {
  if (!CLASSROOM_ASK.test(question)) return null
  const week = store.currentWeek || store.calcCurrentWeek()
  const weekday = weekdayFromText(question)
  const period = periodSlotFromText(question)
  const campusId = campusIdFromText(question)
  const label = '第' + week + '周 ' + WEEKDAY_NAMES[weekday - 1] + ' ' + PERIOD_SLOT_NAMES[period] + ' ' + campusNameOf(campusId)
  try {
    const res = await store.fetchClassrooms({
      query: '1',
      week: String(week),
      weekday: String(weekday),
      period: String(period),
      campus: campusId
    })
    if (!res || !res.success) {
      return { query: label, error: (res && res.message) || '教务系统没有返回空教室数据' }
    }
    const all = res.rooms || []
    return {
      query: label,
      total: all.length,
      rooms: all.slice(0, 40).map(r => ({
        name: r.name,
        campus: r.campus,
        building: r.building,
        type: r.type
      }))
    }
  } catch (e) {
    return { query: label, error: e.message || '查询空教室失败' }
  }
}

async function buildLiveContext(question) {
  const now = store.clock
  const week = store.currentWeek || store.calcCurrentWeek()
  const todayName = WEEKDAY_NAMES[store.weekdayIndex()]
  const brief = c => ({
    name: c.name,
    teacher: c.teacher || '',
    day: c.day,
    time: store.courseTime(c),
    room: c.room || '待定',
    weeks: c.weeks || ''
  })
  const weekCourses = store.allCourses
    .filter(c => store.isCourseInWeek(c, week))
    .sort((a, b) => a.dayIndex - b.dayIndex || a.rowIndex - b.rowIndex)

  const grades = store.grades || []
  let credits = 0
  let scoreSum = 0
  let scoreCount = 0
  let passed = 0
  let gpaWeight = 0
  let gpaCredits = 0
  const failed = []
  const natureMap = new Map()
  grades.forEach(g => {
    const c = parseFloat(g.credit) || 0
    credits += c
    const s = parseFloat(g.score)
    if (!isNaN(s)) {
      scoreSum += s
      scoreCount++
      if (s >= 60) passed++
      else failed.push({ name: g.courseName, score: s })
    }
    const gpa = parseFloat(g.gpa)
    if (!isNaN(gpa) && c > 0) {
      gpaWeight += gpa * c
      gpaCredits += c
    }
    const nature = g.nature || '其他'
    natureMap.set(nature, (natureMap.get(nature) || 0) + c)
  })
  const avgScore = scoreCount ? (scoreSum / scoreCount).toFixed(1) : null
  const overallGpa = gpaCredits ? (gpaWeight / gpaCredits).toFixed(2) : null
  const natureBreakdown = Array.from(natureMap.entries()).map(([k, v]) => k + ': ' + v.toFixed(1) + '学分')

  const exams = (store.exams || []).map(e => ({
    course: e.courseName || e.name || '考试科目',
    time: e.time || e.examTime || '',
    room: e.room || e.classroom || '地点待定',
    seat: e.seat || ''
  }))

  const classroomContext = await buildClassroomContext(question)

  return {
    today: now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + ' ' + todayName,
    currentWeek: week,
    currentCampus: campusNameOf(store.campus === 'nanan' ? '01' : '02'),
    student: {
      name: store.studentName,
      college: store.profile?.college || '',
      major: store.profile?.major || '',
      className: store.profile?.className || '',
      enrollYear: store.profile?.enrollYear || ''
    },
    todayCourses: store.todayCourses.map(brief),
    tomorrowCourses: store.tomorrowCourses.map(brief),
    weekCoursesCount: weekCourses.length,
    weekCoursesSample: weekCourses.slice(0, 12).map(brief),
    gradesSummary: {
      totalCourses: grades.length,
      totalCredits: credits.toFixed(1),
      avgScore,
      overallGpa,
      passedCount: passed,
      failedCourses: failed.slice(0, 5),
      natureBreakdown
    },
    examsUpcoming: exams.slice(0, 10),
    classroomContext
  }
}

async function send(text) {
  const content = (text || draft.value).trim()
  if (!content || loading.value || !canChat.value) return
  draft.value = ''
  errorText.value = ''
  messages.value.push({ role: 'user', content })
  persist()
  scrollBottom()

  loading.value = true
  streamingText.value = ''
  activeRequest = new AbortController()
  requestTimer = window.setTimeout(() => activeRequest?.abort(), 90000)
  try {
    const liveContext = await buildLiveContext(content)
    const payload = {
      messages: messages.value.slice(-6),
      context: liveContext,
      stream: true
    }

    const res = await fetch(API_BASE + '/assistant/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': store.sessionId,
        ...(localKey.value ? { 'x-ds-key': localKey.value } : {})
      },
      signal: activeRequest.signal,
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      throw new Error(errJson.message || ('请求失败 (' + res.status + ')'))
    }

    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream') && res.body && window.ReadableStream) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const assistant = { role: 'assistant', content: '' }
      messages.value.push(assistant)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (!dataStr || dataStr === '[DONE]') continue
          try {
            const data = JSON.parse(dataStr)
            if (data.error) throw new Error(data.error)
            const delta = data.choices?.[0]?.delta?.content || data.content || ''
            const think = data.choices?.[0]?.delta?.reasoning_content || ''
            if (delta) {
              assistant.content += delta
              streamingText.value = assistant.content
              scrollBottom()
            } else if (!assistant.content && think) {
              streamingText.value = '正在组织回答…'
            }
          } catch {}
        }
      }
      if (!assistant.content) assistant.content = '这次没有生成到可见回答，请换个问法再试一次'
    } else {
      const json = await res.json()
      if (!json.success) throw new Error(json.message || '助手暂时不可用')
      messages.value.push({ role: 'assistant', content: json.content || '这次没有生成到可见回答，请换个问法再试一次' })
    }
    persist()
  } catch (e) {
    errorText.value = e.message || '发送失败'
    showToast(errorText.value)
  } finally {
    window.clearTimeout(requestTimer)
    activeRequest = null
    loading.value = false
    streamingText.value = ''
    scrollBottom()
  }
}

async function refreshStatus() {
  try {
    const { data: json } = await apiClient.get('/assistant/status', { headers: { 'X-Session-Id': store.sessionId }, timeout: 15000 })
    serverKey.value = !!json.serverKey
    if (json.grayClosed) {
      errorText.value = json.message || '演示体验已关闭'
      serverKey.value = false
    }
  } catch {}
}

onUnmounted(() => activeRequest?.abort())

onMounted(async () => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  await refreshStatus()
  showGuide.value = !canChat.value
  scrollBottom()
})
</script>

<style scoped>
.assistant-page {
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  padding: calc(var(--safe-top, 0px) + 8px) 14px calc(12px + var(--safe-bottom, 0px));
}

.as-top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 10px;
  flex-shrink: 0;
  min-height: 44px;
}

.nav-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-icon-btn:active {
  transform: scale(0.96);
  background: #F2F2F7;
}

.as-title-wrap {
  text-align: center;
  flex: 1;
  padding: 0 8px;
}

.nav-title {
  font-size: 17px;
  font-weight: 700;
  color: #000000;
  line-height: 1.25;
}

.as-sub {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
  font-weight: 500;
  margin-top: 2px;
}

/* 底盘容器：清晰 flex 结构，白卡/浅灰背景 */
.as-chassis {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  background: #FFFFFF;
  border-radius: 16px;
  overflow: hidden;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

/* 指南区：可折叠、纯白不透明 */
.as-guide {
  flex-shrink: 0;
  padding: 16px;
  background: #FFFFFF;
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.12);
  max-height: 50vh;
  overflow-y: auto;
}

.as-chassis-idle .as-guide {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: none;
}

.as-guide-head h2 {
  font-size: 16px;
  font-weight: 700;
  color: #000000;
  margin-bottom: 6px;
}

.as-guide-head p {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
  line-height: 1.5;
}

.as-steps {
  margin: 12px 0 14px 18px;
  font-size: 13px;
  color: #000000;
  line-height: 1.7;
}

.as-guide-actions {
  display: flex;
  margin-bottom: 12px;
}

.as-wecom-btn {
  width: 100%;
}

.as-btn {
  min-height: 44px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  outline: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.as-btn:active {
  transform: scale(0.98);
}

.as-btn-primary {
  background: #007AFF;
  color: #FFFFFF;
}

.as-btn-secondary {
  background: rgba(60, 60, 67, 0.08);
  color: #000000;
}

.as-key-form {
  margin-top: 14px;
}

.as-key-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(60, 60, 67, 0.60);
  margin-bottom: 6px;
}

.as-key-input {
  width: 100%;
  height: 44px;
  border: 0.5px solid rgba(60, 60, 67, 0.20);
  border-radius: 10px;
  padding: 0 12px;
  background: #FFFFFF;
  font-size: 14px;
  outline: none;
  color: #000000;
  transition: border-color 0.12s ease;
}

.as-key-input:focus {
  border-color: #007AFF;
}

.as-key-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.flex-1 {
  flex: 1;
}

.as-key-ok {
  margin-top: 8px;
  font-size: 12px;
  color: #34C759;
  font-weight: 600;
}

/* 消息会话区域 */
.as-thread {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 14px 10px;
  min-height: 0;
  background: #F2F2F7;
  display: flex;
  flex-direction: column;
}

.as-chassis-idle .as-thread {
  display: none;
}

.as-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px 20px;
  text-align: center;
}

.as-empty-title {
  font-size: 20px;
  font-weight: 700;
  color: #000000;
  margin-top: 6px;
}

.as-empty-sub {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
}

.as-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}

.as-hint-chip {
  height: 38px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: #007AFF;
  background: #FFFFFF;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  border-radius: 19px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.12s ease;
}

.as-hint-chip:active {
  transform: scale(0.96);
}

/* 气泡样式：用户实色系统蓝白字；助手不透明白底黑字，无渐变无彩线 */
.as-bubble {
  margin-bottom: 12px;
  display: flex;
}

.as-bubble.user {
  justify-content: flex-end;
}

.as-bubble.assistant {
  justify-content: flex-start;
}

.as-bubble-text {
  max-width: 85%;
  padding: 11px 14px;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.as-bubble.user .as-bubble-text {
  background: #007AFF;
  color: #FFFFFF;
  border-radius: 18px 18px 4px 18px;
}

.as-bubble.assistant .as-bubble-text {
  background: #FFFFFF;
  color: #000000;
  border-radius: 18px 18px 18px 4px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.as-thinking {
  color: rgba(60, 60, 67, 0.60) !important;
}

.as-error {
  font-size: 12px;
  color: #FF3B30;
  padding: 8px 14px;
  background: #FFF1F0;
  border-top: 0.5px solid rgba(255, 59, 48, 0.2);
}

/* 贴底独立输入操作层 (Chrome Layer) */
.as-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  flex-shrink: 0;
  padding: 10px 12px;
  background: #FFFFFF;
  border-top: 0.5px solid rgba(60, 60, 67, 0.12);
}

.as-input {
  flex: 1;
  height: 44px;
  border: 0.5px solid rgba(60, 60, 67, 0.20);
  border-radius: 22px;
  padding: 0 16px;
  background: #F2F2F7;
  color: #000000;
  font-size: 15px;
  outline: none;
  transition: border-color 0.12s ease;
}

.as-input:focus {
  border-color: #007AFF;
  background: #FFFFFF;
}

.as-input:disabled {
  opacity: 0.5;
}

.as-send-btn {
  height: 44px;
  padding: 0 18px;
  background: #007AFF;
  color: #FFFFFF;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  outline: none;
  cursor: pointer;
  transition: opacity 0.12s ease;
}

.as-send-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.as-send-btn:active:not(:disabled) {
  opacity: 0.85;
}

@media (prefers-reduced-motion: reduce) {
  .nav-icon-btn,
  .as-btn,
  .as-hint-chip,
  .as-send-btn {
    transition: none !important;
    transform: none !important;
  }
}
</style>
