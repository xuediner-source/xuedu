<template>
  <div class="page-container calendar-weather-page">
    <!-- Top Nav: Apple Compact 导航条，44px 触控区 -->
    <header class="cw-top-nav">
      <button class="nav-icon-btn" aria-label="返回" @click="closeToWidget">
        <Icon name="arrow-left" :size="20" color="#1C1C1E" />
      </button>
      <div class="nav-title-col">
        <h1 class="nav-title">{{ focus === 'calendar' ? '校历' : focus === 'weather' ? '天气' : '校历与天气' }}</h1>
      </div>
      <div class="nav-actions">
        <button class="nav-icon-btn" aria-label="校历说明" @click="showInfoModal">
          <Icon name="sparkles" :size="18" color="#8E8E93" />
        </button>
        <button class="nav-icon-btn" aria-label="刷新数据" @click="refresh">
          <Icon name="refresh" :size="18" color="#8E8E93" />
        </button>
      </div>
    </header>

    <!-- Sub Status Line -->
    <div class="cw-status-bar">
      <span class="status-left">
        <Icon name="clock" :size="13" color="#8E8E93" />
        <span>{{ weatherSyncLabel }}</span>
      </span>
      <span class="term-pill-tag">
        <Icon name="schedule" :size="12" color="#007AFF" />
        <span>{{ store.semesterText || '学期未同步' }}</span>
      </span>
    </div>

    <!-- 1. 天气大卡片（白底不透明，大黑字气温，分段控制校区切换） -->
    <section id="cw-weather" class="cw-card weather-hero-card">
      <div class="weather-card-top">
        <div class="campus-header-col">
          <span class="campus-title">{{ currentCampusName }}</span>
          <span class="weather-main-condition">{{ activeDay.headline }}</span>
        </div>
        <div class="campus-segmented-control" role="tablist" aria-label="校区切换">
          <button
            v-for="c in campusOptions"
            :key="c.id"
            type="button"
            class="campus-seg-btn"
            :class="{ active: store.campus === c.id }"
            @click="switchCampus(c.id)"
          >{{ c.short }}</button>
        </div>
      </div>

      <div class="weather-temp-row">
        <div class="temp-big-wrap">
          <Icon :name="getWeatherIcon(activeDay.text)" :size="48" color="#007AFF" />
          <span class="temp-number">{{ activeDay.temp }}</span>
          <span class="temp-unit">°C</span>
        </div>
        <span class="update-clock-text">{{ activeDay.aside }}</span>
      </div>

      <div class="weather-sub-metrics-grid">
        <div v-for="m in activeDay.metrics" :key="m.label" class="sub-metric-box">
          <div class="metric-icon-line">
            <Icon :name="m.icon" :size="16" :color="m.color || '#007AFF'" />
            <span class="m-label">{{ m.label }}</span>
          </div>
          <span class="m-val">{{ m.value }}</span>
        </div>
      </div>

      <div class="forecast-section">
        <div class="forecast-title-row">
          <span class="forecast-title">未来 3 天预报</span>
          <span class="forecast-source">点选查看当天详情</span>
        </div>
        <div class="forecast-cards-grid">
          <button
            v-for="(day, idx) in forecastDays"
            :key="day.iso || idx"
            type="button"
            class="forecast-mini-card"
            :class="{ 'today-card': selectedForecast === idx }"
            @click="selectedForecast = idx"
          >
            <span class="f-day-lbl">{{ day.label }}</span>
            <span class="f-day-date">{{ day.dateStr }}</span>
            <div class="f-day-icon-wrap">
              <Icon :name="getWeatherIcon(day.text)" :size="24" color="#007AFF" />
            </div>
            <span class="f-day-condition">{{ day.text }}</span>
            <span class="f-day-range">{{ day.range }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 2. 学期总览卡片 -->
    <section id="cw-calendar" class="cw-card semester-overview-card">
      <div class="card-head-line">
        <h2 class="card-head-title">学期总览</h2>
        <span class="status-badge" :class="termStatusClass">{{ termStatusLabel }}</span>
      </div>

      <div class="overview-info-grid">
        <div class="info-cell">
          <div class="info-cell-icon-wrap">
            <Icon name="school-cap" :size="18" color="#007AFF" />
          </div>
          <div class="info-cell-texts">
            <span class="c-lbl">学年</span>
            <span class="c-val">{{ termYearLabel }}</span>
          </div>
        </div>
        <div class="info-cell">
          <div class="info-cell-icon-wrap">
            <Icon name="book" :size="18" color="#34C759" />
          </div>
          <div class="info-cell-texts">
            <span class="c-lbl">学期</span>
            <span class="c-val">{{ termNameLabel }}</span>
          </div>
        </div>
        <div class="info-cell">
          <div class="info-cell-icon-wrap">
            <Icon name="location" :size="18" color="#FF9500" />
          </div>
          <div class="info-cell-texts">
            <span class="c-lbl">开始日期</span>
            <span class="c-val">{{ termStartLabel }}</span>
          </div>
        </div>
        <div class="info-cell">
          <div class="info-cell-icon-wrap">
            <Icon name="calendar-grid" :size="18" color="#AF52DE" />
          </div>
          <div class="info-cell-texts">
            <span class="c-lbl">结束日期</span>
            <span class="c-val">{{ termEndLabel }}</span>
          </div>
        </div>
      </div>

      <p v-if="!termRange" class="term-unconfigured">学期起止尚未配置。同步课表后，这里才计算进度。</p>

      <!-- 进度条 -->
      <div v-else class="progress-block">
        <div class="progress-label-row">
          <span>本学期进度</span>
          <span class="p-pct">{{ termRange.pct }}%</span>
        </div>
        <div class="progress-rail">
          <div class="progress-bar-fill" :style="{ width: termRange.pct + '%' }"></div>
        </div>
      </div>

      <!-- 已过天数 / 剩余天数 / 总天数 -->
      <div v-if="termRange" class="days-stat-row">
        <div class="days-stat-col">
          <span class="ds-lbl">已过天数</span>
          <span class="ds-num">{{ termRange.passed }} <small>天</small></span>
        </div>
        <div class="days-stat-col highlight-col">
          <span class="ds-lbl">剩余天数</span>
          <span class="ds-num highlight">{{ termRange.remaining }} <small>天</small></span>
        </div>
        <div class="days-stat-col">
          <span class="ds-lbl">总天数</span>
          <span class="ds-num">{{ termRange.total }} <small>天</small></span>
        </div>
      </div>
    </section>

    <!-- 3. 学期时间轴 -->
    <section class="cw-card timeline-milestone-card">
      <div class="card-head-line">
        <h2 class="card-head-title">学期时间轴</h2>
        <span class="week-pill-badge">{{ teachingWeekLabel }}</span>
      </div>

      <div class="timeline-visual-bar">
        <div class="timeline-line"></div>
        <div class="timeline-marker start" :class="{ reached: !!termRange }"></div>
        <div v-if="termRange" class="timeline-marker now active" :style="{ left: termRange.pct + '%' }"></div>
        <div class="timeline-marker end"></div>
      </div>

      <div class="timeline-nodes-labels">
        <div class="t-node">
          <span class="tn-title">开学</span>
          <span class="tn-date">{{ termStartLabel }}</span>
        </div>
        <div class="t-node center">
          <span class="tn-title">今天</span>
          <span class="tn-date">{{ todayFmt }}</span>
        </div>
        <div class="t-node right">
          <span class="tn-title">结课</span>
          <span class="tn-date">{{ termEndLabel }}</span>
        </div>
      </div>
    </section>

    <!-- 4. 学期日历 (按月展示，标注节假日与开学结课) -->
    <section class="cw-card academic-calendar-card">
      <div class="card-head-line">
        <h2 class="card-head-title">学期日历</h2>
        <span class="total-weeks-badge">{{ totalWeeksLabel }}</span>
      </div>

      <p class="calendar-card-intro">
        按月展示学期日期，点击可切换月份与查看重大教学节点。
      </p>

      <div class="calendar-legends-row">
        <span class="c-legend"><i class="dot blue"></i>今天</span>
        <span class="c-legend"><i class="dot purple"></i>开学</span>
        <span class="c-legend"><i class="dot orange"></i>结课</span>
        <span class="c-legend"><i class="dot red"></i>周末</span>
      </div>

      <!-- Stats pill -->
      <div class="calendar-metrics-strip">
        <div class="cm-item">当前周 <strong class="c-blue">{{ teachingWeekLabel }}</strong></div>
        <div class="cm-divider"></div>
        <div class="cm-item">总周数 <strong class="c-purple">{{ totalWeeksShort }}</strong></div>
        <div class="cm-divider"></div>
        <div class="cm-item">学期天数 <strong class="c-green">{{ totalDaysLabel }}</strong></div>
      </div>

      <!-- Month Switcher -->
      <div class="calendar-month-header">
        <button class="month-nav-btn" aria-label="上个月" @click="prevMonth">‹</button>
        <span class="month-title-text">{{ currentYearMonthStr }}</span>
        <button class="month-nav-btn" aria-label="下个月" @click="nextMonth">›</button>
      </div>

      <!-- Calendar Table Grid -->
      <div class="month-days-table">
        <div class="week-name-header-row">
          <span v-for="d in ['一', '二', '三', '四', '五', '六', '日']" :key="d" class="wn-col">{{ d }}</span>
        </div>
        <div class="days-cells-grid">
          <div
            v-for="(cell, ci) in monthDaysCells"
            :key="ci"
            class="day-grid-cell"
            :class="{
              'not-current-month': !cell.currentMonth,
              'is-today': cell.isToday,
              'is-weekend': cell.isWeekend,
              'is-start': cell.isStart,
              'is-end': cell.isEnd,
              'is-holiday': cell.isHoliday
            }"
            @click="selectDayCell(cell)"
          >
            <span class="day-num">{{ cell.dayNum }}</span>
            <span v-if="cell.tag" class="day-dot-badge">{{ cell.tag }}</span>
          </div>
        </div>
      </div>

      <!-- Milestone Event Details -->
      <div v-if="selectedDayDetail" class="selected-day-banner">
        <strong>{{ selectedDayDetail.date }}:</strong> {{ selectedDayDetail.title }}
      </div>
    </section>

    <!-- 5. 使用说明 -->
    <section class="cw-card instructions-card">
      <div class="card-head-line">
        <h2 class="card-head-title">使用说明</h2>
      </div>
      <ol class="instructions-list">
        <li>校历信息来源于重庆交通大学教务处官方校历公告（2026-07-27发布）。</li>
        <li>当前天气已接入科学城校区与南岸校区高精度实时气象数据。</li>
        <li>短期天气预报包含未来 3 天气温、风力与降水概率。</li>
        <li>具体课程、补考与期末考试安排请以教务系统最新通知为准。</li>
        <li>点击学期日历中的日期，可查看对应的教学周次与重要日程。</li>
      </ol>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showDialog } from 'vant'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import { useWidgetPage } from '@/composables/useWidgetPage'
