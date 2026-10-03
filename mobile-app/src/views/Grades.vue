<template>
  <div class="page-container grades-page">
    <!-- Header: Apple HIG Title 1 + Refresh button -->
    <header class="page-header">
      <button v-if="fromWidget" class="nav-icon-btn" type="button" @click="closeToWidget" aria-label="返回">
        <Icon name="arrow-left" :size="20" color="#000000" />
      </button>
      <div class="header-main">
        <h1 class="page-title">课程成绩</h1>
      </div>
      <button class="action-chip" type="button" :disabled="store.gradesLoading" @click="refresh" aria-label="刷新成绩">
        <Icon name="refresh" :size="16" color="#007AFF" />
        <span>刷新</span>
      </button>
    </header>

    <!-- Loading -->
    <div v-if="store.gradesLoading && !store.grades.length" class="loading-container">
      <div class="state-icon-box">
        <van-loading type="spinner" color="var(--primary)" size="28px" />
      </div>
      <p>正在加载中</p>
      <span class="empty-sub">正在查询教务成绩</span>
    </div>

    <div v-else-if="gradesBlocked" class="empty-state">
      <div class="empty-icon state-icon-box">
        <Icon name="grades" :size="36" color="var(--primary)" />
      </div>
      <p>{{ store.sessionExpired ? '登录已过期' : store.gradesError }}</p>
      <span class="empty-sub">{{ store.sessionExpired ? '已保存的成绩仍会在重新登录后显示' : '请点重试，不会把失败当成没有成绩' }}</span>
      <button v-if="store.sessionExpired" class="action-chip" type="button" @click="router.push('/login')">重新登录</button>
      <button v-else class="action-chip" type="button" :disabled="store.gradesLoading" @click="refresh">重试</button>
    </div>

    <template v-else>
      <!-- Academic Summary Card: 白分组，不是玻璃仪表 -->
      <section v-if="store.grades.length" class="summary-card">
        <div class="summary-header">
          <h2 class="summary-title">学业总评</h2>
          <span class="summary-update">{{ summaryNote }}</span>
        </div>

        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-value">{{ stats.average }}</span>
            <span class="summary-label">平均分</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ stats.totalCredits }}</span>
            <span class="summary-label">总学分</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ stats.gpa }}</span>
            <span class="summary-label">平均绩点 (GPA)</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ stats.passed }}</span>
            <span class="summary-label">通过门数</span>
          </div>
        </div>

        <div v-if="creditByNature.length" class="credit-nature">
          <p class="credit-nature-title">学分构成（按课程性质）</p>
          <div class="credit-nature-list">
            <div v-for="row in creditByNature" :key="row.name" class="credit-nature-row">
              <div class="credit-nature-meta">
                <span class="credit-nature-name">{{ row.name }}</span>
                <span class="credit-nature-num">{{ row.credits }} 学分 · {{ row.count }} 门</span>
              </div>
              <div class="credit-nature-bar">
                <i :style="{ width: row.pct + '%' }"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Semester Filter Tabs (既有省略与切换行为不改) -->
      <div class="filter-tabs-wrap">
        <van-tabs
          v-model:active="semesterIndex"
          @change="filterGrades"
          sticky
          offset-top="0"
          color="var(--primary)"
          title-active-color="var(--primary)"
          line-width="24px"
          line-height="3px"
        >
          <van-tab title="全部学期" />
          <van-tab v-for="s in store.semesters" :key="s.value" :title="s.text" />
        </van-tabs>
      </div>

      <!-- Empty State -->
      <div v-if="filteredGrades.length === 0" class="empty-state">
        <div class="empty-icon state-icon-box">
          <Icon name="grades" :size="36" color="var(--primary)" />
        </div>
        <p>{{ store.grades.length ? '暂无符合条件的课程成绩' : '暂无已同步的课程成绩' }}</p>
        <span class="empty-sub">{{ store.grades.length ? '换一个学期再看' : '教务录入后，点刷新同步' }}</span>
      </div>

      <!-- Grade Cards List: Inset Grouped 整组白面与发丝分隔 -->
      <div class="grades-grouped-card" v-else>
        <div
          v-for="(g, i) in filteredGrades"
          :key="gradeKey(g, i)"
          class="grade-list-row"
          @click="showGradeDetail(g)"
          role="button"
          tabindex="0"
          :aria-label="`${g.courseName}，${g.score}分，${g.credit}学分`"
          @keydown.enter="showGradeDetail(g)"
          @keydown.space.prevent="showGradeDetail(g)"
        >
          <div class="grade-info-col">
            <h3 class="grade-course-name">{{ g.courseName }}</h3>
            <div class="grade-meta-text">
              <span v-if="g.credit">{{ g.credit }} 学分</span>
              <span v-if="g.courseNature"> · {{ g.courseNature }}</span>
              <span v-if="g.gpa"> · 绩点 {{ g.gpa }}</span>
            </div>
          </div>

          <div class="grade-score-col">
            <span class="grade-score-val" :class="{ 'is-fail': isFailScore(g.score) }">
              {{ g.score || '--' }}
            </span>
            <Icon name="chevron-right" :size="14" color="#C7C7CC" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showDialog } from 'vant'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import { summarizeGrades } from '@/utils/gradeSummary.js'
import { useWidgetPage } from '@/composables/useWidgetPage'
import { widgetExpand } from '@/composables/useWidgetExpand'

const router = useRouter()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()
const fromWidget = computed(() => widgetExpand.page === 'grades')
const semesterIndex = ref(0)
const filteredGrades = ref([])

