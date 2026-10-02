<template>
  <div class="page-container classrooms-page">
    <header class="cw-top-nav">
      <button class="nav-icon-btn" @click="closeToWidget">
        <Icon name="arrow-left" :size="20" color="#161513" />
      </button>
      <div class="nav-title-col">
        <p class="xd-kicker">XD-ROOM</p>
        <h1 class="nav-title">空闲教室</h1>
      </div>
      <button class="nav-icon-btn" @click="search">
        <Icon name="refresh" :size="18" color="#8A8278" />
      </button>
    </header>

    <!-- Query Filter Form -->
    <section class="filter-card">
      <div class="field-grid-row">
        <div class="field">
          <label>教学周</label>
          <select v-model="form.week">
            <option v-for="opt in filters.weeks" :key="'w'+opt.value" :value="opt.value">{{ opt.text }}</option>
          </select>
        </div>
        <div class="field">
          <label>星期</label>
          <select v-model="form.weekday">
            <option v-for="opt in filters.weekdays" :key="'d'+opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>节次（上课时段）</label>
        <select v-model="form.period">
          <option v-for="opt in filters.periods" :key="'p'+opt.value" :value="opt.value">{{ opt.text }}</option>
        </select>
      </div>

      <button class="more-toggle" @click="showMore = !showMore">
        <span>{{ showMore ? '收起筛选' : '更多筛选（校区 / 教学楼 / 教室类型）' }}</span>
        <Icon :name="showMore ? 'chevron-down' : 'chevron-right'" :size="14" color="#8A8278" />
      </button>

      <div v-if="showMore" class="more-box">
        <div class="field">
          <label>校区（非必选）</label>
          <select v-model="form.campus" @change="onCampusChange">
            <option value="">全部校区</option>
            <option value="02">科学城校区</option>
            <option value="01">南岸校区</option>
          </select>
        </div>
        <div class="field">
          <label>教学楼（非必选）</label>
          <select v-model="form.building">
            <option value="">不限教学楼</option>
            <option v-for="opt in buildingOptions" :key="'b'+opt.value" :value="opt.value">{{ opt.text }}</option>
          </select>
        </div>
        <div class="field">
          <label>教室类型（非必选）</label>
          <select v-model="form.roomType">
            <option value="">不限类型</option>
            <option value="普通教室">普通教室</option>
            <option value="多媒体教室">多媒体教室</option>
            <option value="机房">计算机房</option>
            <option value="实验室">实验室</option>
          </select>
        </div>
      </div>

      <button class="search-btn" :disabled="loading" @click="search">
        {{ loading ? '正在快速检索...' : '查询空闲教室' }}
      </button>
    </section>

    <!-- Query Result -->
    <section class="result-card">
      <div class="result-head">
        <h2>空闲教室列表</h2>
        <span class="count-tag" v-if="queried">{{ rooms.length }} 间可用</span>
      </div>

      <div v-if="loading" class="empty-state">
        <van-loading type="spinner" color="#C48A3A" size="24px" />
        <p>正在同步教务空闲排课数据...</p>
      </div>

      <div v-else-if="!queried" class="empty-state">
        <Icon name="location" :size="28" color="#8A8278" />
        <p>选择周次和节次后点击查询</p>
      </div>

      <div v-else-if="!rooms.length" class="empty-state">
        <Icon name="clock" :size="28" color="#B4ADA3" />
        <p>所选时段暂无可用的空闲教室</p>
        <span class="empty-sub">建议尝试更换其他教学楼或临近节次</span>
      </div>

      <div v-else class="room-list">
        <div v-for="(room, idx) in rooms" :key="room.name + idx" class="room-card-item">
          <div class="room-left-col">
            <h3 class="room-name">{{ room.name }}</h3>
            <p class="room-meta">
              <span class="campus-badge" :class="room.campus === '科学城校区' ? 'badge-kxc' : 'badge-na'">{{ room.campus || '校区' }}</span>
              <span class="building-text" v-if="room.building">{{ room.building }}</span>
              <span class="type-text" v-if="room.type">{{ room.type }}</span>
            </p>
          </div>
          <div class="room-status-badge">
            <span class="status-free-dot"></span>
            <span>空闲</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from '@/utils/appToast'
import { useAppStore } from '@/store/app'
import Icon from '@/components/Icon.vue'
import { useWidgetPage } from '@/composables/useWidgetPage'

const router = useRouter()
const store = useAppStore()
const { closeToWidget } = useWidgetPage()

const showMore = ref(false)
const queried = ref(false)
const loading = ref(false)
const rooms = ref([])

const BUILDINGS_KXC = [
  { text: 'A01教学楼', value: '06372B81F7614E61AB398BFC61878C49' },
  { text: 'B01教学楼', value: '20A578DE6FB04CB6BE13DFC39B6B4D92' },
  { text: 'D01教学楼', value: '106CD2A13A474B13AA92AC2565D1E7B8' },
  { text: '逸夫楼', value: '0FF08DBB3D9A43139D474C57083FF44E' },
  { text: '航空楼', value: 'D153587BAD6E4BD9927AA41E051DFC32' },
  { text: '致远楼', value: '5CE205DEF9E349ABA6E64755BE1C9B5A' },
  { text: '材料实验楼', value: 'C3E1894A65D04E5CB4DC8C093A36D081' }
]

