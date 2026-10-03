<template>
  <div class="login-page">
    <header class="login-masthead">
      <BrandMark :size="24" />
      <span class="masthead-brand">学渡</span>
      <span class="masthead-school">重庆交通大学</span>
    </header>

    <main class="login-content">
      <div class="login-hero-header">
        <h1 class="login-hero-title">向学而行</h1>
        <p class="login-hero-sub">用教务系统账号登录</p>
      </div>

      <div class="login-form-card">
        <div class="input-field-block">
          <label for="xuedu-user" class="field-label">学号 / 统一身份认证账号</label>
          <div class="input-row" :class="{ 'has-error': errors.username }">
            <Icon name="user" :size="18" color="var(--text-secondary)" />
            <input
              id="xuedu-user"
              autocomplete="username"
              v-model="username"
              type="text"
              placeholder="请输入学号"
              class="native-input"
              @focus="errors.username = ''"
            />
          </div>
          <span class="field-error-text" v-if="errors.username">{{ errors.username }}</span>
        </div>

        <div class="input-field-block">
          <label for="xuedu-password" class="field-label">教务系统登录密码</label>
          <div class="input-row" :class="{ 'has-error': errors.password }">
            <input
              id="xuedu-password"
              autocomplete="current-password"
              v-model="password"
              type="password"
              placeholder="请输入登录密码"
              class="native-input"
              @focus="errors.password = ''"
              @keyup.enter="handleLogin"
            />
          </div>
          <span class="field-error-text" v-if="errors.password">{{ errors.password }}</span>
        </div>

        <button
          class="login-primary-btn"
          :class="{ loading: store.authLoading || restoring }"
          :disabled="store.authLoading || restoring"
          @click="handleLogin"
        >
          <van-loading v-if="store.authLoading || restoring" size="20px" color="#ffffff" />
          <span>{{ restoring ? '正在恢复…' : (store.authLoading ? '正在登录…' : '登录') }}</span>
        </button>

        <p class="login-alert-box" v-if="errorMsg">{{ errorMsg }}</p>

        <p class="credential-hint">不保存教务密码。登录过期后需要重新输入密码。</p>
      </div>
    </main>

    <footer class="login-footer">
      <span>重庆交通大学教学教务辅助平台</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import BrandMark from '@/components/BrandMark.vue'
import { readLocal } from '@/utils/storageCache'

const router = useRouter()
const store = useAppStore()
const username = ref(readLocal('loginUser'))
const password = ref('')
const errorMsg = ref('')
const restoring = ref(false)
const errors = reactive({ username: '', password: '' })

async function handleLogin() {
  errorMsg.value = ''
  errors.username = ''
  errors.password = ''

  if (!username.value.trim()) {
    errors.username = '请输入学生学号'
    return
  }
  if (!password.value) {
    errors.password = '请输入教务密码'
    return
  }

  const ok = await store.login(username.value.trim(), password.value)
  if (ok) {
    password.value = ''
    showToast('登录成功')
    router.push('/home')
  } else {
    errorMsg.value = store.authError || '登录失败，请核对学号或密码'
  }
}

onMounted(async () => {
  if (!localStorage.getItem('sessionId') && !localStorage.getItem('loginUser')) return
  restoring.value = true
  const ok = await store.restoreSession()
  restoring.value = false
  if (ok) router.replace('/home')
  else if (store.authError) errorMsg.value = store.authError
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: calc(var(--safe-top) + 20px) 20px calc(var(--safe-bottom) + 24px);
  max-width: 520px;
  margin: 0 auto;
  background-color: var(--bg-app);
  display: flex;
  flex-direction: column;
}

.login-masthead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 14px;
}
.masthead-brand {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.masthead-school {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.login-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.login-hero-header {
  margin: 28px 4px 22px;
}
.login-hero-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.15;
}
.login-hero-sub {
  font-size: 17px;
  color: var(--text-secondary);
  margin-top: 6px;
  font-weight: 400;
}

.login-form-card {
  background: var(--bg-surface);
  border-radius: var(--radius-group);
  padding: 22px 18px;
  box-shadow: var(--shadow-content);
}

.input-field-block {
  margin-bottom: 18px;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.input-row {
  height: 50px;
  background: var(--bg-app);
  border: 1px solid var(--separator);
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.input-row:focus-within {
  border-color: var(--accent);
  background: var(--bg-surface);
}
.input-row.has-error {
  border-color: var(--danger);
}
.native-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 16px;
  color: var(--text-primary);
}
.native-input::placeholder {
  color: var(--text-tertiary);
  font-size: 15px;
}
.field-error-text {
  display: block;
  font-size: 12px;
  color: var(--danger);
  margin-top: 6px;
  padding-left: 2px;
}

.login-primary-btn {
  width: 100%;
  height: 50px;
  background: var(--accent);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-control);
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease;
}
.login-primary-btn:active {
  transform: scale(0.98);
}
.login-primary-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-alert-box {
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(255, 59, 48, 0.08);
  border-radius: 8px;
  color: var(--danger);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
}

.login-footer {
  margin-top: auto;
  padding-top: 28px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