import { widgetExpand } from '@/composables/useWidgetExpand'
import { calcWeekNumber } from '@/utils/scheduleModel.js'

const router = useRouter()
const route = useRoute()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()
const focus = computed(() => widgetExpand.focus || route.query.focus || '')

// State
const viewYear = ref(2026)
const viewMonth = ref(8) // 0-indexed: 8 is September
const selectedDayDetail = ref(null)
const selectedForecast = ref(0)
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const campusOptions = [
  { id: 'kexuecheng', short: '科学城' },
  { id: 'nanan', short: '南岸' }
]

const currentCampusName = computed(() => {
  return store.campus === 'nanan' ? '南岸校区' : '科学城校区'
})

const currentTemp = computed(() => {
  return store.weather?.temperature ?? null
})

const weatherText = computed(() => {
  const text = String(store.weather?.text || '').trim()
  if (text) return text
  return store.weatherLoading ? '同步中…' : '未同步'
})

const weatherSyncLabel = computed(() => {
  if (store.weatherLoading) return '正在同步'
  if (!String(store.weather?.text || '').trim()) return '尚未同步'
  return '已同步天气'
})

const teachingWeekLabel = computed(() => {
  const week = store.currentWeek
  if (week == null || !Number.isFinite(week)) return '教学周待确认'
  if (week < 1) return '尚未开学'
  return '第 ' + week + ' 周'
})

