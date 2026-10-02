import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calcWeekNumber, isCourseInWeek, parseDateOnly, parseWeekRanges } from './scheduleModel.js'

test('week labels parse individual weeks and common range separators', () => {
  assert.deepEqual(parseWeekRanges('第1-3周、5至7周, 10'), [
    { start: 1, end: 3 }, { start: 5, end: 7 }, { start: 10, end: 10 }
  ])
  assert.deepEqual(parseWeekRanges([{ start: 8, end: 4 }]), [{ start: 4, end: 8 }])
  assert.deepEqual(parseWeekRanges('semester 2026-2027'), [])
})

test('recurring course rules respect disjoint ranges and odd/even weeks', () => {
  const course = {
    weeks: '1-6,9',
    weekRanges: [{ start: 1, end: 3 }, { start: 6, end: 6 }, { start: 9, end: 9 }],
    weekType: 'odd'
  }
  assert.equal(isCourseInWeek(course, 1), true)
  assert.equal(isCourseInWeek(course, 2), false)
  assert.equal(isCourseInWeek(course, 3), true)
  assert.equal(isCourseInWeek(course, 6), false)
  assert.equal(isCourseInWeek(course, 9), true)
  assert.equal(isCourseInWeek(course, 9, { semester: '2026-2027-1' }), true)
  assert.equal(isCourseInWeek({ ...course, semester: 'other' }, 1, { semester: '2026-2027-1' }), false)
})

test('legacy week label works when normalized weekRanges are absent', () => {
  assert.equal(isCourseInWeek({ weeks: '2~4周', weekType: 'even' }, 2), true)
  assert.equal(isCourseInWeek({ weeks: '2~4周', weekType: 'even' }, 3), false)
  assert.equal(isCourseInWeek({ weeks: '2~4周', weekType: 'even' }, 5), false)
  assert.equal(isCourseInWeek({ weeks: '1-6周 单周' }, 3), true)
  assert.equal(isCourseInWeek({ weeks: '1-6周 单周' }, 4), false)
  assert.equal(isCourseInWeek({ weeks: '1-6周 双周' }, 4), true)
  assert.equal(isCourseInWeek({ weeks: '单双周' }, 3), true)
  assert.equal(isCourseInWeek({ weeks: '单双周' }, 4), true)
  assert.equal(isCourseInWeek({ weeks: '课程周期未知' }, 2), false)
  assert.equal(isCourseInWeek({ weeks: '', weekRanges: [] }, 24), true)
  assert.equal(isCourseInWeek({ weeks: '1-6' }, null), false)
  assert.equal(isCourseInWeek({ weeks: '1-6' }, undefined), false)
  assert.equal(isCourseInWeek({ weeks: '1-6' }, Number.NaN), false)
  assert.equal(isCourseInWeek({ weeks: '1-6' }, 0), false)
})

test('single-date events match only their actual date, including inferred semester weekday', () => {
  const event = { date: '2026-09-13', dayIndex: 6 }
  assert.equal(isCourseInWeek(event, 1, { date: '2026-09-13' }), true)
  assert.equal(isCourseInWeek(event, 1, { date: '2026-09-12' }), false)
  assert.equal(isCourseInWeek(event, null, { date: '2026-09-13' }), true)
  assert.equal(isCourseInWeek(event, 1, { semesterStart: '2026-09-07' }), true)
  assert.equal(isCourseInWeek(event, 2, { semesterStart: '2026-09-07' }), false)
  assert.equal(isCourseInWeek(event, 1), false)
})

test('week calculation crosses Sunday midnight and accepts valid years beyond a fixed season', () => {
  assert.equal(calcWeekNumber('2026-09-13', '2026-09-07'), 1)
  assert.equal(calcWeekNumber('2026-09-14', '2026-09-07'), 2)
  assert.equal(calcWeekNumber('2041-01-07', '2040-12-31'), 2)
  assert.equal(calcWeekNumber('0001-01-08', '0001-01-01'), 2)
  assert.equal(calcWeekNumber('2026-02-30', '2026-09-07'), null)
  assert.equal(calcWeekNumber('2026-09-07', 'nope'), null)
  assert.equal(parseDateOnly('2024-02-29'), '2024-02-29')
  assert.equal(parseDateOnly('0001-01-01'), '0001-01-01')
  assert.equal(parseDateOnly('2025-02-29'), '')
})
