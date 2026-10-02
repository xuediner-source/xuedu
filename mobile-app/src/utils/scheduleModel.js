const DAY_MS = 24 * 60 * 60 * 1000

export const CQJTU_PERIODS = [
  { index: 1, label: '1', start: '08:20', end: '09:00' },
  { index: 2, label: '2', start: '09:05', end: '09:45' },
  { index: 3, label: '3', start: '10:00', end: '10:40' },
  { index: 4, label: '4', start: '10:45', end: '11:25' },
  { index: 5, label: '5', start: '11:30', end: '12:10' },
  { index: 6, label: '6', start: '14:00', end: '14:40' },
  { index: 7, label: '7', start: '14:45', end: '15:25' },
  { index: 8, label: '8', start: '15:40', end: '16:20' },
  { index: 9, label: '9', start: '16:25', end: '17:05' },
  { index: 10, label: '10', start: '17:10', end: '17:50' },
  { index: 11, label: '11', start: '19:00', end: '19:40' },
  { index: 12, label: '12', start: '19:45', end: '20:25' },
  { index: 13, label: '13', start: '20:30', end: '21:10' },
]

function parseIsoDay(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }
  }

  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(0)
  check.setUTCHours(0, 0, 0, 0)
  check.setUTCFullYear(year, month - 1, day)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

function isoFromParts({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dayOrdinal(value) {
  const parts = parseIsoDay(value)
  if (!parts) return null
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  return Math.floor(date.getTime() / DAY_MS)
}

function mondayOrdinal(value) {
  const ordinal = dayOrdinal(value)
  if (ordinal === null) return null
  const weekday = new Date(ordinal * DAY_MS).getUTCDay()
  const mondayOffset = (weekday + 6) % 7
  return ordinal - mondayOffset
}

/** Parse course week labels such as "1-16", "第1至8周、10、12周" or "1,3,5". */
export function parseWeekRanges(text) {
  if (Array.isArray(text)) {
    return text
      .map(range => ({ start: Number(range?.start), end: Number(range?.end) }))
      .filter(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start > 0 && range.end > 0)
      .map(({ start, end }) => ({ start: Math.min(start, end), end: Math.max(start, end) }))
  }

  const source = String(text ?? '')
  const ranges = []
  const matcher = /(^|[^\d])(\d{1,3})(?:\s*[-~～至到—－]\s*(\d{1,3}))?(?!\d)/g
  let match
  while ((match = matcher.exec(source))) {
    const start = Number(match[2])
    const end = Number(match[3] || match[2])
    if (start < 1 || end < 1) continue
    ranges.push({ start: Math.min(start, end), end: Math.max(start, end) })
  }
  return ranges
}

function getRanges(course) {
  if (Array.isArray(course?.weekRanges) && course.weekRanges.length) return parseWeekRanges(course.weekRanges)
  return parseWeekRanges(course?.weeks)
}

function parityFromWeekLabel(text) {
  const label = String(text || '').replace(/\s/g, '')
  const hasOdd = label.includes('单')
  const hasEven = label.includes('双')
  if (hasOdd && !hasEven) return 'odd'
  if (hasEven && !hasOdd) return 'even'
  return ''
}

/**
 * Check a course for a teaching week. Single-date custom items match only the
 * exact `date` supplied by the caller. `date` accepts a Date or YYYY-MM-DD.
 */
export function isCourseInWeek(course, week, { date, semester, semesterStart } = {}) {
  const weekNumber = Number(week)
  if (!course) return false
  if (semester && course.semester && String(semester) !== String(course.semester)) return false

  if (course.date) {
    const courseDay = parseIsoDay(course.date)
    let targetDay = parseIsoDay(date)
    const start = semesterStart || course.semesterStart
    if (!targetDay && start && Number.isInteger(weekNumber) && weekNumber >= 1 && Number.isInteger(Number(course.dayIndex))) {
      const dayIndex = Number(course.dayIndex)
      const startMonday = dayIndex >= 0 && dayIndex <= 6 ? mondayOrdinal(start) : null
      if (startMonday !== null) {
        const targetOrdinal = startMonday + (Number(week) - 1) * 7 + Number(course.dayIndex)
        const inferred = new Date(targetOrdinal * DAY_MS)
        targetDay = { year: inferred.getUTCFullYear(), month: inferred.getUTCMonth() + 1, day: inferred.getUTCDate() }
      }
    }
    return !!courseDay && !!targetDay && isoFromParts(courseDay) === isoFromParts(targetDay)
  }

  if (!Number.isInteger(weekNumber) || weekNumber < 1) return false

  const ranges = getRanges(course)
  if (ranges.length && !ranges.some(range => weekNumber >= range.start && weekNumber <= range.end)) return false
  const weekLabel = String(course.weeks ?? '').trim()
  const suppliedRanges = Array.isArray(course.weekRanges) && course.weekRanges.length > 0
  const hasParityLabel = /单|双/.test(weekLabel)
  if (!ranges.length && ((weekLabel && !hasParityLabel) || suppliedRanges)) return false

  const weekType = String(course.weekType || '').toLowerCase()
  const parity = weekType === 'odd' || weekType.includes('单')
    ? 'odd'
    : weekType === 'even' || weekType.includes('双')
      ? 'even'
      : parityFromWeekLabel(weekLabel)
  if (parity === 'odd') return weekNumber % 2 === 1
  if (parity === 'even') return weekNumber % 2 === 0
  return true
}

/** Return the Monday-based teaching week. Invalid dates return null. */
export function calcWeekNumber(date, startIso) {
  const currentMonday = mondayOrdinal(date)
  const startMonday = mondayOrdinal(startIso)
  if (currentMonday === null || startMonday === null) return null
  return Math.floor((currentMonday - startMonday) / 7) + 1
}

/** Strictly normalize a calendar day to YYYY-MM-DD, or return an empty string. */
export function parseDateOnly(value) {
  const parts = parseIsoDay(value)
  return parts ? isoFromParts(parts) : ''
}
