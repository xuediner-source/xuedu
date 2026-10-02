<template>
  <svg
    :class="['icon-svg', customClass]"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g
      :stroke="paint"
      stroke-width="1.85"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <path v-for="(d, i) in glyph.paths" :key="'p' + i" :d="d" />
      <polyline v-for="(pts, i) in glyph.polylines" :key="'pl' + i" :points="pts" />
      <line
        v-for="(ln, i) in glyph.lines"
        :key="'l' + i"
        :x1="ln[0]"
        :y1="ln[1]"
        :x2="ln[2]"
        :y2="ln[3]"
      />
      <rect
        v-for="(r, i) in glyph.rects"
        :key="'r' + i"
        :x="r.x"
        :y="r.y"
        :width="r.w"
        :height="r.h"
        :rx="r.rx || 0"
      />
      <circle
        v-for="(c, i) in glyph.rings"
        :key="'rg' + i"
        :cx="c.cx"
        :cy="c.cy"
        :r="c.r"
      />
    </g>
    <g :fill="paint" stroke="none">
      <circle
        v-for="(c, i) in glyph.dots"
        :key="'d' + i"
        :cx="c.cx"
        :cy="c.cy"
        :r="c.r"
      />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const ALIAS = {
  add: 'plus'
}

/**
 * One outline grammar: 24×24, round 1.85 stroke.
 * Old square 1.55 interceptor and mixed solid/dead branches removed.
 * Dots (more / list / sliders knobs) stay currentColor fills — they are marks, not a second language.
 */