function getWeatherIcon(text) {
  const s = String(text || '')
  if (!s || s === '未同步' || s.includes('同步')) return 'weather-cloud'
  if (s.includes('雷')) return 'weather-thunder'
  if (s.includes('雨')) return 'weather-rain'
  if (s.includes('雪')) return 'weather-cloud'
  if (s.includes('风')) return 'weather-wind'
  if (s.includes('多云') || s.includes('阴')) return 'weather-cloud'
  if (s.includes('晴间多云') || s.includes('少云')) return 'weather-sun-cloud'
  return 'weather-sun'
}

function parseIsoDate(iso) {
  if (!iso) return null
  const p = String(iso).slice(0, 10).split('-')
  if (p.length !== 3) return null
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}

function localYmd(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

const forecastDays = computed(() => {
  const days = store.weather?.days || []
  const todayIso = localYmd()
  return [0, 1, 2].map(i => {
    const data = days[i] || {}
    const d = parseIsoDate(data.date) || (() => {
      const x = new Date()
      x.setHours(0, 0, 0, 0)
      x.setDate(x.getDate() + i)
      return x
    })()
    const iso = data.date || localYmd(d)
    const isToday = iso === todayIso
    return {
      idx: i,
      iso,
      isToday,
      label: isToday ? '今天' : WEEKDAY_CN[d.getDay()],
      weekday: WEEKDAY_CN[d.getDay()],
      dateStr: (d.getMonth() + 1) + '/' + d.getDate(),
      dateLong: (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEKDAY_CN[d.getDay()],
      text: isToday
        ? (String(store.weather?.text || data.text || '').trim() || (store.weatherLoading ? '同步中…' : '未同步'))
        : (String(data.text || '').trim() || '未同步'),
      tmin: data.tmin,
      tmax: data.tmax,
      range: (data.tmin != null ? data.tmin + '°' : '--') + ' / ' + (data.tmax != null ? data.tmax + '°' : '--'),
      precipProb: data.precipProb,
      precipSum: data.precipSum,
      wind: data.wind,
      uv: data.uv,
      sunrise: data.sunrise,
      sunset: data.sunset,
      apparent: data.apparent
    }
  })
})

const updateTimeStr = computed(() => {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
})

const activeDay = computed(() => {
  const list = forecastDays.value
  const day = list[selectedForecast.value] || list[0] || {}
  const w = store.weather || {}
  if (day.isToday) {
    const dir = w.windDir ? w.windDir + '风 ' : ''
    return {
      headline: (day.weekday || '今天') + ' · ' + (w.text || day.text || weatherText.value),
      text: w.text || day.text || weatherText.value,
      temp: w.temperature ?? day.tmax ?? '--',
      aside: String(w.text || '').trim() ? (updateTimeStr.value + ' 更新') : (store.weatherLoading ? '正在同步' : '尚未同步'),
      metrics: [
        { icon: 'weather-thermometer', label: '体感温度', value: (Number.isFinite(w.apparent) ? w.apparent : (Number.isFinite(day.apparent) ? day.apparent : '--')) + '°C' },
        { icon: 'weather-drop', label: '湿度', value: (w.humidity != null ? w.humidity + '%' : '--') },
        { icon: 'weather-wind', label: '风向风力', value: dir + (w.wind ?? day.wind ?? '--') + ' km/h', color: '#8E8E93' }
      ]
    }
  }
  const rain = day.precipProb != null ? day.precipProb + '%' : (day.precipSum != null ? day.precipSum + ' mm' : '--')
  const sun = (day.sunrise || '--') + ' / ' + (day.sunset || '--')
  return {
    headline: (day.dateLong || day.label) + ' · ' + (day.text || '未同步'),
    text: day.text || '未同步',
    temp: day.tmax ?? '--',
    aside: '最高 ' + (day.tmax ?? '--') + '°  最低 ' + (day.tmin ?? '--') + '°',
    metrics: [
      { icon: 'weather-drop', label: '降水概率', value: rain },
      { icon: 'weather-sun', label: '紫外线', value: day.uv != null ? String(day.uv) : '--' },
      { icon: 'weather-sun-cloud', label: '日出 / 日落', value: sun }
    ]
  }
})

// 已核对的学期结课日。没有写进学期配置的开学日，不借用这段日期。
const KNOWN_TERM = {
  '2026-09-07': { end: '2027-01-17', year: '2026-2027', name: '第一学期' }
}

function localDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const termStartIso = computed(() => {
  const calendar = store.calendar
  const fromCalendar = calendar?.semesterStartKnown ? String(calendar.semesterStart || '').slice(0, 10) : ''
  const fromStore = String(store.semesterStart || '').slice(0, 10)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(fromCalendar) ? fromCalendar : fromStore
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ''
})

const termRange = computed(() => {
  const startIso = termStartIso.value
  const endIso = KNOWN_TERM[startIso]?.end
  const start = localDate(startIso)
  const end = localDate(endIso)
  if (!start || !end) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const total = Math.round((end - start) / (24 * 3600 * 1000)) + 1
  if (total < 1) return null
  const passedRaw = Math.round((today - start) / (24 * 3600 * 1000))
  const passed = Math.max(0, Math.min(passedRaw, total))
  const weeks = calcWeekNumber(endIso, startIso)
  let status = '进行中'
  if (passedRaw < 0) status = '尚未开学'
  else if (passedRaw >= total) status = '已结束'
  return {
    startIso,
    endIso,
    total,
    passed,
    remaining: Math.max(0, total - passed),
    pct: Math.round((passed / total) * 100),
    weeks: Number.isFinite(weeks) && weeks >= 1 ? weeks : null,
    status
  }
})

const termStatusLabel = computed(() => termRange.value?.status || (termStartIso.value ? '结课日未配置' : '未配置'))
const termStatusClass = computed(() => {
  const status = termStatusLabel.value
  if (status === '进行中') return 'running'
  if (status === '尚未开学') return 'pending'
  if (status === '已结束') return 'ended'
  return 'unknown'
})
const termYearLabel = computed(() => {
  const text = String(store.calendar?.semesterText || store.semesterText || '')
  const match = text.match(/(\d{4}-\d{4})/)
  if (match) return match[1]
  return KNOWN_TERM[termStartIso.value]?.year || '未配置'
})
const termNameLabel = computed(() => {
  const text = String(store.calendar?.semesterText || store.semesterText || '')
  const match = text.match(/第[一二三四五六七八九十\d]+学期/)
  if (match) return match[0]
  return KNOWN_TERM[termStartIso.value]?.name || '未配置'
})
const termStartLabel = computed(() => termStartIso.value || '未配置')
const termEndLabel = computed(() => termRange.value?.endIso || '未配置')
const totalWeeksLabel = computed(() => termRange.value?.weeks ? `共 ${termRange.value.weeks} 周` : '周数待确认')
const totalWeeksShort = computed(() => termRange.value?.weeks ? `${termRange.value.weeks}周` : '待确认')
const totalDaysLabel = computed(() => termRange.value ? `${termRange.value.total}天` : '待确认')

const todayFmt = computed(() => {
  const d = new Date()
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
})

// Calendar Month Grid
const currentYearMonthStr = computed(() => {
  return viewYear.value + '年' + (viewMonth.value + 1) + '月'
})

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}

// Special milestone dates
const MILESTONES = {
  '2026-09-07': { type: 'start', tag: '开学', title: '秋学期正式上课' },
  '2026-09-25': { type: 'holiday', tag: '中秋', title: '中秋节放假' },
  '2026-10-01': { type: 'holiday', tag: '国庆', title: '国庆节放假' },
  '2026-10-16': { type: 'event', tag: '校运', title: '新生达标运动会' },
  '2026-11-07': { type: 'event', tag: '校庆', title: '重庆交通大学75周年校庆日' },
  '2027-01-01': { type: 'holiday', tag: '元旦', title: '元旦放假' },
  '2027-01-17': { type: 'end', tag: '结课', title: '第一学期结束，寒假开始' },
  '2027-02-22': { type: 'start', tag: '开学', title: '春学期正式上课' }
}

const monthDaysCells = computed(() => {
  const year = viewYear.value
  const month = viewMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday-first offset (0 for Mon, 6 for Sun)
  const startOffset = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()

  const today = new Date()
  const todayIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')

  const cells = []

  // Preceding month days
  const prevLastDay = new Date(year, month, 0).getDate()
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({
      dayNum: prevLastDay - i,
      currentMonth: false,
      isWeekend: false
    })
  }

  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    const curDate = new Date(year, month, d)
    const dayOfWeek = (curDate.getDay() + 6) % 7
    const iso = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ms = MILESTONES[iso]
    const hits = calendarHits(iso)
    const titles = []
    if (ms?.title) titles.push(ms.title)
    for (const event of hits) {
      if (event.title && event.title !== ms?.title) titles.push(event.title)
    }
    const extraTag = hits.map(event => eventTag(event, iso)).find(Boolean) || ''
    cells.push({
      dayNum: d,
      currentMonth: true,
      iso,
      isToday: iso === todayIso,
      isWeekend: dayOfWeek >= 5,
      isStart: ms?.type === 'start',
      isEnd: ms?.type === 'end',
      isHoliday: ms?.type === 'holiday' || hits.some(event => event.type === 'holiday' || event.type === 'vacation'),
      tag: ms?.tag || extraTag,
      title: titles.join('；')
    })
  }

  // Next month trailing days to fill complete rows (multiple of 7)
  const remaining = (7 - (cells.length % 7)) % 7
  for (let i = 1; i <= remaining; i++) {
    cells.push({
      dayNum: i,
      currentMonth: false,
      isWeekend: false
    })
  }

  return cells
})

