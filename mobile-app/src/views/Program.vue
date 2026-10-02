<template>
  <div class="page-container program-page">
    <header class="cw-top-nav">
      <button class="nav-icon-btn" @click="closeToWidget">
        <Icon name="arrow-left" :size="20" color="#161513" />
      </button>
      <div class="nav-title-col">
        <p class="xd-kicker">XD-PROG</p>
        <h1 class="nav-title">培养方案</h1>
      </div>
      <button class="nav-icon-btn" @click="refresh">
        <Icon name="refresh" :size="18" color="#8A8278" />
      </button>
    </header>

    <!-- Summary Overview Card -->
    <section class="summary-card">
      <div class="summary-badge-line">
        <span class="plan-type-pill">全周期课程设置总表</span>
        <span class="major-pill" v-if="majorText">{{ majorText }}</span>
      </div>
      <h2 class="summary-title">{{ planTitle }}</h2>
      <p class="summary-meta" v-if="collegeText">{{ collegeText }}</p>

      <div class="summary-stats" v-if="courses.length">
        <div class="stat-box">
          <strong class="color-blue">{{ courses.length }}</strong>
          <span>规划课程</span>
        </div>
        <div class="stat-box">
          <strong class="color-emerald">{{ totalCredit }}</strong>
          <span>总学分</span>
        </div>
        <div class="stat-box">
          <strong class="color-purple">{{ totalHours }}</strong>
          <span>总学时</span>
        </div>
      </div>
    </section>

    <!-- Grouping Filter Toggle (按学期 / 按性质) -->
    <div class="group-tab-wrap" v-if="courses.length">
      <button
        class="tab-capsule"
        :class="{ active: groupMode === 'term' }"
        @click="groupMode = 'term'"
      >按开课学期</button>
      <button
        class="tab-capsule"
        :class="{ active: groupMode === 'nature' }"
        @click="groupMode = 'nature'"
      >按课程性质</button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !courses.length" class="empty-state">
      <van-loading type="spinner" color="#C48A3A" size="26px" />
      <p>正在同步教务培养方案...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="!courses.length" class="empty-state">
      <Icon name="book" :size="32" color="#B4ADA3" />
      <p>{{ errorMsg || '暂未查询到该专业的培养方案课程' }}</p>
      <span class="empty-sub">教务系统暂未发布完整的课程设置总表</span>
    </div>

    <!-- Course Groups -->
    <section v-else class="group-list">
      <div v-for="group in groupedCourses" :key="group.title" class="course-group-card">
        <div class="group-head">
          <div class="head-left">
            <span class="group-dot"></span>
            <h3>{{ group.title }}</h3>
          </div>
          <span class="group-badge">{{ group.items.length }} 门 · {{ group.totalCredit }} 学分</span>
        </div>

        <div
          v-for="(item, idx) in group.items"
          :key="item.code + item.name + idx"
          class="course-item-row"
          @click="showDetail(item)"
        >
          <div class="course-main-info">
            <div class="course-title-line">
              <h4 class="course-name">{{ item.name }}</h4>
              <span
                class="req-chip"
                :class="item.required === '必修' ? 'chip-req' : 'chip-opt'"
                v-if="item.required"
              >{{ item.required }}</span>
            </div>

            <div class="course-tags-line">
              <span class="meta-tag" v-if="item.code">{{ item.code }}</span>
              <span class="meta-tag" v-if="item.hours">{{ item.hours }} 学时</span>
              <span class="meta-tag" v-if="item.exam">{{ item.exam }}</span>
              <span class="meta-tag" v-if="groupMode !== 'nature' && item.nature">{{ item.nature }}</span>
              <span class="meta-tag" v-if="groupMode !== 'term' && item.term">{{ item.term }}</span>
            </div>
          </div>

          <div class="course-credit-col">
            <strong class="credit-num">{{ item.credit || '-' }}</strong>
            <span class="credit-lbl">学分</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showDialog } from 'vant'
import { showToast } from '@/utils/appToast'
import { useAppStore } from '@/store/app'
import Icon from '@/components/Icon.vue'
import { useWidgetPage } from '@/composables/useWidgetPage'

const router = useRouter()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()

const loading = ref(false)
const errorMsg = ref('')
const groupMode = ref('term') // 'term' | 'nature'

const courses = computed(() => store.program?.courses || [])

const planTitle = computed(() => {
  const p = store.profile || {}
  const prog = store.program || {}
  if (p.major) return p.major + ' 培养方案'
  return prog.title || '课程设置总表'
})

const majorText = computed(() => {
  const p = store.profile || {}
  return p.className || p.major || ''
})

const collegeText = computed(() => {
  const p = store.profile || {}
  const list = [p.school || '重庆交通大学', p.college].filter(Boolean)
  return list.join(' · ')
})

