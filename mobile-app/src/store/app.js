import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import axios from 'axios'
import { Capacitor } from '@capacitor/core'
import { calcWeekNumber, isCourseInWeek as matchesWeek, parseDateOnly, CQJTU_PERIODS } from '../utils/scheduleModel.js'
import { clearAccountCache, migrateLegacyCache, readAccountCache, readLocal, removeLocal, writeAccountCache, writeLocal } from '../utils/storageCache.js'

export const API_BASE = import.meta.env?.VITE_API_BASE || (Capacitor.isNativePlatform() ? 'https://xuediner.xyz/api' : '/api')
export const apiClient = axios.create({ baseURL: API_BASE, timeout: 20000 })
const EXPIRED_MESSAGE = '教务会话已过期，请重新登录；已保存的课表仍可查看'
const validArray = value => Array.isArray(value) ? value : []
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1'
const APP_CHANNEL = typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'test'

export const useAppStore = defineStore('app', () => {
  removeLocal('loginPass')
  removeLocal('xueduDsApiKey')
  const sessionId = ref(readLocal('sessionId'))
  const account = ref(readLocal('loginUser') || readLocal('studentId'))
  migrateLegacyCache(account.value)
  const studentName = ref(readLocal('studentName'))
  const studentId = ref(readLocal('studentId'))
  const isDemo = ref(readLocal('isDemo') === '1')
  const clock = ref(new Date())
  const isOffline = ref(typeof navigator !== 'undefined' && navigator.onLine === false)
  const sessionExpired = ref(false)
  const semester = ref('')
  const semesterText = ref('')
  const semesterStart = ref('')
  const scheduleSyncedAt = ref(0)
  const courses = ref([])
  const customCourses = ref([])
  const periods = ref([])
  const grades = ref([])
  const semesters = ref([])
  const scheduleSemesters = ref([])
  const exams = ref([])
  const profile = ref(null)
  const program = ref(null)
  const weather = ref(null)
  const calendar = ref(null)
  const assistantKey = ref('')
  const campus = ref(readLocal('weatherCampus', 'kexuecheng'))
  const density = ref([48, 58, 70].includes(Number(readLocal('scheduleDensity'))) ? Number(readLocal('scheduleDensity')) : 58)
  const theme = ref(readLocal('scheduleTheme', 'pastel'))
  const scheduleDays = ref(Number(readLocal('scheduleDays')) === 5 ? 5 : 7)
  const requests = reactive(Object.fromEntries(['auth', 'schedule', 'grades', 'exam', 'profile', 'program', 'classrooms', 'weather', 'calendar'].map(key => [key, { pending: 0, error: '' }])))
  const loading = computed(() => Object.values(requests).some(item => item.pending > 0))
  const error = computed(() => Object.values(requests).find(item => item.error)?.error || '')
  const isLoggedIn = computed(() => !!sessionId.value)
  const currentWeek = computed(() => calcWeekNumber(clock.value, semesterStart.value))
  const allCourses = computed(() => [...courses.value, ...customCourses.value.filter(c => !c.semester || c.semester === semester.value)])
  const todayCourses = computed(() => coursesOnDate(clock.value))
  const tomorrowCourses = computed(() => {
    const date = new Date(clock.value)
    date.setDate(date.getDate() + 1)
    return coursesOnDate(date)
  })
  let generation = 0
  let scheduleSequence = 0
  let latestScheduleRequested = ''
  const inFlight = new Map()

  function newId() {
    return globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  function normalizeCustom(items) {
    return validArray(items).filter(item => item && typeof item.name === 'string').map(item => ({
      ...item, id: item.id || newId(), semester: item.semester || semester.value || ''
    }))
  }
  function applySnapshot(snapshot) {
    if (semester.value !== (snapshot?.semester || '')) calendar.value = null
    courses.value = validArray(snapshot?.courses)
    periods.value = validArray(snapshot?.periods)
    semester.value = snapshot?.semester || ''
    semesterText.value = snapshot?.semesterText || ''
    semesterStart.value = parseDateOnly(snapshot?.semesterStart)
    scheduleSemesters.value = validArray(snapshot?.semesters)
    scheduleSyncedAt.value = Number(snapshot?.syncedAt) || 0
  }
  function hydrate(user) {
    const selected = readAccountCache(user, 'selectedSemester', '', '')
    applySnapshot(readAccountCache(user, 'schedule', typeof selected === 'string' ? selected : ''))
    grades.value = validArray(readAccountCache(user, 'grades'))
    exams.value = validArray(readAccountCache(user, 'exams'))
    semesters.value = validArray(readAccountCache(user, 'semesters'))
    profile.value = readAccountCache(user, 'profile')
    program.value = readAccountCache(user, 'program')
    customCourses.value = normalizeCustom(readAccountCache(user, 'custom'))
    if (customCourses.value.length) writeAccountCache(user, 'custom', customCourses.value)
  }
  hydrate(account.value)

  function formatNetError(e) {
    if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') return '同步超时，已保留上次数据，请稍后重试'
    if (e?.code === 'ERR_NETWORK' || /network error/i.test(e?.message || '')) return '无法连接服务器，已保留上次数据，请检查网络'
    if (e?.response?.status >= 500 && !e?.response?.data?.message) return '服务器暂时不可用，已保留上次数据，请稍后重试'
    return e?.response?.data?.message || e?.message || '请求失败，请稍后重试'
  }
  function expired(data) {
    return !data?.success && (data?.sessionExpired || /未登录|过期/.test(data?.message || ''))
  }
  async function run(resource, task, isCurrent = () => true) {
    const epoch = generation
    requests[resource].pending++
    requests[resource].error = ''
    try { return await task(epoch) }
    catch (e) {
      if (epoch === generation && isCurrent()) requests[resource].error = formatNetError(e)
      return { success: false, message: formatNetError(e) }
    } finally {
      if (epoch === generation) requests[resource].pending = Math.max(0, requests[resource].pending - 1)
    }
  }
  async function requestWithSession(path, params = {}) {
    if (!sessionId.value) return { data: { success: false, sessionExpired: true, message: EXPIRED_MESSAGE } }
    const token = sessionId.value
    const epoch = generation
    const res = await apiClient.get(path, { params, headers: { 'X-Session-Id': token } })
    if (epoch === generation && token === sessionId.value && expired(res.data)) sessionExpired.value = true
    return res
  }
  function resetRequestState() {
    for (const request of Object.values(requests)) { request.pending = 0; request.error = '' }
    inFlight.clear()
  }
  async function login(username, password) {
    return run('auth', async epoch => {
      const res = await apiClient.post('/login', { username, password }, { timeout: 45000 })
      if (epoch !== generation) return false
      if (!res.data.success || !res.data.sessionId) {
        requests.auth.error = res.data.message || '登录失败'
        return false
      }
      generation++
      resetRequestState()
      account.value = username
      assistantKey.value = ''
      hydrate(username)
      sessionId.value = res.data.sessionId
      studentName.value = res.data.studentName || ''
      studentId.value = res.data.studentId || username
      isDemo.value = !!res.data.demo
      sessionExpired.value = false
      writeLocal('sessionId', sessionId.value)
      writeLocal('studentName', studentName.value)
      writeLocal('studentId', studentId.value)
      writeLocal('loginUser', username)
      writeLocal('isDemo', isDemo.value ? '1' : '0')
      removeLocal('loginPass')
      void fetchProfile()
      return true
    }).then(result => result === true)
  }
  async function restoreSession() {
    if (!sessionId.value) return false
    return run('auth', async epoch => {
      const res = await requestWithSession('/session')
      if (epoch !== generation) return false
      if (res.data.success) { sessionExpired.value = false; return true }
      requests.auth.error = EXPIRED_MESSAGE
      return false
    }).then(result => result === true || (isOffline.value && !!sessionId.value && !!courses.value.length))
  }
  async function ensureSession() { return restoreSession() }

  function fetchSchedule(xnxq, options = {}) {
    const requested = xnxq || semester.value || ''
    const key = `schedule:${generation}:${requested}`
    if (inFlight.has(key) && requested === latestScheduleRequested) return inFlight.get(key)
    latestScheduleRequested = requested
    const seq = ++scheduleSequence
    if (requested && requested !== semester.value) {
      const cached = readAccountCache(account.value, 'schedule', requested)
      if (cached?.semester === requested && Array.isArray(cached.courses) && Array.isArray(cached.periods)) {
        applySnapshot(cached)
        writeAccountCache(account.value, 'selectedSemester', requested)
      }
    }
    const task = run('schedule', async epoch => {
      const res = await requestWithSession('/schedule', requested ? { xnxq: requested } : {})
      if (epoch !== generation || seq !== scheduleSequence) return { success: false, superseded: true }
      if (!res.data.success) {
        requests.schedule.error = expired(res.data) ? EXPIRED_MESSAGE : (res.data.message || '获取课表失败')
        return res.data
      }
      if (requested && res.data.semester !== requested) {
        requests.schedule.error = '教务返回的学期与所选学期不一致，已保留原课表'
        return { success: false, message: requests.schedule.error }
      }
      if (!Array.isArray(res.data.courses) || !Array.isArray(res.data.periods)) throw new Error('课表数据格式异常，已保留原课表')
      const snapshot = { ...res.data, syncedAt: Date.now() }
      applySnapshot(snapshot)
      clock.value = new Date()
      writeAccountCache(account.value, 'schedule', snapshot, semester.value)
      writeAccountCache(account.value, 'selectedSemester', semester.value)
      customCourses.value = normalizeCustom(customCourses.value)
      writeAccountCache(account.value, 'custom', customCourses.value)
      if (!options.skipCalendar) void fetchCalendar(semester.value)
      return res.data
    }, () => seq === scheduleSequence).finally(() => {
      if (inFlight.get(key) === task) inFlight.delete(key)
    })
    inFlight.set(key, task)
    return task
  }
  function fetchCachedResource(resource, path, field, target) {
    const key = `${resource}:${generation}`
    if (inFlight.has(key)) return inFlight.get(key)
    const task = run(resource, async epoch => {
      const res = await requestWithSession(path)
      if (epoch !== generation) return { success: false, superseded: true }
      if (!res.data.success) {
        requests[resource].error = expired(res.data) ? EXPIRED_MESSAGE : (res.data.message || '同步失败')
        return res.data
      }
      const value = field ? res.data[field] : res.data
      if (Array.isArray(target.value) && !Array.isArray(value)) throw new Error('服务器数据格式异常，已保留上次数据')
      target.value = value
      writeAccountCache(account.value, resource === 'exam' ? 'exams' : resource, value)
      if (resource === 'grades') {
        semesters.value = validArray(res.data.semesters)
        writeAccountCache(account.value, 'semesters', semesters.value)
      }
      if (resource === 'profile' && value) {
        studentName.value = value.studentName || studentName.value
        studentId.value = value.studentId || studentId.value
        writeLocal('studentName', studentName.value)
        writeLocal('studentId', studentId.value)
      }
      return res.data
    }).finally(() => inFlight.delete(key))
    inFlight.set(key, task)
    return task
  }
  const fetchGrades = () => fetchCachedResource('grades', '/grades', 'grades', grades)
  const fetchExams = () => fetchCachedResource('exam', '/exams', 'exams', exams)
  const fetchProfile = () => fetchCachedResource('profile', '/profile', 'profile', profile)
  const fetchProgram = () => fetchCachedResource('program', '/program', '', program)
  async function fetchClassrooms(query = {}) {
    return run('classrooms', async epoch => {
      const res = await requestWithSession('/classrooms', query)
      if (epoch === generation && !res.data.success) requests.classrooms.error = res.data.message || '查询失败'
      return res.data
    })
  }
  async function fetchWeather(nextCampus) {
    const id = nextCampus || campus.value
    campus.value = id
    writeLocal('weatherCampus', id)
    return run('weather', async epoch => {
      const res = await apiClient.get('/weather', { params: { campus: id } })
      if (epoch === generation && id === campus.value && res.data.success) weather.value = res.data
      if (epoch === generation && id === campus.value && !res.data.success) requests.weather.error = res.data.message || '天气同步失败'
      return res.data
    }, () => id === campus.value)
  }
  async function fetchCalendar(xnxq) {
    const selected = xnxq || semester.value
    return run('calendar', async epoch => {
      const res = await apiClient.get('/calendar', { params: selected ? { xnxq: selected } : {} })
      if (epoch === generation && (!selected || selected === semester.value) && res.data.success) calendar.value = res.data
      if (epoch === generation && (!selected || selected === semester.value) && !res.data.success) requests.calendar.error = res.data.message || '校历同步失败'
      return res.data
    }, () => !selected || selected === semester.value)
  }
  async function checkUpdate(currentVersion = APP_VERSION, versionCode = 0) {
    const code = Number(versionCode)
    const params = { version: currentVersion, channel: APP_CHANNEL }
    const headers = { 'X-App-Version': currentVersion, 'X-App-Channel': APP_CHANNEL }
    if (Number.isSafeInteger(code) && code > 0) {
      params.versionCode = code
      headers['X-App-Version-Code'] = String(code)
    }
    try { return (await apiClient.get('/app/check-update', { params, headers })).data }
    catch (e) { return { success: false, message: formatNetError(e) } }
  }
  function saveCustom() { writeAccountCache(account.value, 'custom', customCourses.value) }
  function addCustomCourse(item) {
    const course = { ...item, id: newId(), semester: item.semester || semester.value }
    customCourses.value.push(course); saveCustom(); return course.id
  }
  function updateCustomCourse(id, patch) {
    const index = customCourses.value.findIndex(item => item.id === id)
    if (index < 0) return false
    customCourses.value[index] = { ...customCourses.value[index], ...patch, id }
    saveCustom(); return true
  }
  function removeCustomCourse(id) {
    const index = typeof id === 'number' ? id : customCourses.value.findIndex(item => item.id === id)
    if (index >= 0) customCourses.value.splice(index, 1)
    saveCustom()
  }
  async function logout() {
    const token = sessionId.value
    const user = account.value
    const previousStudent = studentId.value
    generation++; scheduleSequence++; resetRequestState()
    sessionId.value = ''; studentName.value = ''; studentId.value = ''; account.value = ''
    isDemo.value = false; sessionExpired.value = false
    applySnapshot(null)
    grades.value = []; exams.value = []; semesters.value = []; customCourses.value = []
    profile.value = null; program.value = null; calendar.value = null; assistantKey.value = ''
    try { sessionStorage.removeItem(`xueduAssistant:${previousStudent}`); sessionStorage.removeItem('xueduAssistant') } catch {}
    clearAccountCache(user)
    for (const key of ['sessionId', 'studentName', 'studentId', 'loginUser', 'loginPass', 'isDemo']) removeLocal(key)
    if (!token) return { success: true }
    try { return (await apiClient.post('/logout', {}, { headers: { 'X-Session-Id': token }, timeout: 5000 })).data }
    catch { return { success: false, message: '已清除本地会话，服务器注销未完成；原会话将在服务器到期后失效' } }
  }
  function courseTime(course) {
    if (course.time) return course.time
    if (course.startTime && course.endTime) return `${course.startTime}-${course.endTime}`
    const nums = validArray(course.periods).map(Number).filter(n => n >= 1 && n <= CQJTU_PERIODS.length).sort((a, b) => a - b)
    if (nums.length) return `${CQJTU_PERIODS[nums[0] - 1].start}-${CQJTU_PERIODS[nums.at(-1) - 1].end}`
    return periods.value[course.rowIndex]?.time || ''
  }
  function isCourseInWeek(course, week, context = {}) {
    let date = context.date
    const start = parseDateOnly(semesterStart.value)
    if (!date && course.date && (week === null || !start)) {
      date = new Date(clock.value)
      date.setDate(date.getDate() - (date.getDay() + 6) % 7 + Number(course.dayIndex || 0))
    }
    if (!date && start && Number.isFinite(Number(week))) {
      date = new Date(start + 'T00:00:00')
      date.setDate(date.getDate() - (date.getDay() + 6) % 7 + (Number(week) - 1) * 7 + Number(course.dayIndex || 0))
    }
    return matchesWeek(course, week, { ...context, date, semester: context.semester || semester.value })
  }
  function coursesOnDate(date) {
    const week = calcWeekNumber(date, semesterStart.value)
    const dayIndex = (date.getDay() + 6) % 7
    return allCourses.value.filter(course => course.dayIndex === dayIndex && isCourseInWeek(course, week, { date }))
      .sort((a, b) => courseTime(a).localeCompare(courseTime(b)))
  }
  function setDensity(value) { density.value = value; writeLocal('scheduleDensity', value) }
  function setTheme(value) { theme.value = value; writeLocal('scheduleTheme', value) }
  function setScheduleDays(value) { scheduleDays.value = Number(value) === 5 ? 5 : 7; writeLocal('scheduleDays', scheduleDays.value) }
  function updateClock() { clock.value = new Date() }
  function setOffline(value) { isOffline.value = !!value }
  const resourceState = Object.fromEntries(Object.keys(requests).flatMap(resource => [
    [`${resource}Loading`, computed(() => requests[resource].pending > 0)],
    [`${resource}Error`, computed(() => requests[resource].error)]
  ]))
  return {
    sessionId, studentName, studentId, courses, customCourses, allCourses, todayCourses, tomorrowCourses, periods, semester, semesterText,
    semesterStart, currentWeek, grades, semesters, scheduleSemesters, exams, profile, program,
    weather, calendar, assistantKey, campus, density, theme, scheduleDays, loading, error, requests, isLoggedIn, isDemo,
    clock, updateClock, isOffline, setOffline, scheduleSyncedAt, sessionExpired, ...resourceState,
    login, ensureSession, fetchSchedule, fetchGrades, fetchExams, fetchWeather, fetchCalendar,
    fetchProfile, fetchProgram, fetchClassrooms, logout, checkUpdate, restoreSession,
    addCustomCourse, updateCustomCourse, removeCustomCourse, setDensity, setTheme, setScheduleDays,
    calcCurrentWeek: (startIso = semesterStart.value) => calcWeekNumber(clock.value, startIso),
    isCourseInWeek, weekdayIndex: (date = clock.value) => (date.getDay() + 6) % 7, courseTime
  }
})
