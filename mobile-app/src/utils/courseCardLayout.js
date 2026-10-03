// Reserve the classroom first; the course title owns the remaining lines.
export function courseTitleLayout(height, roomHeight, fontSize = 11, roomLineHeight = 10.8) {
  const lineHeight = fontSize * 1.35
  const roomBudget = Math.max(0, height - 8 - lineHeight - 4)
  const roomLines = roomHeight ? Math.max(0, Math.floor(roomBudget / roomLineHeight)) : 0
  const reservedRoom = roomLines ? Math.min(roomHeight, roomLines * roomLineHeight) : 0
  const available = Math.max(0, height - 8 - (reservedRoom ? reservedRoom + 4 : 0))
  const lines = Math.max(1, Math.floor(available / lineHeight))
  return { lines, lineHeight, maxHeight: lines * lineHeight, roomLines, reservedRoom }
}

// Width uses only the lanes that overlap this course, not every lane used later that day.
export function laneSpan(course, courses) {
  const overlapping = (Array.isArray(courses) ? courses : []).filter(other =>
    Number(course?.secStart) <= Number(other?.secEnd) && Number(other?.secStart) <= Number(course?.secEnd)
  )
  if (overlapping.length <= 1) return { lane: 0, lanes: 1 }
  const lane = Number(course?.conflictLane) || 0
  const lanes = Math.max(...overlapping.map(other => Number(other?.conflictLane) || 0)) + 1
  return { lane, lanes: Math.max(lanes, lane + 1) }
}
