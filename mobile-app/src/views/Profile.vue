<template>
  <div class="page-container profile-page">
    <!-- Apple 大黑标题 -->
    <header class="profile-header">
      <h1 class="large-title-text">我的</h1>
    </header>

    <!-- 个人名片卡（纯色系统蓝头像 + 姓名学号院系换行 + 点击名片弹窗） -->
    <section class="profile-hero-card" @click="showStudentCard">
      <div class="avatar-circle">
        <span class="avatar-chars">{{ avatarText }}</span>
      </div>
      <div class="profile-meta-col">
        <h2 class="student-name-text">{{ store.studentName || '同学' }}</h2>
        <p class="college-role-sub">{{ cardSubLine }}</p>
        <p class="campus-sub-tag">天气校区：{{ store.campus === 'nanan' ? '南岸' : '科学城' }}</p>
      </div>
      <div class="hero-card-arrow">
        <span class="card-detail-hint">详细资料</span>
        <Icon name="chevron-right" :size="16" color="#8E8E93" />
      </div>
    </section>

    <div class="group-section-title">常用</div>
    <div class="inset-grouped-box">
      <div class="inset-list-row" @click="router.push('/program')">
        <div class="inset-row-left">
          <div class="inset-row-text"><span class="row-main-title">培养方案</span></div>
        </div>
        <Icon name="chevron-right" :size="14" color="#8E8E93" />
      </div>
      <div class="inset-list-row" @click="router.push('/classrooms')">
        <div class="inset-row-left">
          <div class="inset-row-text"><span class="row-main-title">空闲教室</span></div>
        </div>
        <Icon name="chevron-right" :size="14" color="#8E8E93" />
      </div>
      <div class="inset-list-row" @click="router.push('/assistant')">
        <div class="inset-row-left">
          <div class="inset-row-text"><span class="row-main-title">学渡助手</span></div>
        </div>
        <Icon name="chevron-right" :size="14" color="#8E8E93" />
      </div>
      <div class="inset-list-row" @click="router.push('/calendar-weather')">
        <div class="inset-row-left">
          <div class="inset-row-text"><span class="row-main-title">校历与天气</span></div>
        </div>
        <Icon name="chevron-right" :size="14" color="#8E8E93" />
      </div>
    </div>

    <div class="group-section-title">教务数据</div>
    <div class="inset-grouped-box">
      <div class="inset-list-row" @click="clearLocalData">
        <div class="inset-row-left">
          <div class="inset-row-icon icon-blue">
            <Icon name="refresh" :size="16" color="#FFFFFF" />
          </div>
          <div class="inset-row-text">
            <span class="row-main-title">重新同步课表</span>
            <span class="row-sub-title">拉取新版教务系统最新课程及教室安排</span>
          </div>
        </div>
        <div class="inset-row-right">
          <Icon name="chevron-right" :size="14" color="#8E8E93" />
        </div>
      </div>
    </div>

    <!-- 组 2：系统与设置 -->
    <div class="group-section-title">系统与设置</div>
    <div class="inset-grouped-box">
      <div class="inset-list-row" @click="onCheckUpdateClick">
        <div class="inset-row-left">
          <div class="inset-row-icon icon-orange">
            <Icon name="refresh" :size="16" color="#FFFFFF" />
          </div>
          <div class="inset-row-text">
            <span class="row-main-title">检查软件更新</span>
            <span class="row-sub-title">当前运行版本 {{ currentAppVersionLabel }}</span>
          </div>
        </div>
        <div class="inset-row-right">
          <span v-if="updateCheck === 'available'" class="badge-new-ver">发现新版本</span>
          <span v-else-if="updateCheck === 'failed'" class="badge-latest">检查失败</span>
          <span v-else-if="updateCheck === 'checking'" class="badge-latest">正在检查</span>
          <span v-else class="badge-latest">已是最新</span>
          <Icon name="chevron-right" :size="14" color="#8E8E93" />
        </div>
      </div>

      <div class="inset-list-row" @click="showAbout">
        <div class="inset-row-left">
          <div class="inset-row-icon icon-teal">
            <Icon name="sparkles" :size="16" color="#FFFFFF" />
          </div>
          <div class="inset-row-text">
            <span class="row-main-title">关于学渡</span>
            <span class="row-sub-title">重庆交通大学教务课表助手 · 两江一渡</span>
          </div>
        </div>
        <div class="inset-row-right">
          <Icon name="chevron-right" :size="14" color="#8E8E93" />
        </div>
      </div>

      <!-- 破坏性退出登录（明确红色，标准 iOS 危险操作行） -->
      <div class="inset-list-row destructive-row" @click="handleLogout">
        <div class="inset-row-left">
          <div class="inset-row-text">
            <span class="row-main-title text-danger">退出登录</span>
            <span class="row-sub-title text-danger-sub">退出并清除本机教务缓存</span>
          </div>
        </div>
        <div class="inset-row-right">
          <Icon name="chevron-right" :size="14" color="#FF3B30" />
        </div>
      </div>
    </div>

    <!-- 极简 Apple 风格页脚 -->
    <footer class="profile-footnote">
      <p class="footnote-meta">
        <span>天气校区：{{ store.campus === 'nanan' ? '南岸' : '科学城' }}</span>
        <span class="footnote-sep">·</span>
        <span>课表 {{ store.courses?.length || 0 }} 门</span>
        <span class="footnote-sep">·</span>
        <span>{{ currentAppVersionLabel }}</span>
      </p>
      <p class="footnote-motto">重庆交通大学 · 两江一渡 · 向学而行</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showDialog } from 'vant'