function calendarHits(iso) {
  const events = Array.isArray(store.calendar?.events) ? store.calendar.events : []
  return events.filter(event => {
    const start = String(event?.date || '').slice(0, 10)
    const end = String(event?.endDate || event?.date || '').slice(0, 10)
    return !!start && iso >= start && iso <= end
  })
}

function eventTag(event, iso) {
  const start = String(event?.date || '').slice(0, 10)
  if (!event?.title || (start && start !== iso)) return ''
  return String(event.title).slice(0, 2)
}

function selectDayCell(cell) {
  if (!cell.currentMonth || !cell.iso) return
  const week = store.semesterStart ? calcWeekNumber(cell.iso, store.semesterStart) : null
  const weekText = week == null || !Number.isFinite(week)
    ? '教学周待确认'
    : (week < 1 ? '尚未开学' : '第' + week + '周')
  const note = cell.title ? ('校历标注：' + cell.title) : '常规教学日'
  selectedDayDetail.value = { date: cell.iso, title: weekText + ' · ' + note }
}

async function switchCampus(id) {
  if (!id || id === store.campus) return
  await store.fetchWeather(id)
}

async function refresh() {
  showToast({ message: '正在同步校历与天气...', duration: 0 })
  await Promise.all([store.fetchWeather(), store.fetchCalendar()])
  if (store.weatherError || store.calendarError) showToast(store.weatherError || store.calendarError)
  else showToast('校历与天气已同步')
}

