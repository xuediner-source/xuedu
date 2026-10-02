<template>
  <div class="page-container survey-page">
    <header class="as-top-nav">
      <button class="nav-icon-btn xd-bezel" type="button" @click="goBack">
        <Icon name="arrow-left" :size="20" color="#161513" />
      </button>
      <div class="as-title-wrap">
        <p class="xd-kicker">XD-SURV</p>
        <h1 class="nav-title">体验反馈</h1>
        <p class="as-sub">学渡 0.0.6 · 六题选项</p>
      </div>
      <span class="nav-spacer"></span>
    </header>

    <section class="survey-card xd-bezel">
      <p class="lead">课表、成绩都是虚构的。按真实使用感受点选项即可。</p>

      <div v-for="q in questions" :key="q.id" class="q-block">
        <label class="q-label">{{ q.title }}</label>
        <div class="chip-wrap">
          <button
            v-for="opt in q.options"
            :key="opt"
            type="button"
            class="chip"
            :class="{ on: isOn(q, opt) }"
            @click="pick(q, opt)"
          >{{ opt }}</button>
        </div>
      </div>

      <button class="submit xd-bezel" type="button" :disabled="busy" @click="submit">{{ busy ? '提交中…' : '提交问卷' }}</button>
      <p v-if="done" class="ok">已收到，谢谢。可以继续试用或退出演示账号。</p>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/store/app'
import { showToast } from '@/utils/appToast'
import Icon from '@/components/Icon.vue'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const router = useRouter()
const store = useAppStore()
const busy = ref(false)
const done = ref(false)

const questions = [
  { id: 'feel', title: '1. 整体好用吗', multi: false, options: ['很难用', '一般', '还行', '好用', '会推荐'] },
  { id: 'used', title: '2. 你点开过哪些（可多选）', multi: true, options: ['首页', '课表', '成绩', '考试', '培养方案', '空教室', '学渡助手', '个人信息'] },
  { id: 'schedule', title: '3. 课表看起来怎么样', multi: false, options: ['看不清', '一般', '清楚', '很好'] },
  { id: 'pain', title: '4. 最别扭的是', multi: false, options: ['课表', '成绩', '考试', '空教室', '页面动画', '学渡助手', '登录', '没什么别扭'] },
  { id: 'wish', title: '5. 最想先加什么', multi: false, options: ['选课', '评教', '校园卡', '通知推送', '暂时没有'] },
  { id: 'again', title: '6. 还会继续用测试版吗', multi: false, options: ['不会', '看情况', '会用到正式版'] }
]

const form = reactive({
  feel: '',
  used: [],
  schedule: '',
  pain: '',
  wish: '',
  again: ''
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/home')
}

function isOn(q, opt) {
  if (q.multi) return form[q.id].includes(opt)
  return form[q.id] === opt
}

function pick(q, opt) {
  if (q.multi) {
    const i = form[q.id].indexOf(opt)
    if (i >= 0) form[q.id].splice(i, 1)
    else form[q.id].push(opt)
    return
  }
  form[q.id] = opt
}

async function submit() {
  const missing = questions.find(q => q.multi ? !form[q.id].length : !form[q.id])
  if (missing) {
    showToast('还有题没选：' + missing.title.replace(/^\d+\.\s*/, ''))
    return
  }
  busy.value = true
  try {
    const res = await axios.post(API_BASE + '/survey', {
      sessionId: store.sessionId,
      version: '0.0.6',
      score: { 很难用: 1, 一般: 2, 还行: 3, 好用: 4, 会推荐: 5 }[form.feel] || 3,
      used: form.used,
      answers: {
        feel: form.feel,
        used: form.used,
        schedule: form.schedule,
        pain: form.pain,
        wish: form.wish,
        again: form.again
      }
    })
    if (!res.data?.success) throw new Error(res.data?.message || '提交失败')
    done.value = true
    showToast('问卷已提交')
  } catch (e) {
    showToast(e.message || '提交失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.survey-page {
  max-width: 600px;
  margin: 0 auto;
  min-height: 100vh;
  padding: calc(var(--safe-top) + 8px) 14px calc(20px + var(--safe-bottom));
}
.as-top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 10px;
}
.nav-icon-btn, .nav-spacer {
  width: 36px;
  height: 36px;
}
.nav-icon-btn {
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}
.as-title-wrap { text-align: center; }
.as-title-wrap .xd-kicker { display: block; margin-bottom: 2px; }
.nav-title { font-size: 17px; font-weight: 800; color: var(--text-primary); }
.as-sub { font-size: 11px; color: var(--text-tertiary); font-weight: 600; }
.survey-card { padding: 16px; }
.lead { font-size: 13px; color: var(--text-secondary); line-height: 1.55; margin-bottom: 8px; }
.q-block { margin-top: 14px; }
.q-label { display: block; font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }
.chip-wrap {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 8px;
}
.chip {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card-solid);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.82),
    inset 0 -1px 0 rgba(40,28,16,0.10),
    0 8px 18px -14px rgba(40,28,16,0.32);
}
.chip:active {
  transform: translateY(1px);
  box-shadow:
    inset 0 1px 2px rgba(40,28,16,0.14),
    inset 0 -1px 0 rgba(255,255,255,0.35);
}
.chip.on {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.38),
    inset 0 -1px 0 rgba(40,28,16,0.18);
}
.submit {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 44px;
  margin-top: 18px;
  border: 1px solid var(--primary-deep);
  border-radius: var(--radius-card);
  background: var(--primary);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}
.submit:disabled { opacity: 0.45; }
.ok { margin-top: 10px; font-size: 13px; color: var(--success); font-weight: 700; }
</style>
