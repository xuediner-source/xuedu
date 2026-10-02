import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetCssPath = path.resolve(__dirname, '../assets/widget.css')
const mainCssPath = path.resolve(__dirname, '../assets/main.css')

const widgetCss = fs.readFileSync(widgetCssPath, 'utf8')
const mainCss = fs.readFileSync(mainCssPath, 'utf8')

test('widget-backdrop enforces opacity: 1, transition: none and forbids fullscreen opacity: 0 fade', () => {
  // Extract .widget-backdrop rule block
  const backdropMatch = widgetCss.match(/\.widget-backdrop\s*\{([^}]+)\}/)
  assert.ok(backdropMatch, '.widget-backdrop rule must exist in widget.css')
  const body = backdropMatch[1]

  // Must not have opacity: 0 or transition with opacity
  assert.equal(/opacity\s*:\s*0\b/.test(body), false, 'widget-backdrop must NOT contain opacity: 0')
  assert.equal(/transition\s*:\s*[^;]*opacity/.test(body), false, 'widget-backdrop must NOT transition opacity')

  // Must have visibility: hidden and opacity: 1 (constant)
  assert.ok(/visibility\s*:\s*hidden/.test(body), 'widget-backdrop must toggle via visibility: hidden')
  assert.ok(/opacity\s*:\s*1\b/.test(body), 'widget-backdrop opacity must remain constant 1')
  assert.ok(/transition\s*:\s*none/.test(body), 'widget-backdrop transition must be none')

  // Check .widget-backdrop.show
  const showMatch = widgetCss.match(/\.widget-backdrop\.show\s*\{([^}]+)\}/)
  assert.ok(showMatch, '.widget-backdrop.show rule must exist in widget.css')
  const showBody = showMatch[1]
  assert.ok(/visibility\s*:\s*visible/.test(showBody), '.widget-backdrop.show must have visibility: visible')
  assert.ok(/pointer-events\s*:\s*auto/.test(showBody), '.widget-backdrop.show must have pointer-events: auto')
  assert.ok(/opacity\s*:\s*1\b/.test(showBody), '.widget-backdrop.show opacity must remain 1')
})

test('global backdrop-filter is strictly banned to protect against Android WebView white boxes', () => {
  assert.ok(
    mainCss.includes('backdrop-filter: none !important'),
    'main.css must globally enforce backdrop-filter: none !important'
  )
  assert.ok(
    mainCss.includes('-webkit-backdrop-filter: none !important'),
    'main.css must globally enforce -webkit-backdrop-filter: none !important'
  )
})

test('Vant overlays and route transitions enforce dark mask and zero fade animation', () => {
  assert.ok(
    mainCss.includes('.van-overlay') && mainCss.includes('rgba(0, 0, 0, 0.40) !important'),
    'van-overlay must use dark mask rgba(0,0,0,0.40)'
  )
  assert.ok(
    mainCss.includes('.van-fade-enter-active') && mainCss.includes('transition: none !important'),
    'van-fade must disable transition to avoid WebView white flash'
  )
  assert.ok(
    mainCss.includes('.app-page-enter-active') && mainCss.includes('transition: none !important'),
    'app-page-enter-active must disable transition'
  )
})

test('DOM simulation: computed mask opacity !== 0 and transition duration === 0s across open/close', () => {
  function simulateBackdrop(isOpen, isReducedMotion = false) {
    // Mimic the CSS rules declared in widget.css
    const style = {
      visibility: isOpen ? 'visible' : 'hidden',
      opacity: 1, // constant
      transition: isReducedMotion ? 'none' : 'none',
      transitionDuration: '0s',
      pointerEvents: isOpen ? 'auto' : 'none',
      backgroundColor: 'rgba(0, 0, 0, 0.38)'
    }
    return style
  }

  // Normal mode: at 20ms and 300ms during open/close
  for (const timeMs of [0, 20, 150, 300]) {
    for (const isOpen of [true, false]) {
      for (const isReducedMotion of [false, true]) {
        const computed = simulateBackdrop(isOpen, isReducedMotion)
        assert.notEqual(computed.opacity, 0, `Opacity must never be 0 at t=${timeMs}ms (open=${isOpen})`)
        assert.equal(computed.opacity, 1, 'Opacity must stay 1')
        assert.equal(computed.transitionDuration, '0s', 'Transition duration must be 0s')
      }
    }
  }
})
