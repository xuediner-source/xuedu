const CN_BUILDING = {
  一: '一教',
  二: '二教',
  三: '三教',
  四: '四教',
  五: '五教',
  六: '六教',
  七: '七教',
  八: '八教',
  九: '九教',
  十: '十教'
}

export function cleanRoomShort(room = '') {
  let s = String(room || '').trim()
  if (!s) return ''
  s = s
    .replace(/第([一二三四五六七八九十])教学楼/g, (_, n) => CN_BUILDING[n] || n)
    .replace(/第([一二三四五六七八九十])办公楼/g, (_, n) => n + '办')
    .replace(/([A-Za-z]\d{2})\s*教学楼\s*/g, '$1 ')
    .replace(/材料实验楼/g, '材料')
    .replace(/科学城体育馆/g, '体育馆')
    .replace(/逸夫楼/g, '逸夫')
    .replace(/致远楼/g, '致远')
    .replace(/明德楼/g, '明德')
    .replace(/航空楼/g, '航空')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

export function formatRoomBadge(room = '') {
  const clean = cleanRoomShort(room)
  if (!clean) return ''
  return clean.startsWith('@') ? clean : '@' + clean
}
