import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { apiClient, useAppStore } from './app.js'
import { accountKey, writeAccountCache } from '../utils/storageCache.js'

class MemoryStorage {
  data = new Map()
  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const snapshot = (semester, name) => ({ success: true, semester, semesterStart: '2026-09-07', courses: [{ name, dayIndex: 0, periods: [1, 2], weeks: '1-20' }], periods: [], semesters: [] })
function setupSession(user = 'alice') {
  localStorage.setItem('loginUser', user)
  localStorage.setItem('studentId', user)
  localStorage.setItem('sessionId', `token-${user}`)
  return useAppStore()
}
beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
  globalThis.sessionStorage = new MemoryStorage()
  setActivePinia(createPinia())
  apiClient.defaults.adapter = async config => reply(config, { success: true, profile: {} })
})

test('startup deletes legacy password and tolerates corrupt cache', () => {
  localStorage.setItem('loginPass', 'old-password')
  localStorage.setItem('loginUser', 'alice')
  localStorage.setItem('studentId', 'alice')
  localStorage.setItem('cachedCourses', '{broken')
  const store = useAppStore()
  assert.equal(localStorage.getItem('loginPass'), null)
  assert.deepEqual(store.courses, [])
  assert.equal(store.currentWeek, null)
})

test('login never persists password and logout revokes the captured token', async () => {
  const requests = []
  apiClient.defaults.adapter = async config => {
    requests.push(config)
    return reply(config, config.url === '/login' ? { success: true, sessionId: 'new-token', studentName: 'A' } : { success: true, profile: {} })
  }
  const store = useAppStore()
  assert.equal(await store.login('alice', 'transient-password'), true)
  assert.equal(localStorage.getItem('loginPass'), null)
  assert.equal([...localStorage.data.values()].some(value => value.includes('transient-password')), false)
  const result = await store.logout()
  assert.equal(result.success, true)
  const revoke = requests.find(config => config.url === '/logout')
  assert.equal(revoke.headers.get('X-Session-Id'), 'new-token')
  assert.equal(store.isLoggedIn, false)
  assert.equal(localStorage.getItem('sessionId'), null)
})

test('session expiry keeps cached courses and never auto-submits a password', async () => {
  const store = setupSession()
  store.courses = [{ name: '保存的课表' }]
  const paths = []
  apiClient.defaults.adapter = async config => {
    paths.push(config.url)
    return reply(config, { success: false, sessionExpired: true })
  }
  await store.fetchSchedule()
  assert.equal(store.sessionExpired, true)
  assert.equal(store.courses[0].name, '保存的课表')
  assert.equal(paths.includes('/login'), false)
  assert.match(store.scheduleError, /重新登录/)
})

test('failed refresh retains successful schedule and sync time', async () => {
  const store = setupSession()
  apiClient.defaults.adapter = async config => reply(config, snapshot('2026-2027-1', '旧课'))
  await store.fetchSchedule(undefined, { skipCalendar: true })
  const time = store.scheduleSyncedAt
  apiClient.defaults.adapter = async () => { throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }) }
  await store.fetchSchedule()
  assert.equal(store.courses[0].name, '旧课')
  assert.equal(store.scheduleSyncedAt, time)
  assert.match(store.scheduleError, /已保留/)
})

test('mismatched semester response cannot overwrite the current schedule', async () => {
  const store = setupSession()
  store.semester = 'A'
  store.courses = [{ name: 'A课程' }]
  apiClient.defaults.adapter = async config => reply(config, snapshot('B', '错误学期课程'))
  const result = await store.fetchSchedule('C', { skipCalendar: true })
  assert.equal(result.success, false)
  assert.equal(store.semester, 'A')
  assert.equal(store.courses[0].name, 'A课程')
})

test('late response from an earlier semester cannot replace the latest choice', async () => {
  const store = setupSession()
  const pending = new Map()
  apiClient.defaults.adapter = config => new Promise(resolve => pending.set(config.params.xnxq, data => resolve(reply(config, data))))
  const a = store.fetchSchedule('A', { skipCalendar: true })
  const b = store.fetchSchedule('B', { skipCalendar: true })
  pending.get('B')(snapshot('B', 'B课程'))
  await b
  pending.get('A')(snapshot('A', 'A课程'))
  await a
  assert.equal(store.semester, 'B')
  assert.equal(store.courses[0].name, 'B课程')
})

test('A-B-A rapid switching honors the final A request', async () => {
  const store = setupSession()
  const pending = []
  apiClient.defaults.adapter = config => new Promise(resolve => pending.push(data => resolve(reply(config, data))))
  const a1 = store.fetchSchedule('A', { skipCalendar: true })
  const b = store.fetchSchedule('B', { skipCalendar: true })
  const a2 = store.fetchSchedule('A', { skipCalendar: true })
  assert.equal(pending.length, 3)
  pending[2](snapshot('A', '最新A'))
  await a2
  pending[1](snapshot('B', 'B'))
  pending[0](snapshot('A', '旧A'))
  await Promise.all([a1, b])
  assert.equal(store.courses[0].name, '最新A')
})