import { showToast, closeToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import { useInAppUpdate } from '@/composables/useInAppUpdate'
import { formatAppVersion, getNativeAppInfo, isUpdateAvailable } from '@/utils/apkUpdate'

const router = useRouter()
const updateCheck = ref('checking')
const store = useAppStore()
const update = useInAppUpdate()

const currentAppVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1')
const currentAppVersionCode = ref(0)
const currentAppVersionLabel = computed(() => formatAppVersion(currentAppVersion.value))
const hasUpdate = ref(false)
const pendingUpdate = ref(null)

async function resolveCurrentAppVersion() {
  const native = await getNativeAppInfo()
  currentAppVersion.value = native?.versionName ? String(native.versionName) : (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1')
  currentAppVersionCode.value = Number(native?.versionCode) || 0
}

const avatarText = computed(() => {
  const name = store.studentName || '同学'
  return name.length > 2 ? name.slice(-2) : name
})

const card = computed(() => store.profile || {})
const cardSubLine = computed(() => {
  const major = card.value.major || card.value.college
  const sid = store.studentId || card.value.studentId
  if (major && sid) return major + ' · ' + sid
  if (sid) return '学号 ' + sid
  return '点击查看个人名片'
})

async function showStudentCard() {
  if (!store.profile || !store.profile.college) {
    showToast({ message: '正在同步个人名片...', duration: 0 })
    await store.fetchProfile()
    closeToast()
  }
  const p = store.profile || {}
  showDialog({
    title: store.studentName || '个人名片',
    message: [
      '学校：' + (p.school || '重庆交通大学'),
      '学院：' + (p.college || '--'),
      '班级：' + (p.className || '--'),
      '专业名称：' + (p.major || '--'),
      '入学年份：' + (p.enrollYear || '--'),
      '学号：' + (p.studentId || store.studentId || '--')
    ].join('\n'),
    confirmButtonText: '关闭',
    confirmButtonColor: '#007AFF'
  })
}

async function startApkDownload(info) {
  if (!info || !info.fullDownloadUrl) {
    showToast('暂无安装包可下载')
    return
  }
  try {
    await update.startUpdate(info)
  } catch (e) {
    showToast(e?.message || '暂无安装包可下载')
  }
}

async function onCheckUpdateClick() {
  showToast({ message: '正在检查更新...', duration: 0 })
  await resolveCurrentAppVersion()
  const current = { versionName: currentAppVersion.value, versionCode: currentAppVersionCode.value }
  const info = await store.checkUpdate(current.versionName, current.versionCode)
  if (!info || !info.success) {
    updateCheck.value = 'failed'
    showToast('检查更新失败，请确认网络连接')
    return
  }

  if (isUpdateAvailable(current, info)) {
    hasUpdate.value = true
    updateCheck.value = 'available'
    pendingUpdate.value = info
    showDialog({
      title: '发现新版本 ' + formatAppVersion(info.latestVersion),
      message: (info.releaseNotes ? '更新内容：\n' + info.releaseNotes + '\n\n' : '') + '安装包大小：' + (info.apkSize || '约 4 MB') + '\n是否立即下载并在应用内更新？',
      showCancelButton: true,
      confirmButtonText: '立即更新',
      confirmButtonColor: '#007AFF',
      cancelButtonText: '暂不更新'
    }).then(() => {
      startApkDownload(info)
    }).catch(() => {})
  } else {
    hasUpdate.value = false
    updateCheck.value = 'latest'
    pendingUpdate.value = null
    showToast('暂无可用更新')
  }
}

async function checkAppUpdate(autoCheck = false) {
  await resolveCurrentAppVersion()
  const current = { versionName: currentAppVersion.value, versionCode: currentAppVersionCode.value }
  const info = await store.checkUpdate(current.versionName, current.versionCode)
  if (!info || !info.success) {
    updateCheck.value = 'failed'
    return
  }

  if (isUpdateAvailable(current, info)) {
    hasUpdate.value = true
    updateCheck.value = 'available'
    pendingUpdate.value = info
  } else {
    hasUpdate.value = false
    updateCheck.value = 'latest'
    pendingUpdate.value = null
  }
}

function showAbout() {
  showDialog({
    title: '关于学渡',
    message: '重庆交通大学教务课表助手\n数据来源：重庆交通大学新版教务系统\n功能：课表、成绩、考试、培养方案、空闲教室',
    confirmButtonText: '确定',
    confirmButtonColor: '#007AFF'
  })
}

async function clearLocalData() {
  showToast({ message: '正在同步课表...', duration: 0 })
  await store.fetchSchedule()
  if (store.scheduleError) showToast(store.scheduleError)
  else showToast('课表已同步')
}

function handleLogout() {
  showDialog({
    title: '退出登录',
    message: '确定要退出当前教务账号吗？',
    showCancelButton: true,
    confirmButtonText: '确定退出',
    confirmButtonColor: '#FF3B30',
    cancelButtonText: '取消'
  }).then(async () => {
    const result = await store.logout()
    router.push('/login')
    if (!result.success) showToast(result.message)
  }).catch(() => {})
}

onMounted(async () => {
  if (!store.isLoggedIn) {
    router.push('/login')
  } else {
    store.fetchProfile()
    checkAppUpdate(true)
  }
})
</script>

<style scoped>
.profile-page {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(var(--safe-top, 0px) + 16px) 16px calc(var(--dock-clearance, 100px) + 8px);
}

.profile-header {
  margin-bottom: 12px;
  padding: 0 4px;
}

.large-title-text {
  font-size: 34px;
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

/* 个人名片卡（白色不透明卡片，大黑姓名，中性纯色头像） */
.profile-hero-card {
  position: relative;
  background: #FFFFFF;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
}

.profile-hero-card:active {
  transform: scale(0.98);
}

.avatar-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent, #007AFF);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
  flex-shrink: 0;
}

.profile-meta-col {
  flex: 1;
  min-width: 0;
}

.student-name-text {
  font-size: 22px;
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin-bottom: 3px;
  word-break: break-word;
}

.college-role-sub {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
  line-height: 1.4;
  word-break: break-word;
}

.campus-sub-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent, #007AFF);
  margin-top: 3px;
}

.hero-card-arrow {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-detail-hint {
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
}

/* 分组标题与 Inset Grouped 列表 */
.group-section-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(60, 60, 67, 0.60);
  margin: 16px 6px 8px;
  letter-spacing: -0.01em;
}

.inset-grouped-box {
  background: #FFFFFF;
  border-radius: 12px;
  overflow: hidden;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  margin-bottom: 16px;
}

.inset-list-row {
  min-height: 50px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.12);
  transition: background 0.12s ease;
}