const totalCredit = computed(() => {
  const sum = courses.value.reduce((acc, c) => acc + (parseFloat(c.credit) || 0), 0)
  return sum.toFixed(1).replace(/\.0$/, '')
})

const totalHours = computed(() => {
  const sum = courses.value.reduce((acc, c) => acc + (parseInt(c.hours, 10) || 0), 0)
  return sum ? sum + ' 课时' : '--'
})

const groupedCourses = computed(() => {
  const map = new Map()
  for (const item of courses.value) {
    let key = ''
    if (groupMode.value === 'term') {
      key = item.term ? formatTermTitle(item.term) : '开课学期待定'
    } else {
      key = item.nature || item.required || '其他课程'
    }
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }

  return [...map.entries()].map(([title, items]) => {
    const cred = items.reduce((acc, c) => acc + (parseFloat(c.credit) || 0), 0).toFixed(1).replace(/\.0$/, '')
    return {
      title,
      items,
      totalCredit: cred
    }
  })
})

function formatTermTitle(term) {
  const m = String(term).match(/(\d{4})-(\d{4})-(\d)/)
  if (!m) return term
  const sem = m[3] === '1' ? '第一学期（秋季）' : '第二学期（春季）'
  return `${m[1]}-${m[2]}学年 ${sem}`
}

function showDetail(item) {
  showDialog({
    title: item.name,
    message: [
      item.code ? '课程代码：' + item.code : '',
      item.credit ? '课程学分：' + item.credit + ' 学分' : '',
      item.hours ? '计划学时：' + item.hours + ' 课时' : '',
      item.term ? '开课学期：' + formatTermTitle(item.term) : '',
      item.nature ? '课程性质：' + item.nature : '',
      item.required ? '修读要求：' + item.required : '',
      item.exam ? '考核形式：' + item.exam : '',
      item.department ? '开课单位：' + item.department : ''
    ].filter(Boolean).join('\n'),
    confirmButtonText: '了解',
    confirmButtonColor: '#C48A3A'
  })
}

async function refresh() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await store.fetchProgram()
    if (!data?.success) {
      errorMsg.value = data?.message || '同步失败'
      showToast(errorMsg.value)
    }
  } catch (e) {
    errorMsg.value = '网络错误'
    showToast(errorMsg.value)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  if (!courses.value.length) {
    await refresh()
  }
})
</script>

<style scoped>
.program-page {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(var(--safe-top) + 12px) 16px 28px;
}
.cw-top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
  margin-bottom: 14px;
}
.nav-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-solid);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-card);
}
.nav-title-col { text-align: center; }
.nav-title-col .xd-kicker { display: block; margin-bottom: 2px; }
.nav-title {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-primary);
}
.summary-card {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  padding: 18px 18px 20px;
  box-shadow: var(--shadow-card), var(--shadow-inset);
  margin-bottom: 14px;
}
.summary-badge-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.plan-type-pill {
  font-size: 11px;
  font-weight: 700;
  color: #C48A3A;
  background: #F4E6D0;
  padding: 3px 8px;
  border-radius: 8px;
}
.major-pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card-solid);
  padding: 3px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}
.summary-title {
  margin-top: 8px;
  font-size: 21px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
}
.summary-meta {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}
.summary-stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}
.stat-box {
  background: var(--bg-card-solid);
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
  border: 1px solid var(--border-subtle);
}
.stat-box strong {
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.15;
}
.stat-box span {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  margin-top: 4px;
}
.color-blue { color: var(--primary); }
.color-emerald { color: var(--success); }
.color-purple { color: #8A7A68; }

.group-tab-wrap {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 14px;
  gap: 4px;
}
.tab-capsule {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
}
.tab-capsule.active {
  background: var(--bg-card-solid);
  color: var(--text-primary);
  box-shadow: var(--shadow-inset);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 12px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}
.empty-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.course-group-card {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card), var(--shadow-inset);
  padding: 8px 16px 12px;
  margin-bottom: 14px;
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0 8px;
  border-bottom: 1px dashed var(--border);
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: #C48A3A;
}
.group-head h3 {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}
.group-badge {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.course-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.course-item-row:last-child {
  border-bottom: none;
}
.course-main-info {
  flex: 1;
  padding-right: 12px;
}
.course-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.course-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.req-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
}
.chip-req {
  background: #F4E6D0;
  color: #C48A3A;
}
.chip-opt {
  background: #fef3c7;
  color: #b45309;
}

.course-tags-line {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.meta-tag {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-card-solid);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

.course-credit-col {
  text-align: right;
  min-width: 44px;
}
.credit-num {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: #C48A3A;
  line-height: 1;
}
.credit-lbl {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 600;
}
</style>