test('account switching does not reuse another student’s cache or custom items', async () => {
  writeAccountCache('alice', 'selectedSemester', 'A')
  writeAccountCache('alice', 'schedule', snapshot('A', 'Alice课程'), 'A')
  writeAccountCache('alice', 'custom', [{ id: 'personal', name: 'Alice日程', semester: 'A' }])
  const store = setupSession()
  assert.equal(store.courses[0].name, 'Alice课程')
  apiClient.defaults.adapter = async config => reply(config, config.url === '/login' ? { success: true, sessionId: 'token-bob', studentId: 'bob' } : { success: true, profile: {} })
  await store.login('bob', 'password')
  assert.deepEqual(store.courses, [])
  assert.deepEqual(store.customCourses, [])
  assert.ok(localStorage.getItem(accountKey('alice', 'custom')))
})

test('resource loading states are independent under concurrent requests', async () => {
  const store = setupSession()
  let finishGrades
  apiClient.defaults.adapter = config => config.url === '/grades'
    ? new Promise(resolve => { finishGrades = () => resolve(reply(config, { success: true, grades: [], semesters: [] })) })
    : Promise.resolve(reply(config, { success: true, exams: [] }))
  const grades = store.fetchGrades()
  await store.fetchExams()
  assert.equal(store.examLoading, false)
  assert.equal(store.gradesLoading, true)
  finishGrades()
  await grades
  assert.equal(store.gradesLoading, false)
})

test('live clock advances teaching week and includes custom items with real section times', () => {
  const store = setupSession()
  store.semester = '2026-2027-1'
  store.semesterStart = '2026-09-07'
  store.clock = new Date('2026-09-13T23:59:00')
  assert.equal(store.currentWeek, 1)
  store.clock = new Date('2026-09-14T00:01:00')
  assert.equal(store.currentWeek, 2)
  const id = store.addCustomCourse({ name: '单次组会', date: '2026-09-14', dayIndex: 0, periods: [3, 4] })
  assert.equal(store.todayCourses.length, 1)
  assert.equal(store.courseTime(store.todayCourses[0]), '10:00-11:25')
  store.updateCustomCourse(id, { name: '改名组会' })
  assert.equal(store.todayCourses[0].name, '改名组会')
  store.clock = new Date('2026-09-21T00:01:00')
  assert.equal(store.todayCourses.length, 0)
  store.removeCustomCourse(id)
  assert.equal(store.customCourses.length, 0)
})

test('unattributed legacy caches cannot be assigned to a later account', async () => {
  localStorage.setItem('loginUser', 'alice')
  localStorage.setItem('studentId', 'different-student')
  localStorage.setItem('cachedCourses', JSON.stringify([{ name: '另一账号的课程' }]))
  localStorage.setItem('customCourses', JSON.stringify([{ name: '旧个人日程' }]))
  const store = useAppStore()
  assert.deepEqual(store.courses, [])
  assert.equal(localStorage.getItem('cachedCourses'), null)
  assert.ok(localStorage.getItem('xuedu:legacy-unassigned-custom'))
  apiClient.defaults.adapter = async config => reply(config, config.url === '/login' ? { success: true, sessionId: 'bob-token', studentId: 'bob' } : { success: true, profile: {} })
  await store.login('bob', 'password')
  setActivePinia(createPinia())
  const reopened = useAppStore()
  assert.deepEqual(reopened.courses, [])
  assert.deepEqual(reopened.customCourses, [])
})

test('a response arriving after logout cannot restore the previous account data', async () => {
  const store = setupSession()
  let finishSchedule
  apiClient.defaults.adapter = config => config.url === '/schedule'
    ? new Promise(resolve => { finishSchedule = () => resolve(reply(config, snapshot('A', '退出前的课'))) })
    : Promise.resolve(reply(config, { success: true }))
  const pending = store.fetchSchedule('A', { skipCalendar: true })
  await store.logout()
  finishSchedule()
  await pending
  assert.deepEqual(store.courses, [])
  assert.equal(store.sessionId, '')
  assert.equal(store.scheduleLoading, false)
})

test('storage quota errors do not prevent a successful login or schedule refresh', async () => {
  localStorage.setItem = () => { throw new Error('QuotaExceededError') }
  apiClient.defaults.adapter = async config => reply(config, config.url === '/login'
    ? { success: true, sessionId: 'memory-token', studentId: 'alice' }
    : config.url === '/schedule' ? snapshot('A', '内存课表') : { success: true, profile: {} })
  const store = useAppStore()
  assert.equal(await store.login('alice', 'password'), true)
  assert.equal((await store.fetchSchedule('A', { skipCalendar: true })).success, true)
  assert.equal(store.courses[0].name, '内存课表')
})