const ICONS = {
  home: {
    paths: ['M5 10.6 12 4.4 19 10.6V19.4H14.3v-5.3H9.7v5.3H5V10.6Z']
  },
  schedule: {
    rects: [{ x: 4, y: 5.2, w: 16, h: 14.6, rx: 2.2 }],
    lines: [[4, 9.4, 20, 9.4], [8, 3.6, 8, 7], [16, 3.6, 16, 7]]
  },
  grades: {
    rects: [
      { x: 5.2, y: 12.2, w: 3.4, h: 6.6, rx: 1.1 },
      { x: 10.3, y: 5.8, w: 3.4, h: 13, rx: 1.1 },
      { x: 15.4, y: 9.4, w: 3.4, h: 9.4, rx: 1.1 }
    ]
  },
  exam: {
    paths: [
      'M8 3.8h6.1L19.2 8.8V20.2H8V3.8Z',
      'M14.1 3.8V8.8H19.2',
      'M10 13.4l1.9 1.9 3.5-3.7'
    ]
  },
  profile: {
    rings: [{ cx: 12, cy: 8, r: 3.35 }],
    paths: ['M5.4 19.6c.35-3.05 3.15-5.05 6.6-5.05s6.25 2 6.6 5.05']
  },
  user: {
    rings: [{ cx: 12, cy: 8, r: 3.35 }],
    paths: ['M5.4 19.6c.35-3.05 3.15-5.05 6.6-5.05s6.25 2 6.6 5.05']
  },
  location: {
    paths: ['M12 20.5s6.3-5.5 6.3-10A6.3 6.3 0 0 0 5.7 10.5c0 4.5 6.3 10 6.3 10Z'],
    rings: [{ cx: 12, cy: 10.3, r: 2.15 }]
  },
  clock: {
    rings: [{ cx: 12, cy: 12, r: 8 }],
    paths: ['M12 7.7V12.2L15.2 14']
  },
  refresh: {
    paths: ['M19.8 12A7.8 7.8 0 1 1 17.5 6.3'],
    polylines: ['19.8 3.6 19.8 8.5 15 8.5']
  },
  more: {
    dots: [
      { cx: 6, cy: 12, r: 1.55 },
      { cx: 12, cy: 12, r: 1.55 },
      { cx: 18, cy: 12, r: 1.55 }
    ]
  },
  'arrow-left': {
    lines: [[19, 12, 5, 12]],
    polylines: ['12 19 5 12 12 5']
  },
  'chevron-left': { polylines: ['15 18 9 12 15 6'] },
  'chevron-right': { polylines: ['9 18 15 12 9 6'] },
  'chevron-down': { polylines: ['6 9 12 15 18 9'] },
  sparkles: {
    paths: ['M12 3.3 13.7 8.7 19.2 10.4 13.7 12.1 12 17.5 10.3 12.1 4.8 10.4 10.3 8.7Z']
  },
  book: {
    paths: [
      'M4.6 6.1c0-.8.7-1.5 1.5-1.5H12V18.8H6.1c-.8 0-1.5-.7-1.5-1.5V6.1Z',
      'M19.4 6.1c0-.8-.7-1.5-1.5-1.5H12V18.8h5.9c.8 0 1.5-.7 1.5-1.5V6.1Z'
    ]
  },
  plus: {
    lines: [[12, 5.2, 12, 18.8], [5.2, 12, 18.8, 12]]
  },
  image: {
    rects: [{ x: 3.8, y: 5.4, w: 16.4, h: 13.2, rx: 2.2 }],
    dots: [{ cx: 8.5, cy: 10.1, r: 1.4 }],
    paths: ['M5.4 16.6 9.8 12.4 20.2 18.4']
  },
  list: {
    lines: [[8.6, 7, 20, 7], [8.6, 12, 20, 12], [8.6, 17, 20, 17]],
    dots: [
      { cx: 4.7, cy: 7, r: 1.15 },
      { cx: 4.7, cy: 12, r: 1.15 },
      { cx: 4.7, cy: 17, r: 1.15 }
    ]
  },
  'calendar-export': {
    rects: [{ x: 4, y: 5.2, w: 16, h: 14.6, rx: 2.2 }],
    lines: [[8, 3.5, 8, 7], [16, 3.5, 16, 7], [4, 10, 20, 10], [8, 15.2, 16, 15.2]]
  },
  'calendar-grid': {
    rects: [{ x: 3.8, y: 4.4, w: 16.4, h: 16.2, rx: 2.4 }],
    lines: [
      [7.2, 8.2, 9.2, 8.2],
      [11, 8.2, 13, 8.2],
      [14.8, 8.2, 16.8, 8.2],
      [7.2, 12.2, 9.2, 12.2],
      [11, 12.2, 13, 12.2],
      [14.8, 12.2, 16.8, 12.2],
      [7.2, 16.2, 9.2, 16.2],
      [11, 16.2, 13, 16.2]
    ]
  },
  sliders: {
    lines: [[4, 7.2, 20, 7.2], [4, 16.8, 20, 16.8]],
    dots: [
      { cx: 9, cy: 7.2, r: 2.05 },
      { cx: 15, cy: 16.8, r: 2.05 }
    ]
  },
  palette: {
    paths: ['M12 3.6C7.2 3.6 4 7.4 4 12c0 4.2 3.4 8.4 8.2 8.4 1.6 0 2.4-1.1 2.4-2.3 0-.7-.3-1.4-.3-2.1 0-1.2.9-2 2.1-2h1.1c1.8 0 3.1-1.5 3.1-3.3C20.3 6.6 16.7 3.6 12 3.6Z'],
    dots: [
      { cx: 8.1, cy: 10, r: 1.05 },
      { cx: 12, cy: 7.6, r: 1.05 },
      { cx: 16, cy: 9.6, r: 1.05 },
      { cx: 9.3, cy: 14.1, r: 1.05 }
    ]
  },
  share: {
    paths: ['M5.2 13.6V18.6c0 .8.7 1.5 1.5 1.5h10.6c.8 0 1.5-.7 1.5-1.5v-5'],
    lines: [[12, 15.2, 12, 4.4]],
    polylines: ['8.3 7.8 12 4.4 15.7 7.8']
  },
  'school-cap': {
    paths: [
      'M3.4 10.2 12 5.5 20.6 10.2 12 14.9Z',
      'M20.6 10.2V16.4',
      'M6.4 12.5v3.2c0 1.5 2.5 2.7 5.6 2.7s5.6-1.2 5.6-2.7v-3.2'
    ]
  },
  'weather-sun': {
    rings: [{ cx: 12, cy: 12, r: 3.5 }],
    lines: [
      [12, 3.5, 12, 5.5],
      [12, 18.5, 12, 20.5],
      [3.5, 12, 5.5, 12],
      [18.5, 12, 20.5, 12],
      [5.4, 5.4, 6.8, 6.8],
      [17.2, 17.2, 18.6, 18.6],
      [5.4, 18.6, 6.8, 17.2],
      [17.2, 6.8, 18.6, 5.4]
    ]
  },
  'weather-cloud': {
    paths: ['M7.2 17.4h9.6a3.4 3.4 0 0 0 .35-6.78A5.15 5.15 0 0 0 7.3 9.4 3.9 3.9 0 0 0 7.2 17.4Z']
  },
  'weather-sun-cloud': {
    rings: [{ cx: 8.4, cy: 8.2, r: 2.5 }],
    lines: [
      [8.4, 3.4, 8.4, 4.7],
      [3.6, 8.2, 4.9, 8.2],
      [4.7, 4.6, 5.7, 5.6],
      [12.1, 4.6, 11.1, 5.6]
    ],
    paths: ['M8.2 18.6h8.4a3.15 3.15 0 0 0 .3-6.26A4.7 4.7 0 0 0 8.4 11.2 3.55 3.55 0 0 0 8.2 18.6Z']
  },
  'weather-rain': {
    paths: ['M7.4 14.6h8.8a3.15 3.15 0 0 0 .32-6.26A4.7 4.7 0 0 0 7.6 7.2 3.55 3.55 0 0 0 7.4 14.6Z'],
    lines: [[8.4, 16.6, 7.5, 20.2], [12, 16.6, 11.1, 20.2], [15.6, 16.6, 14.7, 20.2]]
  },
  'weather-thunder': {
    paths: ['M7.4 13.8h8.8a3.15 3.15 0 0 0 .32-6.26A4.7 4.7 0 0 0 7.6 6.4 3.55 3.55 0 0 0 7.4 13.8Z'],
    polylines: ['12.8 12.4 9.6 17.4 12.2 17.4 10.8 21']
  },
  'weather-wind': {
    paths: [
      'M4 8.2H14.6A3.2 3.2 0 1 0 11.4 5',
      'M3.4 13H18.2A3.2 3.2 0 1 1 15 16',
      'M5.5 17.8H11A2.2 2.2 0 0 0 13.2 15.6'
    ]
  },
  'weather-thermometer': {
    paths: ['M14 14.4V6.2A2.2 2.2 0 0 0 9.6 6.2v8.2A4.05 4.05 0 1 0 14 14.4Z'],
    rings: [{ cx: 12, cy: 17.6, r: 1.7 }],
    lines: [[12, 8.6, 12, 15.8]]
  },
  'weather-drop': {
    paths: ['M12 3.6S6.2 11.2 6.2 15.4A5.8 5.8 0 0 0 12 21.2a5.8 5.8 0 0 0 5.8-5.8C17.8 11.2 12 3.6 12 3.6Z']
  },
  fallback: {
    rings: [{ cx: 12, cy: 12, r: 4.2 }]
  }
}

const EMPTY = { paths: [], polylines: [], lines: [], rects: [], rings: [], dots: [] }

function glyphOf(name) {
  const key = ALIAS[name] || name
  const src = ICONS[key] || ICONS.fallback
  return {
    paths: src.paths || EMPTY.paths,
    polylines: src.polylines || EMPTY.polylines,
    lines: src.lines || EMPTY.lines,
    rects: src.rects || EMPTY.rects,
    rings: src.rings || EMPTY.rings,
    dots: src.dots || EMPTY.dots
  }
}

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: '' },
  customClass: { type: String, default: '' }
})

const paint = computed(() => props.color || 'currentColor')
const glyph = computed(() => glyphOf(props.name))
</script>

<style scoped>
.icon-svg {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