function showInfoModal() {
  showDialog({
    title: '校历数据说明',
    message: '本校历来源于重庆交通大学教务处官方校历公告：\n2026-2027 学年第一学期于 2026 年 9 月 7 日正式行课，2027 年 1 月 17 日结课。\n\n天气支持科学城与南岸两校区实时自动更新。',
    confirmButtonText: '确定',
    confirmButtonColor: '#007AFF'
  })
}

function scrollToFocus() {
  const key = String(focus.value || '')
  const id = key === 'calendar' ? 'cw-calendar' : key === 'weather' ? 'cw-weather' : ''
  if (!id) return
  const el = document.getElementById(id)
  if (!el) return
  const scroller = el.closest('.widget-overlay-inner') || window
  const top = el.getBoundingClientRect().top
  const originTop = scroller === window ? 0 : scroller.getBoundingClientRect().top
  const offset = (scroller === window ? window.scrollY : scroller.scrollTop) + (top - originTop) - 8
  if (scroller === window) window.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
  else scroller.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
}

onMounted(async () => {
  store.fetchWeather()
  store.fetchCalendar()
  await nextTick()
  window.setTimeout(scrollToFocus, 80)
  window.setTimeout(scrollToFocus, 520)
})
</script>

<style scoped>
.calendar-weather-page {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(var(--safe-top, 0px) + 12px) 14px calc(var(--safe-bottom, 0px) + 24px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Nav */
.cw-top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
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

.nav-title-col {
  text-align: center;
  flex: 1;
}

.nav-title {
  font-size: 18px;
  font-weight: 700;
  color: #000000;
  line-height: 1.25;
}

.nav-actions {
  display: flex;
  gap: 8px;
}

/* Status bar */
.cw-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.status-left {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(60, 60, 67, 0.60);
  font-weight: 500;
}

.term-pill-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 122, 255, 0.08);
  color: #007AFF;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
}

