import assert from 'node:assert/strict'
import { test } from 'node:test'
import { courseTitleLayout, laneSpan } from './courseCardLayout.js'

test('title and classroom do not overlap for one, two and three period cards across all font sizes', () => {
  for (const height of [34, 74, 110, 168]) {
    for (const font of [10.5, 11, 12, 13, 14]) {
      for (const room of [0, 10.8, 21.6, 64.8]) {
        const layout = courseTitleLayout(height, room, font)
        assert.ok(layout.lines >= 1, 'retain at least one course name line')
        assert.ok(layout.maxHeight + layout.reservedRoom + (layout.reservedRoom ? 4 : 0) <= height - 8 + 0.01,
          `content overlaps for height=${height}, font=${font}, room=${room}`)
      }
    }
  }
})

test('a short single period card prioritizes the course name and delegates its room to the detail list', () => {
  const layout = courseTitleLayout(34, 21.6)
  assert.equal(layout.lines, 1)
  assert.equal(layout.roomLines, 0)
})

test('two period cards retain a two line classroom without forcing a five line title', () => {
  const layout = courseTitleLayout(74, 21.6)
  assert.equal(layout.reservedRoom, 21.6)
  assert.equal(layout.lines, 2)
})

test('12px prioritized font layout provides readable 2-line title and classroom on two period cards', () => {
  const layout = courseTitleLayout(74, 21.6, 12)
  assert.ok(layout.lines >= 1)
  assert.equal(layout.reservedRoom, 21.6)
  assert.ok(layout.maxHeight + layout.reservedRoom + 4 <= 74 - 8 + 0.01)
})

test('morning collisions stay half width when the afternoon uses more lanes', () => {
  const morning = [
    { secStart: 1, secEnd: 2, conflictLane: 0 },
    { secStart: 1, secEnd: 2, conflictLane: 1 }
  ]
  const afternoon = [
    { secStart: 6, secEnd: 7, conflictLane: 0 },
    { secStart: 6, secEnd: 7, conflictLane: 1 },
    { secStart: 6, secEnd: 7, conflictLane: 2 }
  ]
  const day = [...morning, ...afternoon]
  assert.deepEqual(laneSpan(morning[0], day), { lane: 0, lanes: 2 })
  assert.deepEqual(laneSpan(afternoon[2], day), { lane: 2, lanes: 3 })
  assert.deepEqual(laneSpan(morning[0], [morning[0]]), { lane: 0, lanes: 1 })
})

test('13px scaled font layout prevents title and classroom collision on multi-period cards', () => {
  const layout2 = courseTitleLayout(74, 21.6, 13)
  assert.ok(layout2.lines >= 1)
  assert.ok(layout2.maxHeight + layout2.reservedRoom + (layout2.reservedRoom ? 4 : 0) <= 74 - 8 + 0.01)

  const layout3 = courseTitleLayout(110, 21.6, 13)
  assert.ok(layout3.lines >= 2)
  assert.ok(layout3.maxHeight + layout3.reservedRoom + (layout3.reservedRoom ? 4 : 0) <= 110 - 8 + 0.01)
})
