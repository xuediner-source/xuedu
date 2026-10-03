<template>
  <div class="page-container home-page">
    <!-- 1. 大标题头部：今天 + 日期/周次 (HIG Large Title) -->
    <header class="home-large-header">
      <h1 class="large-title-text">今天</h1>
      <span class="large-title-sub">{{ todayDateLabel }} · {{ displayWeekLabel }}</span>
    </header>
    <ScheduleSyncStatus :synced-at="store.scheduleSyncedAt" :loading="store.scheduleLoading" :offline="store.isOffline" :error="store.scheduleError" :session-expired="store.sessionExpired" @login="goPlain('/login')" />
    <p v-if="holidayNotice" class="holiday-notice">{{ holidayNotice }}</p>

    <!-- 3. 下一节课：唯一英雄模块 (Hero Up-Next) -->
    <section
      v-if="displayHero"
      class="hero-next-course-box"
      role="button"
      tabindex="0"
      :aria-label="`下一节课：${displayHero.name}，时间 ${displayHero.periodTime}，地点 ${displayHero.shortRoom || displayHero.room || '教室待定'}`"
      @click="openFromCard($event, 'schedule')"
      @keydown.enter.self.prevent="openFromCard($event, 'schedule')"
      @keydown.space.self.prevent="openFromCard($event, 'schedule')"
    >
      <div class="hero-next-kicker">
        <span class="hero-pulse-dot" aria-hidden="true"></span>
        <span>{{ displayHero.isOngoing ? '正在进行' : '下一节' }} · {{ displayHero.statusText }}</span>
      </div>
      <h2 class="hero-course-title-big">{{ displayHero.name }}</h2>
      <div class="hero-course-time-line">{{ displayHero.displayWhen }} {{ displayHero.periodTime }}</div>
      <div class="hero-course-room-line">
        <Icon name="location" :size="14" color="var(--accent)" />
        <span class="hero-room-span">{{ displayHero.shortRoom || displayHero.room || '教室待定' }}</span>
        <span class="hero-teacher-span" v-if="displayHero.teacher">· {{ displayHero.teacher }}</span>
      </div>
    </section>

    <!-- 无待上课程时的空态展示 (杜绝过期历史课程冒充下一节) -->
    <section
      v-else
      class="hero-empty-course-box"
      role="button"
      tabindex="0"
      aria-label="查看完整课表"
      @click="openFromCard($event, 'schedule')"
      @keydown.enter.self.prevent="openFromCard($event, 'schedule')"
      @keydown.space.self.prevent="openFromCard($event, 'schedule')"
    >
      <van-loading v-if="store.scheduleLoading && !store.allCourses.length" size="22px" />
      <template v-else>
        <div class="empty-kicker-text">今日课表</div>
        <h2 class="empty-title-text">{{ emptyTitle }}</h2>
        <p class="empty-sub-text">{{ emptySubtitle }}</p>
        <span class="empty-link-btn">查看完整课表 ›</span>
      </template>
    </section>

    <!-- 4. 之后 (最多两行日程，时间小列 + 右侧课名与长地点垂直堆叠，自然折行不省略) -->
    <section v-if="laterCourses.length > 0" class="subsequent-agenda-block" aria-label="后续日程">
      <div class="section-kicker-title">之后</div>
      <div class="subsequent-course-list">
        <div
          v-for="(course, idx) in laterCourses"
          :key="idx"
          class="subsequent-row"
          role="button"
          tabindex="0"
          @click="openFromCard($event, 'schedule')"
          @keydown.enter.self.prevent="openFromCard($event, 'schedule')"
          @keydown.space.self.prevent="openFromCard($event, 'schedule')"
        >
          <div class="subsequent-time-col">
            <span class="subsequent-time-when">{{ course.displayWhen }}</span>
            <span class="subsequent-time-clock">{{ course.startTime || course.periodTime.split('-')[0] }}</span>
          </div>
          <div class="subsequent-detail-col">
            <div class="subsequent-name">{{ course.name }}</div>
            <div class="subsequent-room">
              <Icon name="location" :size="12" color="var(--text-tertiary)" />
              <span class="subsequent-room-text">{{ course.shortRoom || course.room || '地点待定' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. 天气与教学日历并排双白分组盒 -->
    <section class="weather-calendar-dual-grid" aria-label="校园天气与教学日历">
      <div
        class="dual-box-item weather-box"
        role="button"
        tabindex="0"
        aria-label="查看天气详情"
        @click="openFromCard($event, 'calendar-weather', 'weather')"
        @keydown.enter.self.prevent="openFromCard($event, 'calendar-weather', 'weather')"
        @keydown.space.self.prevent="openFromCard($event, 'calendar-weather', 'weather')"
      >
        <div class="dual-box-top">
          <span class="weather-temp-number">{{ weatherTemp }}°</span>
          <span class="weather-desc-sub">{{ weatherText }}</span>
        </div>
        <div class="weather-campus-switch" @click.stop>
          <button
            v-for="c in campusOptions"
            :key="c.id"
            class="campus-switch-opt"
            :class="{ active: store.campus === c.id }"
            :aria-pressed="store.campus === c.id"
            type="button"
            @click="switchCampus(c.id)"
          >{{ c.short }}</button>
        </div>
        <div class="weather-extra-sub" v-if="weatherRange">{{ weatherRange }}</div>
      </div>

      <div
        class="dual-box-item calendar-box"
        role="button"
        tabindex="0"
        aria-label="查看教学日历"
        @click="openFromCard($event, 'calendar-weather', 'calendar')"
        @keydown.enter.self.prevent="openFromCard($event, 'calendar-weather', 'calendar')"
        @keydown.space.self.prevent="openFromCard($event, 'calendar-weather', 'calendar')"
      >
        <div class="dual-box-top">
          <span class="calendar-week-big">{{ displayWeekLabel }}</span>
        </div>
        <div class="calendar-event-sub">{{ nextCalendarText }}</div>
        <span class="calendar-action-link">查看校历 ›</span>
      </div>
    </section>

    <!-- 5. 学业概览 Caption 级三项可点击条 -->
    <section class="caption-glance-bar" aria-label="学业速览">
      <div class="caption-items-group">
        <button class="caption-chip-btn" type="button" @click="openFromCard($event, 'schedule')">
          <template v-if="displayWeek === null">教学周待确认</template>
          <template v-else-if="displayWeek < 1">尚未开学</template>
          <template v-else>本周<b>{{ weekCourseCount }}</b>次</template>
        </button>
        <span class="caption-dot-sep">·</span>
        <button class="caption-chip-btn" type="button" @click="openFromCard($event, 'grades')">
          已出<b>{{ store.grades.length }}</b>门
        </button>
        <span class="caption-dot-sep">·</span>
        <button class="caption-chip-btn" type="button" @click="goPlain('/exam')">
          待考<b>{{ pendingExamCount }}</b>场
        </button>
      </div>
      <button class="caption-link-more" type="button" @click="openFromCard($event, 'schedule')">
        课表 ›
      </button>
    </section>

    <!-- 6. 常用服务 Inset Grouped List (彻底废弃 6 大卡工具墙) -->
    <section class="services-grouped-section" aria-label="常用服务">
      <h2 class="section-headline">常用</h2>
      <div class="inset-grouped-box">
        <div
          class="inset-list-row"
          role="button"
          tabindex="0"
          @click="openFromCard($event, 'classrooms')"
          @keydown.enter.self.prevent="openFromCard($event, 'classrooms')"
          @keydown.space.self.prevent="openFromCard($event, 'classrooms')"
        >
          <div class="inset-row-left">
            <div class="inset-row-icon icon-blue">
              <Icon name="location" :size="16" color="#ffffff" />
            </div>
            <span class="inset-row-title">空闲教室</span>
          </div>
          <span class="chevron-right-mark" aria-hidden="true">›</span>
        </div>

        <div
          class="inset-list-row"
          role="button"
          tabindex="0"
          @click="openFromCard($event, 'program')"
          @keydown.enter.self.prevent="openFromCard($event, 'program')"
          @keydown.space.self.prevent="openFromCard($event, 'program')"
        >
          <div class="inset-row-left">
            <div class="inset-row-icon icon-purple">
              <Icon name="book" :size="16" color="#ffffff" />
            </div>
            <span class="inset-row-title">培养方案</span>
          </div>
          <span class="chevron-right-mark" aria-hidden="true">›</span>
        </div>

        <div
          class="inset-list-row"
          role="button"
          tabindex="0"
          @click="openFromCard($event, 'assistant')"
          @keydown.enter.self.prevent="openFromCard($event, 'assistant')"
          @keydown.space.self.prevent="openFromCard($event, 'assistant')"
        >
          <div class="inset-row-left">
            <div class="inset-row-icon icon-green">
              <Icon name="sparkles" :size="16" color="#ffffff" />
            </div>
            <span class="inset-row-title">学渡助手</span>
          </div>
          <span class="chevron-right-mark" aria-hidden="true">›</span>
        </div>

      </div>
    </section>

    <!-- 页脚品牌信息 -->
    <footer class="home-footer-plate">
      <BrandMark :size="16" />
      <span>学渡 · 向学而行</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import Icon from '@/components/Icon.vue'
import BrandMark from '@/components/BrandMark.vue'
import ScheduleSyncStatus from '@/components/ScheduleSyncStatus.vue'
import { getExamStatus } from '@/utils/examTime.js'
import { openWidget, clearWidgetOrigin } from '@/composables/useWidgetExpand'
import {
  resolveHomeAgenda,
  previewNextTeachingWeek,
  getWeekdayIndex,
  formatTodayDate
} from '@/utils/homeAgenda'

const router = useRouter()
const store = useAppStore()

// 统一响应式时钟源：每 30 秒更新，且页面切换到前台时立即更新，驱动日期、星期、教学周及日程无缝跨午夜更新
const currentClock = computed(() => store.clock)

const todayDateLabel = computed(() => formatTodayDate(currentClock.value))
const todayIdx = computed(() => getWeekdayIndex(currentClock.value))
const displayWeek = computed(() => store.currentWeek)
const displayWeekLabel = computed(() => displayWeek.value === null ? '教学周待确认' : displayWeek.value < 1 ? '尚未开学' : `第 ${displayWeek.value} 周`)

const campusOptions = [
  { id: 'kexuecheng', short: '科学城' },
  { id: 'nanan', short: '南岸' }
]

const weatherTemp = computed(() => store.weather?.temperature ?? '--')
const weatherText = computed(() => {
  if (store.weather?.text) return store.weather.text
  return store.weatherLoading ? '同步中…' : '未同步'
})
const weatherRange = computed(() => {
  const day = store.weather?.days?.[0]
  if (!day || day.tmax == null) return ''
  return `${day.tmin}° / ${day.tmax}°`
})

const nextCalendarText = computed(() => {
  const ev = store.calendar?.upcoming?.[0]
  if (!ev) {
    if (store.calendarLoading && !store.calendar) return '校历同步中…'
    return store.calendar ? '按自己的节奏，安排好这一周' : '校历未同步'
  }
  if (ev.date === ev.endDate) return `${ev.date.slice(5)} ${ev.title}`
  return `${ev.date.slice(5)}–${String(ev.endDate).slice(5)} ${ev.title}`
})

async function switchCampus(id) {
  if (store.campus === id) return
  await store.fetchWeather(id)
}

const weekCourseCount = computed(() => {
  return store.allCourses.filter(c => store.isCourseInWeek(c, displayWeek.value)).length
})

const pendingExamCount = computed(() => store.exams.filter(exam => {
  const status = getExamStatus(exam.examTime, currentClock.value)
  return status === 'pending' || status === 'ongoing'
}).length)

function localIso(date) {
  const value = date instanceof Date ? date : new Date()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

const holidayNotice = computed(() => {
  const events = Array.isArray(store.calendar?.events) ? store.calendar.events : []
  const today = localIso(currentClock.value)
  const hit = events.find(event => event?.date && today >= event.date && today <= (event.endDate || event.date) && (event.type === 'holiday' || event.type === 'vacation'))
  if (!hit) return ''
  return `校历标注：${hit.title}。课表仍显示教务安排，放假以学校通知为准。`
})

const emptyTitle = computed(() => {
  if (displayWeek.value === null) return '教学周尚未确认'
  if (store.scheduleError && !store.allCourses.length) return '暂时无法获取课表'
  if (weekCourseCount.value) return '本周待上课程已全部结束'
  return '本周暂无课程安排'
})

const emptySubtitle = computed(() => {
  if (displayWeek.value === null) return '请同步学期校历后查看课程安排'
  if (store.scheduleError && !store.allCourses.length) return store.scheduleError
  if (weekCourseCount.value) return '下一周的课在完整课表里'
  return '同步成功后，课程会显示在这里'
})

// 使用真实教学周与时间计算真正的下一节课与之后日程（完全依赖 currentClock，跨午夜/跨周自适应）
const agenda = computed(() => {
  return resolveHomeAgenda({
    courses: store.allCourses,
    currentWeek: displayWeek.value,
    weekdayIndex: todayIdx.value,
    now: currentClock.value,
    isCourseInWeek: store.isCourseInWeek,
    courseTime: store.courseTime
  })
})

const heroCourse = computed(() => agenda.value.heroCourse)
const nextWeekHero = computed(() => {
  if (heroCourse.value || displayWeek.value == null || displayWeek.value < 1) return null
  return previewNextTeachingWeek({
    courses: store.allCourses,
    currentWeek: displayWeek.value,
    weekdayIndex: todayIdx.value,
    now: currentClock.value,
    isCourseInWeek: store.isCourseInWeek,
    courseTime: store.courseTime
  })
})
const displayHero = computed(() => heroCourse.value || nextWeekHero.value)
const laterCourses = computed(() => agenda.value.laterCourses)

function openFromCard(evt, page, focus = '') {
  const el = evt?.currentTarget
  if (!openWidget(el, page, focus)) {
    const pathMap = {
      'calendar-weather': '/calendar-weather',
      schedule: '/schedule',
      program: '/program',
      classrooms: '/classrooms',
      grades: '/grades',
      assistant: '/assistant'
    }
    const path = pathMap[page] || ('/' + page)
    router.push(focus ? { path, query: { focus } } : path)
  }
}

function goPlain(path) {
  clearWidgetOrigin()
  router.push(path)
}

onMounted(() => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  store.updateClock()
  void store.fetchWeather()
  void store.fetchSchedule()
  void store.fetchGrades()
  void store.fetchExams()
})
</script>

<style scoped>
.home-page {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(var(--safe-top) + 14px) 16px calc(var(--dock-clearance) + 8px);
  background-color: var(--bg-app);
}

/* 1. 大标题头部 */
.home-large-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 2px 14px;
}
.large-title-text {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.15;
}
.large-title-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}
.holiday-notice {
  margin: 0 2px 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 149, 0, 0.12);
  color: #8a4b12;
  font-size: 13px;
  line-height: 1.45;
}