/* Common Card Base — 不透明纯白卡片，无玻璃渐变，无彩条边框 */
.cw-card {
  position: relative;
  background: #FFFFFF;
  border-radius: 14px;
  padding: 16px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.card-head-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-head-title {
  font-size: 17px;
  font-weight: 700;
  color: #000000;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 8px;
}
.status-badge.running {
  background: rgba(52, 199, 89, 0.12);
  color: #34C759;
}
.status-badge.pending {
  background: rgba(255, 149, 0, 0.12);
  color: #C93400;
}
.status-badge.ended,
.status-badge.unknown {
  background: rgba(142, 142, 147, 0.16);
  color: #636366;
}
.term-unconfigured {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #636366;
}

.week-pill-badge,
.total-weeks-badge {
  background: #F2F2F7;
  color: rgba(60, 60, 67, 0.70);
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 8px;
}

/* 1. Weather Card */
.weather-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.campus-header-col {
  display: flex;
  flex-direction: column;
}

.campus-title {
  font-size: 18px;
  font-weight: 700;
  color: #000000;
}

.weather-main-condition {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
  margin-top: 2px;
}

/* Apple 标准分段控制器 (Segmented Control) */
.campus-segmented-control {
  display: flex;
  background: rgba(118, 118, 128, 0.12);
  padding: 2px;
  border-radius: 8px;
}

.campus-seg-btn {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(60, 60, 67, 0.70);
  min-height: 44px;
  min-width: 44px;
  transition: background 0.12s ease, color 0.12s ease;
}

.campus-seg-btn.active {
  background: #FFFFFF;
  color: #000000;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.weather-temp-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.temp-big-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.temp-number {
  font-size: 52px;
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.03em;
  line-height: 1;
}

.temp-unit {
  font-size: 20px;
  font-weight: 600;
  color: rgba(60, 60, 67, 0.50);
}

.update-clock-text {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
}

.weather-sub-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.sub-metric-box {
  background: #F2F2F7;
  border-radius: 10px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.metric-icon-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.m-label {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.60);
}

.m-val {
  font-size: 15px;
  font-weight: 700;
  color: #000000;
}

.forecast-section {
  border-top: 0.5px solid rgba(60, 60, 67, 0.12);
  padding-top: 12px;
}

.forecast-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.forecast-title {
  font-size: 14px;
  font-weight: 600;
  color: #000000;
}

.forecast-source {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.50);
}

