import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getExamDateDistance, getExamStatus, parseExamTimeRange } from './examTime.js'

function beijingTime(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second))
}

test('parses exam ranges as Beijing time independent of the device timezone', () => {
  const range = parseExamTimeRange('2026-10-02 08:30-10:00')
  assert.equal(range.startAt.toISOString(), '2026-10-02T00:30:00.000Z')
  assert.equal(range.endAt.toISOString(), '2026-10-02T02:00:00.000Z')
  assert.equal(range.hasConcreteRange, true)
})

test('reports pending, ongoing, and passed at the exam boundaries', () => {
  const exam = '2026-10-02 08:30-10:00'
  assert.equal(getExamStatus(exam, beijingTime(2026, 10, 2, 8, 29, 59)), 'pending')
  assert.equal(getExamStatus(exam, beijingTime(2026, 10, 2, 8, 30)), 'ongoing')
  assert.equal(getExamStatus(exam, beijingTime(2026, 10, 2, 9, 59, 59)), 'ongoing')
  assert.equal(getExamStatus(exam, beijingTime(2026, 10, 2, 10)), 'passed')
})

test('date-only and single-time records are not marked passed in the morning', () => {
  assert.equal(getExamStatus('2026-10-02', beijingTime(2026, 10, 2, 8)), 'pending')
  assert.equal(getExamStatus('2026-10-02 待定', beijingTime(2026, 10, 2, 8)), 'pending')
  assert.equal(getExamStatus('2026-10-02 08:30', beijingTime(2026, 10, 2, 8)), 'pending')
  assert.equal(getExamStatus('2026-10-02 08:30', beijingTime(2026, 10, 2, 9)), 'ongoing')
  assert.equal(getExamStatus('2026-10-02', new Date(Date.UTC(2026, 9, 2, 15, 59, 59, 999))), 'pending')
  assert.equal(getExamStatus('2026-10-02', beijingTime(2026, 10, 3)), 'passed')
})

test('supports Chinese dates, full-width punctuation, and overnight ranges', () => {
  const chinese = parseExamTimeRange('2026年10月2日 上午8：30至10：00')
  assert.equal(chinese.startAt.toISOString(), '2026-10-02T00:30:00.000Z')
  assert.equal(chinese.endAt.toISOString(), '2026-10-02T02:00:00.000Z')

  const afternoon = parseExamTimeRange('2026年10月2日 下午2:00-3:00')
  assert.equal(afternoon.startAt.toISOString(), '2026-10-02T06:00:00.000Z')
  assert.equal(afternoon.endAt.toISOString(), '2026-10-02T07:00:00.000Z')

  const overnight = parseExamTimeRange('2026-10-02 23:30-00:30')
  assert.equal(overnight.endAt.toISOString(), '2026-10-02T16:30:00.000Z')
  assert.equal(getExamStatus('2026-10-02 23:30-00:30', new Date(Date.UTC(2026, 9, 2, 16, 30))), 'passed')
})

test('computes day-end boundaries at month ends, year ends, and leap days', () => {
  assert.equal(parseExamTimeRange('2026-10-31').dayEndAt.toISOString(), '2026-10-31T16:00:00.000Z')
  assert.equal(parseExamTimeRange('2026-12-31').dayEndAt.toISOString(), '2026-12-31T16:00:00.000Z')
  assert.equal(parseExamTimeRange('2024-02-29').dayEndAt.toISOString(), '2024-02-29T16:00:00.000Z')
  assert.equal(getExamStatus('2024-02-29', beijingTime(2024, 2, 29, 8)), 'pending')
  assert.equal(getExamStatus('2023-02-29', beijingTime(2024, 2, 29, 8)), 'unknown')
})

test('returns unknown for absent or invalid dates and counts Beijing calendar days', () => {
  assert.equal(getExamStatus('时间待定', beijingTime(2026, 10, 2, 8)), 'unknown')
  assert.equal(getExamStatus('2026-02-30 08:30-10:00', beijingTime(2026, 10, 2)), 'unknown')
  assert.equal(getExamDateDistance('2026-10-03', beijingTime(2026, 10, 2, 23, 59)), 1)
  assert.equal(getExamDateDistance('2026-10-01', beijingTime(2026, 10, 2, 0, 1)), -1)
})
