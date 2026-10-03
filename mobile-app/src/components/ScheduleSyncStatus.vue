<template>
  <div class="sync-status" aria-live="polite">
    <span>{{ label }}</span>
    <span v-if="error" class="sync-error">{{ error }}</span>
    <button v-if="sessionExpired" type="button" @click="$emit('login')">重新登录</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  syncedAt: { type: Number, default: 0 }, loading: Boolean, offline: Boolean,
  error: { type: String, default: '' }, sessionExpired: Boolean
})
defineEmits(['login'])
const label = computed(() => {
  if (props.loading) return props.syncedAt ? '正在同步，继续显示已保存的课表' : '正在同步课表…'
  const time = props.syncedAt ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(props.syncedAt)) : ''
  if (props.offline) return time ? `离线 · 上次同步 ${time}` : '离线 · 显示已保存的课表'
  return time ? `上次同步 ${time}` : '课表尚未同步，请连接网络获取最新安排'
})
</script>

<style scoped>
.sync-status { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin: 6px 2px 12px; font-size: 12px; color: var(--text-secondary); }
.sync-error { color: var(--danger); flex-basis: 100%; }
.sync-status button { border: 0; background: var(--primary-light); color: var(--primary-deep); min-height: 44px; padding: 0 12px; border-radius: 8px; cursor: pointer; }
</style>