.inset-list-row:last-child {
  border-bottom: none;
}

.inset-list-row:active {
  background: rgba(0, 0, 0, 0.04);
}

.inset-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.inset-row-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-blue {
  background: #007AFF;
}

.icon-purple {
  background: #AF52DE;
}

.icon-orange {
  background: #FF9500;
}

.icon-teal {
  background: #32ADE6;
}

.icon-danger {
  background: #FF3B30;
}

.inset-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-main-title {
  font-size: 16px;
  font-weight: 500;
  color: #000000;
  line-height: 1.3;
}

.row-sub-title {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.60);
  line-height: 1.3;
  margin-top: 2px;
  word-break: break-word;
}

/* 破坏性操作行：明确红色高对比度 */
.destructive-row .text-danger {
  color: #FF3B30 !important;
  font-weight: 600;
}

.destructive-row .text-danger-sub {
  color: rgba(255, 59, 48, 0.70) !important;
}

.inset-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 13px;
  color: rgba(60, 60, 67, 0.60);
}

.badge-new-ver {
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
  background: #FF3B30;
  padding: 2px 8px;
  border-radius: 10px;
}

.badge-latest {
  font-size: 12px;
  color: rgba(60, 60, 67, 0.60);
}

/* 极简页脚 */
.profile-footnote {
  padding: 24px 16px 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.footnote-meta {
  font-size: 12px;
  font-weight: 500;
  color: rgba(60, 60, 67, 0.60);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.footnote-sep {
  color: rgba(60, 60, 67, 0.30);
}

.footnote-motto {
  font-size: 11px;
  color: rgba(60, 60, 67, 0.40);
}

@media (prefers-reduced-motion: reduce) {
  .profile-hero-card,
  .inset-list-row {
    transition: none !important;
    transform: none !important;
  }
}
</style>