.forecast-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.forecast-mini-card {
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  background: #F9F9FB;
  border-radius: 10px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.forecast-mini-card.today-card {
  background: #EBF3FF;
  border: 1.5px solid #007AFF;
}

.f-day-lbl {
  font-size: 13px;
  font-weight: 600;
  color: #000000;
}

.f-day-date {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
  margin-top: 1px;
}

.f-day-icon-wrap {
  margin: 6px 0;
}

.f-day-condition {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.80);
}

.f-day-range {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
  margin-top: 2px;
}

/* 2. Overview Card */
.overview-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.info-cell {
  background: #F2F2F7;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.info-cell-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.info-cell-texts {
  display: flex;
  flex-direction: column;
}

.c-lbl {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
}

.c-val {
  font-size: 14px;
  font-weight: 600;
  color: #000000;
  margin-top: 1px;
}

.progress-block {
  margin-bottom: 16px;
}

.progress-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(60, 60, 67, 0.70);
  margin-bottom: 6px;
}

.p-pct {
  font-weight: 700;
  color: #007AFF;
}

.progress-rail {
  height: 6px;
  background: rgba(60, 60, 67, 0.12);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  background: #007AFF;
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.days-stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}

.days-stat-col {
  background: #F2F2F7;
  border-radius: 10px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.days-stat-col.highlight-col {
  background: #EBF3FF;
}

.ds-lbl {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
}

.ds-num {
  font-size: 20px;
  font-weight: 700;
  color: #000000;
}

.ds-num.highlight {
  color: #007AFF;
}

.ds-num small {
  font-size: 12px;
  font-weight: 500;
}

/* 3. Timeline Card */
.timeline-visual-bar {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
  margin: 12px 10px 4px;
}

.timeline-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(60, 60, 67, 0.12);
  border-radius: 2px;
}

