import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Icon.vue'), 'utf8')

const CALLED_NAMES = [
  'home', 'schedule', 'grades', 'exam', 'profile',
  'arrow-left', 'chevron-left', 'chevron-right', 'chevron-down',
  'refresh', 'more', 'plus', 'add',
  'location', 'clock', 'book', 'sparkles', 'list', 'image',
  'calendar-grid', 'calendar-export', 'sliders', 'palette',
  'school-cap', 'user', 'share',
  'weather-sun', 'weather-cloud', 'weather-sun-cloud',
  'weather-rain', 'weather-thunder', 'weather-wind',
  'weather-thermometer', 'weather-drop'
]

describe('Icon.vue mapping', () => {
  it('keeps name/size/color/customClass props and 24×24 viewBox', () => {
    assert.match(src, /name:\s*\{\s*type:\s*String,\s*required:\s*true/)
    assert.match(src, /size:\s*\{\s*type:\s*\[Number,\s*String\],\s*default:\s*20/)
    assert.match(src, /color:\s*\{\s*type:\s*String,\s*default:\s*''/)
    assert.match(src, /customClass:\s*\{\s*type:\s*String,\s*default:\s*''/)
    assert.match(src, /viewBox="0 0 24 24"/)
    assert.match(src, /stroke-width="1\.85"/)
    assert.match(src, /stroke-linecap="round"/)
    assert.match(src, /stroke-linejoin="round"/)
  })

  it('has no terminal interceptor, dead opacity, white inner stroke, or weather gradients', () => {
    assert.equal(src.includes('terminalPaths'), false)
    assert.equal(src.includes('stroke-linecap="square"'), false)
    assert.equal(/opacity\s*=\s*"0"/.test(src), false)
    assert.equal(/stroke="#fff/i.test(src), false)
    assert.equal(src.includes('linearGradient'), false)
    assert.equal(src.includes('backdrop-filter'), false)
  })

  it('defines every called name (add aliases to plus)', () => {
    const keys = [...src.matchAll(/^\s{2}(?:'([^']+)'|([A-Za-z0-9-]+)):\s*\{/gm)]
      .map((m) => m[1] || m[2])
    const set = new Set(keys)
    assert.ok(set.has('plus'))
    assert.match(src, /add:\s*'plus'/)
    for (const name of CALLED_NAMES) {
      if (name === 'add') continue
      assert.ok(set.has(name), 'missing icon: ' + name)
    }
  })
})
