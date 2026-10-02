import { cleanRoomShort } from './roomShort.js'
import { calcWeekNumber as calculateTeachingWeek } from './scheduleModel.js'
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * 将时间字符串（如 "08:20" 或 "08:20-09:45"）解析为自零点起算的分钟数
 */
export function parseTimeToMinutes(timeStr, fallback = 0) {
  if (!timeStr) return fallback
  const first = String(timeStr).trim().split('-')[0].trim()
  const match = first.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return fallback
  return h * 60 + m
}

/**
 * 获取指定日期的周一零点时间对象（用于周次对齐计算）
 */
export function mondayOf(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - day)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * 计算中国常用星期索引：周一=0, 周二=1, ..., 周日=6
 */
export function getWeekdayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7
}

/**
 * 根据指定日期与开学日期计算实际教学周次（跨周日午夜自动进位）
 */
export function calcWeekNumber(date = new Date(), startIso = '') {
  return calculateTeachingWeek(date, startIso)
}

/**
 * 格式化月日（如 "9月12日"）
 */
export function formatTodayDate(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date)
}

/**
 * 首页日程聚合逻辑
 * 依据真实教学周与当前时间，计算真正的「下一节课」（Hero）及「之后日程」（最多两行）
 * 彻底解决旧版“future为空回退allInWeek，把已过期历史课程误当下一节”的严重缺陷
 *
 * @param {Object} options
 * @param {Array} options.courses - 课程列表
 * @param {number} options.currentWeek - 当前教学周
 * @param {number} options.weekdayIndex - 今日索引 (0=周一, ..., 6=周日)
 * @param {Date|number} [options.now] - 当前时间对象或距零点分钟数
 * @param {Function} [options.isCourseInWeek] - 课程是否在周内函数
 * @param {Function} [options.courseTime] - 课程时间格式化函数
 * @returns {Object} { heroCourse, laterCourses, totalWeekCourses }
 */
export function resolveHomeAgenda({
  courses = [],
  currentWeek = 1,
  weekdayIndex = 0,
  now = new Date(),
  isCourseInWeek = (c, w) => true,
  courseTime = (c) => c.time || `${c.startTime || ''}-${c.endTime || ''}`
}) {
  const currentMinutes = typeof now === 'number'
    ? now
    : (now.getHours() * 60 + now.getMinutes())

  const inWeekCourses = courses.filter(c => isCourseInWeek(c, currentWeek)).map(c => ({ ...c, day: c.day || DAY_NAMES[c.dayIndex] }))

  // 严格按星期天数、节次/起始时间升序排列
  const sorted = [...inWeekCourses].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
    const startA = parseTimeToMinutes(a.startTime || courseTime(a), (a.rowIndex || 0) * 100)
    const startB = parseTimeToMinutes(b.startTime || courseTime(b), (b.rowIndex || 0) * 100)
    return startA - startB || (a.rowIndex || 0) - (b.rowIndex || 0)
  })

  // 筛选真正未结束的课程（未来或进行中）
  const futureCourses = sorted.filter(c => {
    if (c.dayIndex > weekdayIndex) return true
    if (c.dayIndex < weekdayIndex) return false

    // 同一天：检查结课时间是否在当前分钟数之后
    const tStr = courseTime(c)
    const endPart = c.endTime || (tStr && tStr.split('-')[1]) || '23:59'
    const endMin = parseTimeToMinutes(endPart, 23 * 60 + 59)
    return endMin > currentMinutes
  })

  // 若本周剩余待上课程为空，返回 null，由 UI 呈现真实的空态，杜绝过期历史课程冒充“下一节”
  if (futureCourses.length === 0) {
    return {
      heroCourse: null,
      laterCourses: [],
      totalWeekCourses: inWeekCourses.length
    }
  }

  const rawHero = futureCourses[0]
  const heroTimeStr = courseTime(rawHero)
  const heroStartStr = rawHero.startTime || (heroTimeStr && heroTimeStr.split('-')[0]) || ''
  const heroEndStr = rawHero.endTime || (heroTimeStr && heroTimeStr.split('-')[1]) || ''
  const heroStartMin = parseTimeToMinutes(heroStartStr, 0)
  const heroEndMin = parseTimeToMinutes(heroEndStr, 24 * 60)

  let statusText = '即将开始'
  let isOngoing = false
  const isToday = rawHero.dayIndex === weekdayIndex

  if (isToday) {
    if (currentMinutes >= heroStartMin && currentMinutes < heroEndMin) {
      statusText = '正在上课'
      isOngoing = true
    } else if (heroStartMin > currentMinutes) {
      const diff = heroStartMin - currentMinutes
      if (diff <= 60) {
        statusText = `距上课 ${diff} 分钟`
      } else {
        statusText = '今天稍后'
      }
    }
  } else if (rawHero.dayIndex === weekdayIndex + 1) {
    statusText = '明天'
  } else {
    statusText = rawHero.day || '本周后续'
  }

  const heroCourse = {
    ...rawHero,
    isToday,
    isOngoing,
    statusText,
    periodTime: heroTimeStr,
    shortRoom: cleanRoomShort(rawHero.room),
    displayWhen: isToday ? '今天' : (rawHero.dayIndex === weekdayIndex + 1 ? '明天' : rawHero.day)
  }

  const laterCourses = futureCourses.slice(1, 3).map(c => {
    let when = c.day
    if (c.dayIndex === weekdayIndex) when = '今天'
    else if (c.dayIndex === weekdayIndex + 1) when = '明天'
    else if (c.dayIndex === weekdayIndex + 2) when = '后天'

    return {
      ...c,
      displayWhen: when,
      periodTime: courseTime(c),
      shortRoom: cleanRoomShort(c.room)
    }
  })

  return {
    heroCourse,
    laterCourses,
    totalWeekCourses: inWeekCourses.length
  }
}
