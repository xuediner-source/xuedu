import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveHomeAgenda,
  previewNextTeachingWeek,
  parseTimeToMinutes,
  getWeekdayIndex,
  calcWeekNumber,
  formatTodayDate
} from './homeAgenda.js'

const mockCourses = [
  { name: '高等数学B（上）', day: '周一', dayIndex: 0, rowIndex: 0, startTime: '08:20', endTime: '09:45', time: '08:20-09:45', room: 'A01教学楼 301' },
  { name: '食品科学导论', day: '周一', dayIndex: 0, rowIndex: 2, startTime: '14:00', endTime: '15:25', time: '14:00-15:25', room: '逸夫楼 205' },
  { name: '思想道德与法治', day: '周二', dayIndex: 1, rowIndex: 0, startTime: '08:20', endTime: '09:45', time: '08:20-09:45', room: 'B01教学楼 102' },
  { name: '大数据基础', day: '周四', dayIndex: 3, rowIndex: 1, startTime: '10:15', endTime: '12:35', time: '10:15-12:35', room: 'A01教学楼 210' },
  { name: '大学英语（一）', day: '周五', dayIndex: 4, rowIndex: 2, startTime: '14:00', endTime: '15:25', time: '14:00-15:25', room: '材料实验楼 118' }
]

test('parseTimeToMinutes correctly converts HH:MM to integer minutes', () => {
  assert.equal(parseTimeToMinutes('08:20'), 500)
  assert.equal(parseTimeToMinutes('14:00-15:25'), 840)
  assert.equal(parseTimeToMinutes(''), 0)
})

test('identifies next class on same day before first course starts', () => {
  // Monday morning at 08:00 (480 min)
  const agenda = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 0,
    now: 480
  })

  assert.ok(agenda.heroCourse)
  assert.equal(agenda.heroCourse.name, '高等数学B（上）')
  assert.equal(agenda.heroCourse.displayWhen, '今天')
  assert.equal(agenda.heroCourse.statusText, '距上课 20 分钟')
  assert.equal(agenda.heroCourse.shortRoom, 'A01 301')
  assert.equal(agenda.laterCourses.length, 2)
  assert.equal(agenda.laterCourses[0].name, '食品科学导论')
})

test('identifies ongoing course on same day during course time', () => {
  // Monday 08:30 (510 min)
  const agenda = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 0,
    now: 510
  })

  assert.ok(agenda.heroCourse)
  assert.equal(agenda.heroCourse.name, '高等数学B（上）')
  assert.equal(agenda.heroCourse.isOngoing, true)
  assert.equal(agenda.heroCourse.statusText, '正在上课')
})

test('switches to subsequent course when morning class has ended', () => {
  // Monday 11:00 (660 min)
  const agenda = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 0,
    now: 660
  })

  assert.ok(agenda.heroCourse)
  assert.equal(agenda.heroCourse.name, '食品科学导论')
  assert.equal(agenda.heroCourse.displayWhen, '今天')
  assert.equal(agenda.laterCourses[0].name, '思想道德与法治')
  assert.equal(agenda.laterCourses[0].displayWhen, '明天')
})

test('switches to tomorrow course when today classes have all ended', () => {
  // Monday 16:00 (960 min)
  const agenda = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 0,
    now: 960
  })

  assert.ok(agenda.heroCourse)
  assert.equal(agenda.heroCourse.name, '思想道德与法治')
  assert.equal(agenda.heroCourse.displayWhen, '明天')
  assert.equal(agenda.heroCourse.statusText, '明天')
})

test('returns null heroCourse and empty laterCourses when all week courses have ended (NO fallback to past courses)', () => {
  // Friday 16:00 (960 min)
  const agenda = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 4,
    now: 960
  })

  assert.equal(agenda.heroCourse, null)
  assert.equal(agenda.laterCourses.length, 0)
  assert.equal(agenda.totalWeekCourses, 5)

  const next = previewNextTeachingWeek({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: 4,
    now: 960
  })
  assert.equal(next.name, '高等数学B（上）')
  assert.equal(next.displayWhen, '下周一')
  assert.equal(next.statusText, '下周')
  assert.equal(previewNextTeachingWeek({
    courses: mockCourses,
    currentWeek: 1,
    isCourseInWeek: () => false
  }), null)
})

test('midnight crossing simulation (23:59:50 -> 00:00:10): date, weekday, and agenda transition cleanly', () => {
  // Thursday night 2026-09-10 23:59:50
  const tBefore = new Date(2026, 8, 10, 23, 59, 50)
  const dayIdxBefore = getWeekdayIndex(tBefore)
  assert.equal(dayIdxBefore, 3, '2026-09-10 must be Thursday (index 3)')
  assert.equal(formatTodayDate(tBefore), '9月10日')

  const agendaBefore = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: dayIdxBefore,
    now: tBefore
  })
  // All Thursday classes finished, next class is Friday
  assert.ok(agendaBefore.heroCourse)
  assert.equal(agendaBefore.heroCourse.name, '大学英语（一）')
  assert.equal(agendaBefore.heroCourse.displayWhen, '明天')

  // Friday morning 2026-09-11 00:00:10 (20 seconds later)
  const tAfter = new Date(2026, 8, 11, 0, 0, 10)
  const dayIdxAfter = getWeekdayIndex(tAfter)
  assert.equal(dayIdxAfter, 4, '2026-09-11 must be Friday (index 4)')
  assert.equal(formatTodayDate(tAfter), '9月11日')

  const agendaAfter = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 1,
    weekdayIndex: dayIdxAfter,
    now: tAfter
  })
  // Now Friday class is "今天", not "明天"!
  assert.ok(agendaAfter.heroCourse)
  assert.equal(agendaAfter.heroCourse.name, '大学英语（一）')
  assert.equal(agendaAfter.heroCourse.displayWhen, '今天')
})

test('Sunday midnight crossing (Week 1 Sunday 23:59:50 -> Week 2 Monday 00:00:10): week number and schedule increment', () => {
  const semesterStart = '2026-09-07' // Week 1 Monday
  const sundayNight = new Date(2026, 8, 13, 23, 59, 50) // Sunday night
  assert.equal(calcWeekNumber(sundayNight, semesterStart), 1, 'Sunday night is Week 1')
  assert.equal(getWeekdayIndex(sundayNight), 6, 'Sunday is index 6')

  const mondayMorning = new Date(2026, 8, 14, 0, 0, 10) // Monday morning (Week 2)
  assert.equal(calcWeekNumber(mondayMorning, semesterStart), 2, 'Monday morning is Week 2')
  assert.equal(getWeekdayIndex(mondayMorning), 0, 'Monday is index 0')
  assert.equal(formatTodayDate(mondayMorning), '9月14日')

  // Week 2 Monday morning schedule correctly picks up Week 2 courses
  const agendaWeek2 = resolveHomeAgenda({
    courses: mockCourses,
    currentWeek: 2,
    weekdayIndex: 0,
    now: mondayMorning
  })
  assert.ok(agendaWeek2.heroCourse)
  assert.equal(agendaWeek2.heroCourse.name, '高等数学B（上）')
  assert.equal(agendaWeek2.heroCourse.displayWhen, '今天')
})