/* 2. 天气与校历双白分组盒 */
.weather-calendar-dual-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
.dual-box-item {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  padding: 12px 14px;
  box-shadow: var(--shadow-content);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 96px;
  cursor: pointer;
  border: none;
  text-align: left;
}
.dual-box-item:active {
  background: rgba(255, 255, 255, 0.85);
}
.dual-box-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.weather-temp-number {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.weather-desc-sub {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}
.weather-campus-switch {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.campus-switch-opt {
  min-height: 44px;
  min-width: 44px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.campus-switch-opt.active {
  color: var(--accent);
  background: var(--accent-fill);
}
.weather-extra-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
.calendar-week-big {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.calendar-event-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.calendar-action-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-top: 6px;
  display: inline-block;
}

/* 3. 下一节课唯一英雄模块 (Hero Up-Next) */
.hero-next-course-box {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  padding: 16px 18px;
  box-shadow: var(--shadow-content);
  margin-bottom: 14px;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.hero-next-course-box:active {
  transform: scale(0.98);
}
.hero-next-kicker {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.hero-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
.hero-course-title-big {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin-bottom: 6px;
  line-height: 1.2;
}
.hero-course-time-line {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}
.hero-course-room-line {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.4;
}
.hero-room-span {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.hero-teacher-span {
  white-space: nowrap;
}

/* 空态课程卡片 */
.hero-empty-course-box {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  padding: 22px 18px;
  margin-bottom: 14px;
  text-align: center;
  cursor: pointer;
}
.empty-kicker-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.empty-title-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.empty-sub-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.empty-link-btn {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

/* 4. 之后日程：两列布局，左侧时间，右侧课名与长教室垂直堆叠，自然折行 */
.section-kicker-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 14px 4px 6px;
}
.subsequent-course-list {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  overflow: hidden;
  margin-bottom: 14px;
}
.subsequent-row {
  padding: 12px 16px;
  min-height: 52px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-bottom: 0.5px solid var(--separator);
  cursor: pointer;
}
.subsequent-row:last-child {
  border-bottom: none;
}
.subsequent-row:active {
  background: rgba(0, 0, 0, 0.03);
}
.subsequent-time-col {
  width: 78px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.subsequent-time-when {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.subsequent-time-clock {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.subsequent-detail-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.subsequent-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.subsequent-room {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  line-height: 1.35;
}
.subsequent-room-text {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* 5. 学业概览 Caption 行 */
.caption-glance-bar {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  padding: 4px 4px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.caption-items-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.caption-chip-btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}
.caption-chip-btn b {
  color: var(--text-primary);
  font-weight: 700;
  margin: 0 2px;
}
.caption-dot-sep {
  color: var(--text-tertiary);
  margin: 0 2px;
}
.caption-link-more {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}

/* 6. 常用服务 Inset Grouped */
.section-headline {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 16px 4px 8px;
}
.inset-grouped-box {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  overflow: hidden;
  box-shadow: var(--shadow-content);
  margin-bottom: 16px;
}
.inset-list-row {
  padding: 12px 16px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-bottom: 0.5px solid var(--separator);
  transition: background 0.1s ease;
}
.inset-list-row:last-child {
  border-bottom: none;
}
.inset-list-row:active {
  background: rgba(0, 0, 0, 0.03);
}
.inset-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.inset-row-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-blue   { background: #007AFF; }
.icon-purple { background: #AF52DE; }
.icon-green  { background: #34C759; }
.icon-orange { background: #FF9500; }
.inset-row-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}
.chevron-right-mark {
  font-size: 16px;
  color: var(--text-tertiary);
}

/* 页脚 */
.home-footer-plate {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 0 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