test('update check sends the test channel and native Android version code', async () => {
  const store = setupSession()
  let request
  apiClient.defaults.adapter = async config => {
    request = config
    return reply(config, { success: true, latestVersion: '0.0.1', versionCode: 250 })
  }

  await store.checkUpdate('0.0.1', 250)

  assert.equal(request.url, '/app/check-update')
  assert.deepEqual(request.params, { version: '0.0.1', channel: 'test', versionCode: 250 })
  assert.equal(request.headers.get('X-App-Version-Code'), '250')
  assert.equal(request.headers.get('X-App-Channel'), 'test')
})

test('offline semester switching uses only the selected term’s own successful snapshot', async () => {
  const cached = { ...snapshot('B', 'B缓存课表'), syncedAt: 12345 }
  writeAccountCache('alice', 'schedule', cached, 'B')
  const store = setupSession()
  store.semester = 'A'
  store.courses = [{ name: 'A课程' }]
  store.calendar = { semester: 'A' }
  apiClient.defaults.adapter = async () => { throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }) }
  await store.fetchSchedule('B')
  assert.equal(store.semester, 'B')
  assert.equal(store.courses[0].name, 'B缓存课表')
  assert.equal(store.scheduleSyncedAt, 12345)
  assert.equal(store.calendar, null)
  assert.match(store.scheduleError, /已保留/)
})

test('retired demo sessions cannot hydrate fictional data and preserve only personal custom items', () => {
  localStorage.setItem('loginUser', 'xuedu_demo')
  localStorage.setItem('studentId', 'xuedu_demo')
  localStorage.setItem('sessionId', 'demo-token')
  localStorage.setItem('isDemo', '1')
  localStorage.setItem('cachedCourses', JSON.stringify([{ name: '虚构课表' }]))
  localStorage.setItem('customCourses', JSON.stringify([{ name: '自己的日程' }]))
  writeAccountCache('alice', 'grades', [{ name: '真实账号缓存' }])
  const store = useAppStore()
  assert.equal(store.isLoggedIn, false)
  assert.deepEqual(store.courses, [])
  assert.deepEqual(store.customCourses, [])
  assert.equal(localStorage.getItem('sessionId'), null)
  assert.equal(localStorage.getItem('isDemo'), null)
  assert.equal(localStorage.getItem('cachedCourses'), null)
  assert.equal(localStorage.getItem(accountKey('xuedu_demo', 'schedule', '')), null)
  assert.ok(localStorage.getItem(accountKey('xuedu_demo', 'custom')))
  assert.ok(localStorage.getItem(accountKey('alice', 'grades')))
})

test('retired demo login is rejected and legacy-server demo sessions are revoked', async () => {
  const requests = []
  apiClient.defaults.adapter = async config => {
    requests.push(config)
    return reply(config, config.url === '/login'
      ? { success: true, demo: true, sessionId: 'legacy-demo-token' }
      : { success: true })
  }
  const store = useAppStore()
  assert.equal(await store.login('xuedu_demo', 'unused'), false)
  assert.equal(requests.length, 0)
  assert.equal(await store.login('legacy-custom-demo', 'unused'), false)
  assert.equal(store.isLoggedIn, false)
  assert.match(store.authError, /测试账号已停用/)
  assert.equal(requests.find(config => config.url === '/logout').headers.get('X-Session-Id'), 'legacy-demo-token')
})

test('restoring a legacy-server demo session signs out instead of accepting it', async () => {
  const store = setupSession('legacy-custom-demo')
  apiClient.defaults.adapter = async config => reply(config, config.url === '/session'
    ? { success: true, demo: true }
    : { success: true })
  assert.equal(await store.restoreSession(), false)
  assert.equal(store.isLoggedIn, false)
  assert.match(store.authError, /测试账号已停用/)
})

test('a single-date custom agenda remains usable when the teaching-week start is unknown', () => {
  const store = setupSession()
  store.semester = 'future-term'
  store.clock = new Date('2026-09-09T10:00:00')
  store.courses = [{ name: '日期未知的重复课', dayIndex: 2, weeks: '1-20', periods: [3, 4] }]
  store.addCustomCourse({ name: '已确定日期的日程', date: '2026-09-09', dayIndex: 2, periods: [3, 4] })
  assert.equal(store.currentWeek, null)
  assert.equal(store.todayCourses.length, 1)
  assert.equal(store.todayCourses[0].name, '已确定日期的日程')
  assert.equal(store.isCourseInWeek(store.customCourses[0], null), true)
  assert.equal(store.isCourseInWeek(store.courses[0], null), false)
})
