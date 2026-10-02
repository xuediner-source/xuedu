import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/store/app'

const routes = [
  {
    path: '/',
    redirect: '/schedule'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { noAuth: true }
  },
  {
    path: '/schedule',
    name: 'Schedule',
    component: () => import('@/views/Schedule.vue'),
    meta: { title: '课表', icon: 'calendar-o' }
  },
  {
    path: '/grades',
    name: 'Grades',
    component: () => import('@/views/Grades.vue'),
    meta: { title: '成绩', icon: 'star-o' }
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页', icon: 'home-o' }
  },
  {
    path: '/calendar-weather',
    name: 'CalendarWeather',
    component: () => import('@/views/CalendarWeather.vue'),
    meta: { title: '校历天气', icon: 'calendar-o' }
  },
  {
    path: '/exam',
    name: 'Exam',
    component: () => import('@/views/Exam.vue'),
    meta: { title: '考试', icon: 'notes-o' }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/Profile.vue'),
    meta: { title: '我的', icon: 'contact' }
  },
  {
    path: '/program',
    name: 'Program',
    component: () => import('@/views/Program.vue'),
    meta: { title: '培养方案' }
  },
  {
    path: '/classrooms',
    name: 'Classrooms',
    component: () => import('@/views/Classrooms.vue'),
    meta: { title: '空闲教室' }
  },
  {
    path: '/assistant',
    name: 'Assistant',
    component: () => import('@/views/Assistant.vue'),
    meta: { title: '学渡助手' }
  },
  {
    path: '/survey',
    name: 'Survey',
    component: () => import('@/views/Survey.vue'),
    meta: { title: '体验反馈' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const store = useAppStore()
  if (!store.isLoggedIn && !to.meta.noAuth) {
    next('/login')
  } else {
    next()
  }
})

export default router
