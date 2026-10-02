const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const DATE_PATTERN = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/
const TIME_RANGE_PATTERN = /(?:(上午|下午|晚上|凌晨|中午)\s*)?(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:-|—|–|~|～|至|到)\s*(?:(上午|下午|晚上|凌晨|中午)\s*)?(\d{1,2})\s*[:：]\s*(\d{2})/
const SINGLE_TIME_PATTERN = /(?:(上午|下午|晚上|凌晨|中午)\s*)?(\d{1,2})\s*[:：]\s*(\d{2})/

function toBeijingDate(year, month, day, hour = 0, minute = 0, millisecond = 0) {
  const utcDate = new Date(0)
  utcDate.setUTCFullYear(year, month - 1, day)
  utcDate.setUTCHours(hour, minute, 0, millisecond)
  const check = new Date(0)
  check.setUTCFullYear(year, month - 1, day)
  check.setUTCHours(0, 0, 0, 0)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  return new Date(utcDate.getTime() - BEIJING_OFFSET_MS)
}

function parseDate(value) {
  const match = String(value ?? '').match(DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dayStart = toBeijingDate(year, month, day)
  if (!dayStart) return null

  return {
    match,
    year,
    month,
    day,
    dayStart,
    dayEnd: new Date(dayStart.getTime() + DAY_MS),
  }
}

function to24Hour(hour, period) {
  if (!period) return hour
  if (hour < 1 || hour > 12) return null
  if (period === '上午' || period === '凌晨') return hour === 12 ? 0 : hour
  if (period === '下午' || period === '晚上') return hour === 12 ? 12 : hour + 12
  if (period === '中午') return hour < 11 ? hour + 12 : hour
  return null
}

function parseClock(hourText, minuteText, period) {
  let hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null
  if (period) {
    hour = to24Hour(hour, period)
    if (hour === null) return null
  }
  if (hour < 0 || hour > 23) return null
  return { hour, minute }
}

function parseTimeRange(text, date) {
  const dateEnd = date.match.index + date.match[0].length
  const remainder = text.slice(dateEnd)
  const rangeMatch = remainder.match(TIME_RANGE_PATTERN)

  if (rangeMatch) {
    const startPeriod = rangeMatch[1] || rangeMatch[4] || ''
    const endPeriod = rangeMatch[4] || rangeMatch[1] || ''
    const startClock = parseClock(rangeMatch[2], rangeMatch[3], startPeriod)
    const endClock = parseClock(rangeMatch[5], rangeMatch[6], endPeriod)
    if (startClock && endClock) {
      const startAt = toBeijingDate(date.year, date.month, date.day, startClock.hour, startClock.minute)
      let endAt = toBeijingDate(date.year, date.month, date.day, endClock.hour, endClock.minute)
      if (endAt.getTime() < startAt.getTime()) endAt = new Date(endAt.getTime() + DAY_MS)
      return { startAt, endAt, hasConcreteRange: true }
    }
  }

  const singleMatch = remainder.match(SINGLE_TIME_PATTERN)
  if (singleMatch) {
    const clock = parseClock(singleMatch[2], singleMatch[3], singleMatch[1])
    if (clock) {
      return {
        startAt: toBeijingDate(date.year, date.month, date.day, clock.hour, clock.minute),
        endAt: date.dayEnd,
        hasConcreteRange: false,
      }
    }
  }

  return { startAt: date.dayStart, endAt: date.dayEnd, hasConcreteRange: false }
}

/** Parse an exam time string as a Beijing-time interval. */
export function parseExamTimeRange(value) {
  const date = parseDate(value)
  if (!date) {
    return {
      startAt: null,
      endAt: null,
      dayStartAt: null,
      dayEndAt: null,
      hasConcreteRange: false,
    }
  }

  const timeRange = parseTimeRange(String(value), date)
  return {
    ...timeRange,
    dayStartAt: date.dayStart,
    dayEndAt: date.dayEnd,
  }
}

/** Return pending, ongoing, passed, or unknown using an injected clock. */
export function getExamStatus(value, now = new Date()) {
  const range = parseExamTimeRange(value)
  if (!range.startAt || !range.endAt || !(now instanceof Date) || Number.isNaN(now.getTime())) return 'unknown'
  if (now.getTime() < range.startAt.getTime()) return 'pending'
  if (now.getTime() < range.endAt.getTime()) {
    return range.hasConcreteRange || range.startAt.getTime() > range.dayStartAt.getTime()
      ? 'ongoing'
      : 'pending'
  }
  return 'passed'
}

/** Calendar-day distance from now to the exam date in Beijing time. */
export function getExamDateDistance(value, now = new Date()) {
  const range = parseExamTimeRange(value)
  if (!range.dayStartAt || !(now instanceof Date) || Number.isNaN(now.getTime())) return null

  const beijingNow = new Date(now.getTime() + BEIJING_OFFSET_MS)
  const todayStart = toBeijingDate(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth() + 1,
    beijingNow.getUTCDate()
  )
  return Math.round((range.dayStartAt.getTime() - todayStart.getTime()) / DAY_MS)
}