.timeline-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #FFFFFF;
  border: 3px solid rgba(60, 60, 67, 0.30);
  transform: translate(-50%, 0);
  z-index: 2;
}

.timeline-marker.start {
  left: 0;
  transform: none;
}

.timeline-marker.start.reached {
  border-color: #007AFF;
  background: #007AFF;
}

.timeline-marker.now.active {
  border-color: #007AFF;
  background: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.20);
}

.timeline-marker.end {
  right: 0;
  transform: none;
}

.timeline-nodes-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}

.t-node {
  display: flex;
  flex-direction: column;
}

.t-node.center {
  text-align: center;
}

.t-node.right {
  text-align: right;
}

.tn-title {
  font-size: 12px;
  font-weight: 600;
  color: #000000;
}

.tn-date {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.60);
  margin-top: 1px;
}

/* 4. Calendar Card */
.calendar-card-intro {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.70);
  line-height: 1.4;
  margin-bottom: 12px;
}

.calendar-legends-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.c-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(60, 60, 67, 0.70);
}

.c-legend .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.c-legend .dot.blue {
  background: #007AFF;
}

.c-legend .dot.purple {
  background: #AF52DE;
}

.c-legend .dot.orange {
  background: #FF9500;
}

.c-legend .dot.red {
  background: #FF3B30;
}

.calendar-metrics-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: #F2F2F7;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 14px;
}

.cm-item {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.70);
}

.cm-item strong {
  margin-left: 2px;
}

.c-blue {
  color: #007AFF;
}

.c-purple {
  color: #AF52DE;
}

.c-green {
  color: #34C759;
}

.cm-divider {
  width: 0.5px;
  height: 14px;
  background: rgba(60, 60, 67, 0.20);
}

.calendar-month-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.month-nav-btn {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  background: #FFFFFF;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000000;
}

.month-title-text {
  font-size: 16px;
  font-weight: 700;
  color: #000000;
}

.month-days-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.week-name-header-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  padding-bottom: 4px;
}

.wn-col {
  font-size: 12px;
  font-weight: 600;
  color: rgba(60, 60, 67, 0.60);
}

.days-cells-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-grid-cell {
  height: 40px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: background 0.1s ease;
}

.day-grid-cell:active {
  background: rgba(0, 0, 0, 0.04);
}

.day-grid-cell.not-current-month {
  opacity: 0.25;
}

.day-grid-cell.is-weekend:not(.is-today) .day-num {
  color: #FF3B30;
}

.day-num {
  font-size: 14px;
  font-weight: 500;
  color: #000000;
}

.day-grid-cell.is-today .day-num {
  background: #007AFF;
  color: #FFFFFF;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.day-dot-badge {
  font-size: 9px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 3px;
  position: absolute;
  bottom: 1px;
  font-weight: 600;
}

.is-start .day-dot-badge {
  background: rgba(175, 82, 222, 0.15);
  color: #AF52DE;
}

.is-end .day-dot-badge {
  background: rgba(255, 149, 0, 0.15);
  color: #FF9500;
}

.is-holiday .day-dot-badge {
  background: rgba(255, 59, 48, 0.15);
  color: #FF3B30;
}

.selected-day-banner {
  margin-top: 12px;
  padding: 8px 12px;
  background: #F2F2F7;
  border-radius: 8px;
  font-size: 13px;
  color: #000000;
}

/* 5. Instructions Card */
.instructions-list {
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.instructions-list li {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.70);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .nav-icon-btn,
  .month-nav-btn,
  .campus-seg-btn,
  .forecast-mini-card,
  .progress-bar-fill {
    transition: none !important;
    transform: none !important;
  }
}
</style>
