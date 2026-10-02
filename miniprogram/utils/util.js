function formatTime(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  return [year, month, day].map(formatNumber).join('-') + ' ' + [hour, minute].map(formatNumber).join(':');
}

function formatNumber(n) {
  n = n.toString();
  return n[1] ? n : '0' + n;
}

function getCurrentWeek(semesterStart, serverWeek) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(semesterStart || ''))) {
    if (serverWeek == null || serverWeek === '') return null;
    const fromServer = Number(serverWeek);
    return Number.isInteger(fromServer) ? fromServer : null;
  }
  const [year, month, day] = semesterStart.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day));
  if (startDate.getUTCFullYear() !== year || startDate.getUTCMonth() !== month - 1 || startDate.getUTCDate() !== day) return null;
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate()));
  const monday = date => {
    const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value;
  };
  const diff = monday(today).getTime() - monday(startDate).getTime();
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return week;
}

function parseWeekRanges(weeks) {
  const source = String(weeks || '').replace(/\[[^\]]*节\]/g, '');
  const ranges = [];
  const seen = {};
  const pattern = /(\d{1,2})\s*(?:[-~～至到—－]\s*(\d{1,2}))?\s*(?=周|[，,、;；]|$)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const key = start + ':' + end;
    if (start < 1 || start > 99 || end > 99 || start > end || seen[key]) continue;
    seen[key] = true;
    ranges.push({ start, end });
  }
  return ranges;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function getWeekday(date) {
  return WEEKDAYS[date.getDay()];
}

module.exports = { formatTime, getCurrentWeek, parseWeekRanges, getWeekday, WEEKDAYS };