const BUILDINGS_NA = [
  { text: '第一教学楼', value: '7023FEB7ACB54FE7AA01B3906F358E5E' },
  { text: '第二教学楼', value: 'DD5F1FA2617A4140B885BB69AB281338' },
  { text: '第三教学楼', value: '5635EAC12059434FAB5858A1965E006D' },
  { text: '第四教学楼', value: '58398956368B46E4A4DF85EA1348B0A8' },
  { text: '第五教学楼', value: '919D0C2D80F44E8EA1F94C525FC17706' },
  { text: '第六教学楼', value: '773349DA361A40DA80250673190EA3B0' },
  { text: '第七教学楼', value: 'A1F6BCE03D7245C7962DE6279B9F62D0' },
  { text: '第九教学楼', value: '2BBEE582D1A1458488B3031739E6EEC0' },
  { text: '图书馆', value: '1F18C8EF84EB48A69731524A54FD32F6' },
  { text: '第三办公楼', value: 'EA0C20BAF3724899B13FC0D09B10703C' }
]

const filters = reactive({
  weeks: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), text: '第 ' + (i + 1) + ' 周' })),
  weekdays: [
    { value: '1', label: '周一', text: '星期一' },
    { value: '2', label: '周二', text: '星期二' },
    { value: '3', label: '周三', text: '星期三' },
    { value: '4', label: '周四', text: '星期四' },
    { value: '5', label: '周五', text: '星期五' },
    { value: '6', label: '周六', text: '星期六' },
    { value: '7', label: '周日', text: '星期日' }
  ],
  periods: [
    { value: '0', text: '第 1-2 节（上午第1讲 08:20-09:45）' },
    { value: '1', text: '第 3-5 节（上午第2讲 10:15-12:35）' },
    { value: '2', text: '第 6-7 节（下午第1讲 14:00-15:25）' },
    { value: '3', text: '第 8-10 节（下午第2讲 15:40-18:00）' },
    { value: '4', text: '第 11-13 节（晚上 19:00-21:25）' }
  ]
})

const curWeekNum = Number(store.currentWeek || store.calcCurrentWeek() || 1)
const curWeek = String(Math.min(20, Math.max(1, curWeekNum)))
const curDay = String((new Date().getDay() + 6) % 7 + 1)

const form = reactive({
  week: curWeek,
  weekday: curDay,
  period: '0',
  campus: '02', // 科学城校区默认
  building: '',
  roomType: ''
})

const buildingOptions = computed(() => {
  if (form.campus === '02') return BUILDINGS_KXC
  if (form.campus === '01') return BUILDINGS_NA
  return [...BUILDINGS_KXC, ...BUILDINGS_NA]
})

function onCampusChange() {
  form.building = ''
}

async function search() {
  if (!form.week || !form.weekday || form.period === '') {
    showToast('请选择周次、星期和节次')
    return
  }
  loading.value = true
  queried.value = true
  try {
    const term = String(store.semester || '')
    const xnxq = /2026-2027-1/.test(term) ? term : '2026-2027-1'
    const data = await store.fetchClassrooms({
      query: '1',
      xnxq,
      week: form.week,
      weekday: form.weekday,
      period: form.period,
      campus: form.campus,
      building: form.building,
      roomType: form.roomType
    })
    if (data?.success) {
      rooms.value = data.rooms || []
      if (!rooms.value.length) {
        showToast('所选时段暂无空闲教室')
      }
    } else {
      rooms.value = []
      showToast(data?.message || '查询失败')
    }
  } catch (e) {
    rooms.value = []
    showToast('查询失败，请检查网络')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!store.isLoggedIn) {
    router.push('/login')
    return
  }
  // Auto-search on open so user immediately sees real free rooms
  search()
})
</script>

<style scoped>
.classrooms-page {
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
.filter-card, .result-card {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card), var(--shadow-inset);
  padding: 18px 16px 20px;
  margin-bottom: 14px;
}
.field-grid-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field {
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.field select {
  width: 100%;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 12px;
  background: var(--bg-card-solid);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  outline: none;
}
.more-toggle {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  margin: 4px 0 12px;
  cursor: pointer;
}
.more-box {
  background: var(--bg-card-solid);
  border-radius: 10px;
  padding: 12px 12px 4px;
  margin-bottom: 12px;
  border: 1px solid var(--border-subtle);
}
.search-btn {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  border: none;
  border-radius: 10px;
  background: #C48A3A;
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  padding: 13px 16px;
  margin-top: 4px;
  cursor: pointer;
  box-shadow: 0 8px 18px -12px rgba(138, 90, 34, 0.45);
}
.search-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.result-head h2 {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
.count-tag {
  font-size: 12px;
  font-weight: 700;
  color: #C48A3A;
  background: #F4E6D0;
  padding: 3px 8px;
  border-radius: 8px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 8px;
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
.room-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.room-card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-subtle);
}
.room-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
.room-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.campus-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
}
.badge-kxc {
  background: var(--primary-light);
  color: var(--primary-deep);
}
.badge-na {
  background: #F4E6D0;
  color: #8A5A22;
}
.room-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--success);
  background: #E8F0E6;
  padding: 4px 10px;
  border-radius: 8px;
}
.status-free-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: var(--success);
}
</style>
