const PREFIX = 'xuedu:v2:'
const LEGACY_KEYS = ['cachedCourses', 'cachedPeriods', 'cachedGrades', 'cachedExams', 'cachedProfile', 'cachedProgram', 'customCourses', 'cachedSemesters', 'cachedSchedSemesters', 'selectedSemester', 'selectedSemesterText', 'semesterStart', 'currentWeek']

export function readLocal(key, fallback = '') {
  try { return globalThis.localStorage?.getItem(key) ?? fallback } catch { return fallback }
}
export function writeLocal(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); return true } catch { return false }
}
export function removeLocal(key) { try { globalThis.localStorage?.removeItem(key) } catch {} }
export function readJson(key, fallback, validate = () => true) {
  try { const value = JSON.parse(readLocal(key, 'null')); return value !== null && validate(value) ? value : fallback } catch { return fallback }
}
export function accountKey(user, resource, semester = '') {
  return `${PREFIX}${encodeURIComponent(user)}:${resource}:${encodeURIComponent(semester)}`
}
export function readAccountCache(user, resource, semester = '', fallback = null) {
  return user ? readJson(accountKey(user, resource, semester), fallback) : fallback
}
export function writeAccountCache(user, resource, value, semester = '') {
  return !!user && writeLocal(accountKey(user, resource, semester), JSON.stringify(value))
}
export function clearAccountCache(user, { preserveCustom = true } = {}) {
  if (!user) return
  const prefix = `${PREFIX}${encodeURIComponent(user)}:`
  try {
    const storage = globalThis.localStorage
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    for (const key of keys) {
      if (key?.startsWith(prefix) && !(preserveCustom && key === accountKey(user, 'custom'))) removeLocal(key)
    }
  } catch {}
}
// Import only the original account's cache; credentials are never migrated.
export function migrateLegacyCache(user) {
  removeLocal('loginPass')
  const existingStudent = readLocal('studentId')
  if (!user || readLocal('loginUser') !== user || (existingStudent && existingStudent !== user)) {
    // Keep an unattributed custom-data backup for manual recovery; never assign
    // another account's legacy data to the next account that signs in.
    const custom = readJson('customCourses', null, Array.isArray)
    if (custom?.length && !readLocal('xuedu:legacy-unassigned-custom')) writeLocal('xuedu:legacy-unassigned-custom', JSON.stringify(custom))
    for (const key of LEGACY_KEYS) removeLocal(key)
    return
  }
  const sem = readLocal('selectedSemester')
  const oldCourses = readJson('cachedCourses', [], Array.isArray)
  if (oldCourses.length && !readAccountCache(user, 'schedule', sem)) {
    writeAccountCache(user, 'schedule', {
      courses: oldCourses, periods: readJson('cachedPeriods', [], Array.isArray),
      semester: sem, semesterText: readLocal('selectedSemesterText'), semesterStart: readLocal('semesterStart'),
      semesters: readJson('cachedSchedSemesters', [], Array.isArray), syncedAt: 0
    }, sem)
    writeAccountCache(user, 'selectedSemester', sem)
  }
  for (const [resource, key] of [['grades', 'cachedGrades'], ['exams', 'cachedExams'], ['profile', 'cachedProfile'], ['program', 'cachedProgram'], ['custom', 'customCourses'], ['semesters', 'cachedSemesters']]) {
    const data = readJson(key, null)
    if (data && readAccountCache(user, resource) === null) writeAccountCache(user, resource, data)
  }
  for (const key of LEGACY_KEYS) removeLocal(key)
}
