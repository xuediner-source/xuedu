<template>
  <div class="page-container exam-page">
    <header class="page-header">
      <div class="header-main">
        <h1 class="page-title">考试日程</h1>
      </div>
      <button class="action-chip" @click="refresh" aria-label="刷新考试安排">
        <Icon name="refresh" :size="16" color="#007AFF" />
        <span>刷新</span>
      </button>
    </header>

    <!-- Loading -->
    <div v-if="store.examLoading && !store.exams.length" class="loading-container">
      <div class="state-icon-box">
        <van-loading type="spinner" color="var(--primary)" size="28px" />
      </div>
      <p>正在加载中</p>
      <span class="empty-sub">正在同步教务考务日程</span>
    </div>

    <template v-else-if="store.exams.length > 0">
      <!-- Exam Overview Card: 白分组，非玻璃仪表 -->
      <section class="overview-card">
        <div class="overview-header">
          <h2 class="overview-title">考务总览</h2>
          <span class="overview-update">正在考试 {{ examStats.ongoing }} 门</span>
        </div>
        <div class="overview-grid">
          <div class="overview-item">
            <span class="overview-value">{{ examStats.total }}</span>
            <span class="overview-label">应考门数</span>
          </div>
          <div class="overview-item">
            <span class="overview-value">{{ examStats.pending }}</span>
            <span class="overview-label">未开始</span>
          </div>
          <div class="overview-item">
            <span class="overview-value">{{ examStats.passed }}</span>
            <span class="overview-label">已结束</span>
          </div>
          <div class="overview-item">
            <span class="overview-value" :class="{ 'has-upcoming': examStats.upcoming > 0 }">{{ examStats.upcoming }}</span>
            <span class="overview-label">7天内临近</span>
          </div>
        </div>
      </section>

      <!-- Exam List: Inset Grouped 清晰白列表与发丝分隔 -->
      <div class="exam-grouped-card">
        <div
          v-for="(exam, i) in sortedExams"
          :key="i"
          class="exam-list-row"
          @click="showExamDetail(exam)"
          role="button"
          tabindex="0"
          :aria-label="`${exam.courseName}，${exam.examTime}，${exam.examRoom}，查看详情`"
          @keydown.enter="showExamDetail(exam)"
          @keydown.space.prevent="showExamDetail(exam)"
        >
          <div class="exam-main-col">
            <div class="exam-title-row">
              <h3 class="exam-course-name">{{ exam.courseName }}</h3>
              <span class="exam-status-tag" :class="getExamStatusClass(exam)">
                {{ getExamStatusText(exam) }}
              </span>
            </div>

            <div class="exam-info-grid">
              <div class="info-line" v-if="exam.examTime">
                <Icon name="clock" :size="13" color="#8E8E93" />
                <span>{{ exam.examTime }}</span>
              </div>
              <div class="info-line" v-if="exam.examRoom">
                <Icon name="location" :size="13" color="#8E8E93" />
                <span>{{ exam.examRoom }}</span>
              </div>
              <div class="info-tags-row" v-if="exam.seatNumber || exam.teacher || exam.examSession">
                <span class="info-badge" v-if="exam.seatNumber">座位号: {{ exam.seatNumber }}</span>
                <span class="info-badge" v-if="exam.examSession">{{ exam.examSession }}</span>
                <span class="info-badge" v-if="exam.teacher">{{ exam.teacher }}</span>
              </div>
            </div>
          </div>

          <Icon name="chevron-right" :size="14" color="#C7C7CC" />
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <div class="empty-icon state-icon-box">
        <Icon name="exam" :size="36" color="var(--primary)" />
      </div>
      <p>暂无待参加的考试安排</p>
      <span class="empty-sub">教务排考录入后，考场、座次将第一时间在此呈现</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showDialog } from 'vant'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import { getExamDateDistance, getExamStatus as resolveExamStatus } from '@/utils/examTime'

const router = useRouter()
const store = useAppStore()

