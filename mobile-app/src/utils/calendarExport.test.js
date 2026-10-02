import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCalendarIcs, escapeIcsText } from './calendarExport.js'

function events(ics) {
  return ics.split('BEGIN:VEVENT').slice(1).map(block => block.split('END:VEVENT')[0])
}

test('weekly export expands discrete weeks and odd/even rules into exact DTSTART dates', () => {
  const ics = buildCalendarIcs({
    semester: '2026-2027-1',
    semesterStart: '2026-09-07',
    now: new Date('2026-09-01T00:00:00Z'),
    courses: [{ id: 'lab-1', name: '实验课', dayIndex: 2, periods: [3, 4], weeks: '1-5,8', weekRanges: [{ start: 1, end: 5 }, { start: 8, end: 8 }], weekType: 'odd' }]
  })
  const exported = events(ics)
  assert.equal(exported.length, 3)
  assert.match(exported[0], /DTSTART;TZID=Asia\/Shanghai:20260909T100000/)
  assert.match(exported[1], /DTSTART;TZID=Asia\/Shanghai:20260923T100000/)
  assert.match(exported[2], /DTSTART;TZID=Asia\/Shanghai:20261007T100000/)
  assert.ok(exported.every(event => /DTEND;TZID=Asia\/Shanghai:.*T112500/.test(event)))
  assert.ok(exported.every(event => !event.includes('RRULE:')))
})

test('single-date custom event exports exactly once with stable UID and correct end time', () => {
  const args = {
    semester: '2026-2027-1', semesterStart: '2026-09-07',
    courses: [{ id: 'once-abc', date: '2026-09-20', dayIndex: 6, periods: [11, 12, 13], name: '周会' }]
  }
  const first = events(buildCalendarIcs(args))
  const second = events(buildCalendarIcs(args))
  assert.equal(first.length, 1)
  assert.match(first[0], /DTSTART;TZID=Asia\/Shanghai:20260920T190000/)
  assert.match(first[0], /DTEND;TZID=Asia\/Shanghai:20260920T211000/)
  assert.match(first[0].match(/UID:([^\r\n]+)/)[1], /^cqjtu-once-abc-20260920@/)
  assert.equal(first[0].match(/UID:([^\r\n]+)/)[1], second[0].match(/UID:([^\r\n]+)/)[1])
})

test('legacy odd/even text is honored when weekType was not saved', () => {
  const ics = buildCalendarIcs({
    semesterStart: '2026-09-07',
    courses: [{ id: 'legacy-odd', name: '旧单周课', dayIndex: 0, periods: [1], weeks: '1-4周 单周' }]
  })
  const exported = events(ics)
  assert.equal(exported.length, 2)
  assert.match(exported[0], /DTSTART;TZID=Asia\/Shanghai:20260907T082000/)
  assert.match(exported[1], /DTSTART;TZID=Asia\/Shanghai:20260921T082000/)
})

test('unknown semester dates or an unbounded recurrence do not invent calendar occurrences', () => {
  const course = { id: 'unknown-range', name: '待确认课', dayIndex: 0, periods: [1], weeks: '' }
  assert.equal(events(buildCalendarIcs({ courses: [course] })).length, 0)
  assert.equal(events(buildCalendarIcs({ courses: [course], semesterStart: '2026-09-07' })).length, 0)
  assert.equal(events(buildCalendarIcs({ courses: [course], semesterStart: '2026-09-07', totalWeeks: 2 })).length, 2)
  const oneOff = { id: 'once-without-term', name: '明确日期', date: '2026-09-12', periods: [1] }
  const partial = events(buildCalendarIcs({ courses: [course, oneOff] }))
  assert.equal(partial.length, 1)
  assert.match(partial[0], /DTSTART;TZID=Asia\/Shanghai:20260912T082000/)
})

test('ICS text escapes special characters and long lines are folded', () => {
  assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
  const ics = buildCalendarIcs({
    semester: '2026-2027-1', semesterStart: '2026-09-07',
    courses: [{ id: 'long', dayIndex: 0, periods: [1], weeks: '1', name: '非常长的课程名称'.repeat(20), room: 'A,B;C' }]
  })
  const summaryLine = ics.split('\r\n').find(line => line.startsWith('SUMMARY:'))
  assert.ok(summaryLine)
  assert.ok(ics.includes('LOCATION:A\\,B\\;C'))
  assert.ok(ics.includes('\r\n '), 'continuation line starts with a space')
})
