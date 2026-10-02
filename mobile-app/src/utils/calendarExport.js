import { CQJTU_PERIODS, calcWeekNumber, isCourseInWeek, parseDateOnly, parseWeekRanges } from './scheduleModel.js'

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

function pad(value) {
  return String(value).padStart(2, '0')
}

function localYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDay(value) {
  const iso = parseDateOnly(value)
  if (!iso) return null
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() + days)
  return result
}

function compactDateTime(date, time) {
  const [hour = '00', minute = '00'] = String(time || '00:00').split(':')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hour)}${pad(minute)}00`
}

function getCourseSpan(course) {
  const periods = Array.isArray(course?.periods)
    ? course.periods.map(Number).filter(period => Number.isInteger(period) && period >= 1 && period <= 13).sort((a, b) => a - b)
    : []
  if (periods.length) return { start: periods[0], end: periods[periods.length - 1] }

  const fallback = [{ start: 1, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }, { start: 8, end: 10 }, { start: 11, end: 13 }]
  const byRow = fallback[Number(course?.rowIndex)] || fallback[0]
  return byRow
}

function getRanges(course, totalWeeks) {
  const hasSourceRanges = Array.isArray(course?.weekRanges) && course.weekRanges.length
  const label = String(course?.weeks ?? '').trim()
  const ranges = hasSourceRanges ? parseWeekRanges(course.weekRanges) : parseWeekRanges(label)
  if (ranges.length) return ranges
  if (hasSourceRanges || (label && !/单|双/.test(label))) return []
  const count = Number(totalWeeks)
  return Number.isInteger(count) && count > 0 ? [{ start: 1, end: count }] : []
}

function occursOnWeek(course, week, semester) {
  return isCourseInWeek(course, week, { semester })
}

function courseStableKey(course) {
  if (course?.id !== undefined && course?.id !== null && String(course.id).trim()) return String(course.id)
  const span = getCourseSpan(course)
  const fields = [course?.name, course?.teacher, course?.room, course?.dayIndex, span.start, span.end,
    course?.semester, course?.weeks, JSON.stringify(course?.weekRanges || []), course?.weekType]
  // FNV-1a keeps fallback UIDs short and deterministic for legacy courses.
  let hash = 0x811c9dc5
  for (const character of fields.join('|')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return `legacy-${(hash >>> 0).toString(16)}`
}

export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function utf8Length(value) {
  return new TextEncoder().encode(value).length
}

function foldIcsLine(line) {
  const chunks = []
  let current = ''
  let limit = 75
  for (const character of String(line)) {
    if (current && utf8Length(current + character) > limit) {
      chunks.push(current)
      current = ' '
      limit = 75
    }
    current += character
  }
  chunks.push(current)
  return chunks.join('\r\n')
}

function validDayIndex(value) {
  const dayIndex = Number(value)
  return Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6 ? dayIndex : null
}

function occurrencesFor(course, semester, semesterStart, totalWeeks) {
  if (semester && course.semester && String(semester) !== String(course.semester)) return []
  if (course.date) {
    const date = parseDay(course.date)
    return date ? [{ date, week: calcWeekNumber(date, semesterStart || course.semesterStart) }] : []
  }

  const dayIndex = validDayIndex(course.dayIndex)
  const start = parseDay(semesterStart || course.semesterStart)
  if (dayIndex === null || !start) return []
  const monday = addDays(start, -((start.getDay() + 6) % 7))
  const occurrences = []
  for (const range of getRanges(course, totalWeeks)) {
    for (let week = range.start; week <= range.end; week++) {
      if (!occursOnWeek(course, week, semester)) continue
      occurrences.push({ date: addDays(monday, (week - 1) * 7 + dayIndex), week })
    }
  }
  return occurrences
}

function formatStamp(date) {
  const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date()
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
}

/** Expand each actual teaching-week occurrence into a separate stable-UID VEVENT. */
export function buildCalendarIcs({ courses = [], semester = '', semesterStart = '', totalWeeks = 0, now = new Date() } = {}) {
  const stamp = formatStamp(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CQJTU App//Schedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:交大课表',
    'X-WR-TIMEZONE:Asia/Shanghai',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Shanghai',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE'
  ]

  courses.forEach(course => {
    const span = getCourseSpan(course)
    const startPeriod = CQJTU_PERIODS[span.start - 1] || CQJTU_PERIODS[0]
    const endPeriod = CQJTU_PERIODS[span.end - 1] || CQJTU_PERIODS[1]
    const key = courseStableKey(course)
    const dayIndex = validDayIndex(course.dayIndex)

    for (const occurrence of occurrencesFor(course, semester, semesterStart, totalWeeks)) {
      const dateText = localYmd(occurrence.date)
      const dateKey = dateText.replaceAll('-', '')
      const uid = `cqjtu-${encodeURIComponent(key)}-${dateKey}@app.cqjtu.edu.cn`
      const dayLabel = course.date ? `单次日程 ${dateText}` : `第${occurrence.week}周${WEEKDAY_CODES[dayIndex] || ''}`
      const description = [`任课教师: ${course.teacher || '未知'}`, `节次: ${span.start}-${span.end}`, dayLabel].join(' | ')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Shanghai:${compactDateTime(occurrence.date, startPeriod.start)}`,
        `DTEND;TZID=Asia/Shanghai:${compactDateTime(occurrence.date, endPeriod.end)}`,
        `SUMMARY:${escapeIcsText(course.name || '未命名日程')}`,
        `LOCATION:${escapeIcsText(course.room || '教室待定')}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      )
    }
  })

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n')
}