function currentGrades() {
  if (semesterIndex.value === 0) return filteredGrades.value.length ? filteredGrades.value : store.grades
  return filteredGrades.value
}

const gradeSummary = computed(() => summarizeGrades(currentGrades()))
const gradesBlocked = computed(() => !store.grades.length && !!(store.gradesError || store.sessionExpired))
const summaryNote = computed(() => {
  if (store.sessionExpired) return '登录已过期，显示上次成功同步的成绩'
  if (store.gradesError) return store.gradesError
  return '以下为已加载成绩的估算，不是教务官方绩点'
})
const stats = computed(() => {
  const summary = gradeSummary.value
  return {
    totalCourses: summary.total,
    totalCredits: summary.credits.toFixed(1),
    average: summary.average == null ? '--' : summary.average.toFixed(1),
    gpa: summary.gpa == null ? '--' : summary.gpa.toFixed(2),
    passed: summary.passed + '/' + summary.total
  }
})

const creditByNature = computed(() => {
  const rows = gradeSummary.value.byNature
  const total = rows.reduce((sum, row) => sum + row.credits, 0)
  return rows.map(row => ({
    ...row,
    credits: row.credits.toFixed(1).replace(/\.0$/, ''),
    pct: total > 0 ? Math.max(6, Math.round((row.credits / total) * 100)) : 0
  }))
})

function gradeKey(grade, index) {
  return [grade.courseCode || grade.courseName || 'course', grade.semester || '', grade.score || '', index].join('-')
}

function filterGrades() {
  if (semesterIndex.value === 0) {
    filteredGrades.value = store.grades
  } else {
    const sem = store.semesters[semesterIndex.value - 1]
    filteredGrades.value = store.grades.filter(g => g.semester === sem.value)
  }
}

function isFailScore(score) {
  const n = parseFloat(score)
  if (!isNaN(n)) return n < 60
  if (typeof score === 'string') {
    return score.includes('不') || score.includes('缓') || score.includes('旷')
  }
  return false
}

function showGradeDetail(g) {
  showDialog({
    title: g.courseName,
    message: `总评成绩：${g.score || '未录入'}\n课程学分：${g.credit || '-'}\n所得绩点：${g.gpa || '-'}\n课程属性：${g.courseNature || '-'}\n考核方式：${g.examMethod || '-'}\n开课学期：${g.semester || '-'}`,
    confirmButtonText: '了解',
    confirmButtonColor: 'var(--primary, #007AFF)'
  })
}

async function refresh() {
  showToast({ message: '正在同步成绩...', duration: 0 })
  await store.fetchGrades()
  filterGrades()
  if (store.gradesError) showToast(store.gradesError)
  else showToast('成绩已同步')
}

onMounted(() => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  store.fetchGrades().then(() => filterGrades())
})
</script>

<style scoped>
.grades-page {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(var(--safe-top, 0px) + 12px) 16px calc(var(--dock-clearance, 82px) + 8px);
}

/* Apple HIG Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  margin-bottom: 16px;
}

.nav-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--bg-surface, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-right: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.nav-icon-btn:active {
  background: rgba(0, 0, 0, 0.05);
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
  min-height: 44px;
  height: 44px;
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
.action-chip:disabled {
  opacity: 0.45;
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

/* Academic Summary Card —— Inset Grouped 不透明白分组 */
.summary-card {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}

.summary-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0;
}

.summary-update {
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.summary-item {
  text-align: center;
}

.summary-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.summary-label {
  font-size: 11px;
  color: var(--text-secondary, #8E8E93);
  white-space: nowrap;
}

.credit-nature {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 0.5px solid var(--separator, rgba(60, 60, 67, 0.12));
}

.credit-nature-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #8E8E93);
  margin: 0 0 10px;
}

.credit-nature-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.credit-nature-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.credit-nature-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.credit-nature-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #000000);
}

.credit-nature-num {
  font-size: 12px;
  color: var(--text-secondary, #8E8E93);
  white-space: nowrap;
}

.credit-nature-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.credit-nature-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--primary, #007AFF);
}

/* Filter bar */
.filter-tabs-wrap {
  margin-bottom: 12px;
}

.filter-tabs-wrap :deep(.van-tabs__nav) {
  background: transparent;
}

.filter-tabs-wrap :deep(.van-tabs__line) {
  background: var(--primary, #007AFF);
  border-radius: 2px;
}
.filter-tabs-wrap :deep(.van-tab) {
  color: var(--text-secondary, #8E8E93);
  font-size: 14px;
  transition: color 0.15s ease;
}
.filter-tabs-wrap :deep(.van-tab--active) {
  color: var(--primary, #007AFF);
  font-weight: 600;
}

/* Inset Grouped Grade Card */
.grades-grouped-card {
  background: var(--bg-surface, #FFFFFF);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
}

.grade-list-row {
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

.grade-list-row:last-child {
  border-bottom: none;
}

.grade-list-row:active {
  background: rgba(0, 0, 0, 0.03);
}

.grade-info-col {
  flex: 1;
  min-width: 0;
}

.grade-course-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary, #000000);
  margin: 0 0 4px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.grade-meta-text {
  font-size: 13px;
  color: var(--text-secondary, #8E8E93);
  line-height: 1.2;
}

.grade-score-col {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.grade-score-val {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #000000);
  font-variant-numeric: tabular-nums;
}

.grade-score-val.is-fail {
  color: #FF3B30;
}
</style>
