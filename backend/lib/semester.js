"use strict";

const semesterStarts = require("../semester-dates.json");

function parseWeekType(text) {
  const raw = String(text || "");
  if (/单周/.test(raw)) return "odd";
  if (/双周/.test(raw)) return "even";
  return "all";
}

function parseWeekRanges(text) {
  if (!text) return [];
  const src = String(text)
    .replace(/\[[^\]]*节\]/g, "")
    .replace(/\(\s*\d{1,2}(?:\s*,\s*\d{1,2})+\s*小节\s*\)/g, "");
  const ranges = [];
  const seen = new Set();
  const re = /(\d{1,2})\s*(?:[-~～至到—－]\s*(\d{1,2}))?\s*(?=周|[，,、;；]|$)/g;
  let match;
  while ((match = re.exec(src))) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || start > 99 || end > 99 || start > end) continue;
    const key = `${start}:${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push({ start, end });
  }
  return ranges;
}

function formatWeekLabel(ranges) {
  if (!ranges || !ranges.length) return "";
  return ranges.map((range) => range.start === range.end
    ? String(range.start)
    : `${range.start}-${range.end}`).join(",");
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseSemesterStart(semester, dates = semesterStarts) {
  const iso = dates[String(semester || "")] || "";
  if (!isIsoDate(iso)) return { iso: "", date: null, known: false };
  return { iso, date: new Date(`${iso}T00:00:00.000Z`), known: true };
}

function mondayUtc(date) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function currentWeekOf(startIso, now = new Date()) {
  if (!isIsoDate(startIso)) return null;
  const start = mondayUtc(new Date(`${startIso}T00:00:00.000Z`));
  const instant = now instanceof Date ? now : new Date(now);
  const beijing = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  const beijingDay = new Date(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate()));
  const current = mondayUtc(beijingDay);
  const week = Math.floor((current.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return week;
}

module.exports = {
  parseWeekType,
  parseWeekRanges,
  formatWeekLabel,
  parseSemesterStart,
  currentWeekOf,
  isIsoDate,
};
