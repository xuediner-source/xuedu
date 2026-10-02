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