const examStats = computed(() => {
  const exams = store.exams
  const total = exams.length
  let pending = 0
  let ongoing = 0
  let passed = 0
  let upcoming = 0

  const now = store.clock

  exams.forEach(exam => {
    const status = resolveExamStatus(exam.examTime, now)
    if (status === 'pending') pending++
    if (status === 'ongoing') ongoing++
    if (status === 'passed') passed++

    const daysAway = getExamDateDistance(exam.examTime, now)
    if (status === 'pending' && daysAway !== null && daysAway >= 0 && daysAway <= 7) upcoming++
  })

  return { total, pending, ongoing, passed, upcoming }
})

const sortedExams = computed(() => {
  return [...store.exams].sort((a, b) => {
    const dateA = a.examTime || ''
    const dateB = b.examTime || ''
    return dateA.localeCompare(dateB)
  })
})

function getExamStatusClass(exam) {
  return resolveExamStatus(exam.examTime, store.clock)
}

function getExamStatusText(exam) {
  const status = resolveExamStatus(exam.examTime, store.clock)
  const map = { pending: '未开始', ongoing: '正在考试', passed: '已结束', unknown: '时间待定' }
  return map[status] || map.unknown
}

function showExamDetail(exam) {
  let detail = `考核课程：${exam.courseName}`
  detail += `\n主考教师：${exam.teacher || '未知'}`
  detail += `\n考核时间：${exam.examTime || '待定'}`
  detail += `\n考场地点：${exam.examRoom || '待定'}`
  detail += `\n分配座次：${exam.seatNumber ? '第 ' + exam.seatNumber + ' 号' : '待分配'}`
  if (exam.examSession) detail += `\n考核场次：${exam.examSession}`
  if (exam.remark) detail += `\n考务备注：${exam.remark}`

  showDialog({
    title: '考务详细信息',
    message: detail,
    confirmButtonText: '了解',
    confirmButtonColor: 'var(--primary, #007AFF)'
  })
}

async function refresh() {
  showToast({ message: '正在同步考试安排...', duration: 0 })
  await store.fetchExams()
  if (store.examError) showToast(store.examError)
  else showToast('考试安排已同步')
}

onMounted(() => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  store.fetchExams()
})
</script>

<style scoped>
.exam-page {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(var(--safe-top, 0px) + 12px) 16px var(--dock-clearance, 82px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  margin-bottom: 16px;
}

.header-main {
  flex: 1;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin: 0;
}

.action-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: none;
  background: var(--bg-surface, #FFFFFF);
  color: var(--primary, #007AFF);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: opacity 0.15s ease;
}
.action-chip:active {
  opacity: 0.7;
}

/* Loading & Empty State */
.loading-container,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 10px;
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary, #8E8E93);
  text-align: center;
}

.state-icon-box {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 122, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-tertiary, #C7C7CC);
}

/* Exam Overview Card —— Inset Grouped 白盒 */
.overview-card {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}

.overview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0;
}

.overview-update {
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.overview-item {
  text-align: center;
}

.overview-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.overview-value.has-upcoming {
  color: #FF9500;
}

.overview-label {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  white-space: nowrap;
}

/* Exam Grouped Card */
.exam-grouped-card {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
}

.exam-list-row {
  padding: 14px 16px;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  border-bottom: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
  transition: background 0.1s ease;
}

.exam-list-row:last-child {
  border-bottom: none;
}

.exam-list-row:active {
  background: rgba(0, 0, 0, 0.03);
}

.exam-main-col {
  flex: 1;
  min-width: 0;
}

.exam-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.exam-course-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.exam-status-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.exam-status-tag.pending {
  color: #007AFF;
  background: rgba(0, 122, 255, 0.1);
}

.exam-status-tag.ongoing {
  color: #1E6FB8;
  background: rgba(61, 155, 232, 0.16);
}

.exam-status-tag.passed {
  color: #8E8E93;
  background: rgba(142, 142, 147, 0.12);
}

.exam-status-tag.unknown {
  color: var(--text-secondary, #4A6A82);
  background: var(--bg-app, #EEF5FA);
}

.exam-info-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, #8E8E93);
}

.info-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.info-badge {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
