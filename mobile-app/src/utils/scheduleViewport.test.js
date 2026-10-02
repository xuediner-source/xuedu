import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TOKENS,
  resolveSafeAreaBottom,
  isElementVisible,
  getBottomClearance,
  getChromeHeight,
  computeSlotHeight,
  clamp
} from './scheduleViewport.js'

test('DEFAULT_TOKENS defines capsule dock clearance correctly', () => {
  // 60 + 10 + 0 + 12 = 82
  const expectedDockClearance = DEFAULT_TOKENS.tabCapsuleHeight + DEFAULT_TOKENS.tabFloatGap + DEFAULT_TOKENS.dockPadding
  assert.equal(expectedDockClearance, 82)
  assert.equal(DEFAULT_TOKENS.dockMask, 0)
  assert.equal(DEFAULT_TOKENS.minSlotHeight, 40)
  assert.equal(DEFAULT_TOKENS.defaultChrome, 182)
})

test('layout-aware assertion: probe element with height 20px resolves computed height strictly === 20px without padding interference', () => {
  const mockProbe = {
    _style: {
      height: '20px',
      paddingBottom: '0px',
      boxSizing: 'content-box'
    }
  }
  globalThis.window = {
    getComputedStyle(el) {
      return el._style || { height: '0px' }
    }
  }

  const resolved20 = resolveSafeAreaBottom(mockProbe)
  assert.equal(resolved20, 20, 'computed height must strictly === 20px')

  // Injected calc(10px + 10px) resolves to 20px in getComputedStyle
  mockProbe._style.height = '20px'
  const resolvedCalc = resolveSafeAreaBottom(mockProbe)
  assert.equal(resolvedCalc, 20, 'calc(10px + 10px) must resolve to 20px')

  // Empty / unmounted fallback
  const emptyResolved = resolveSafeAreaBottom(null)
  assert.equal(emptyResolved, 0)
})

test('isElementVisible correctly identifies visible vs hidden elements without broken offsetParent heuristic', () => {
  globalThis.window = {
    getComputedStyle(el) {
      return el._style || { display: 'block', visibility: 'visible', opacity: '1' }
    }
  }

  // Fixed dock element has offsetParent === null in standard browsers, but IS visible
  const fixedDockEl = {
    offsetParent: null,
    tagName: 'NAV',
    getBoundingClientRect: () => ({ width: 360, height: 60 }),
    _style: { display: 'flex', visibility: 'visible', opacity: '1' }
  }
  assert.equal(isElementVisible(fixedDockEl), true, 'fixed element with offsetParent null must be detected as visible')

  const visibleEl = {
    offsetParent: {},
    tagName: 'DIV',
    getBoundingClientRect: () => ({ width: 360, height: 60 }),
    _style: { display: 'flex', visibility: 'visible', opacity: '1' }
  }
  assert.equal(isElementVisible(visibleEl), true)

  const hiddenDisplayEl = {
    offsetParent: null,
    tagName: 'DIV',
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
    _style: { display: 'none', visibility: 'visible', opacity: '1' }
  }
  assert.equal(isElementVisible(hiddenDisplayEl), false)

  const hiddenOpacityEl = {
    offsetParent: {},
    tagName: 'DIV',
    getBoundingClientRect: () => ({ width: 360, height: 60 }),
    _style: { display: 'flex', visibility: 'visible', opacity: '0' }
  }
  assert.equal(isElementVisible(hiddenOpacityEl), false)
})

test('getBottomClearance calculates dock and overlay clearance with safe-bottom and extra gap', () => {
  // Tab view with safe-bottom = 0
  const tabBottom0 = getBottomClearance({ isOverlay: false, safeBottom: 0 })
  assert.equal(tabBottom0, 82)

  // Tab view with safe-bottom = 20 (e.g. gesture home indicator)
  const tabBottom20 = getBottomClearance({ isOverlay: false, safeBottom: 20 })
  assert.equal(tabBottom20, 102)

  // Overlay view without dock: safeBottom = 0 -> Math.max(20, 0 + 12) = 20
  const overlayBottom0 = getBottomClearance({ isOverlay: true, safeBottom: 0 })
  assert.equal(overlayBottom0, 20)

  // Overlay view with safeBottom = 20 -> Math.max(20, 20 + 12) = 32
  const overlayBottom20 = getBottomClearance({ isOverlay: true, safeBottom: 20 })
  assert.equal(overlayBottom20, 32)
})

test('getBottomClearance ignores hidden dock element and falls back to overlay clearance', () => {
  globalThis.window = {
    getComputedStyle(el) {
      return { display: 'none', visibility: 'hidden', opacity: '0' }
    }
  }

  const hiddenDock = {
    offsetParent: null,
    tagName: 'DIV',
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0 })
  }

  const clearance = getBottomClearance({
    isOverlay: false,
    dockElement: hiddenDock,
    safeBottom: 20,
    windowInnerHeight: 844
  })
  // Hidden dock should not enforce physical dock bottom; should reserve overlay safeBottom + 12 = 32
  assert.equal(clearance, 32)
})

test('getBottomClearance reserves extra 12px gap above physical dock top', () => {
  globalThis.window = {
    getComputedStyle(el) {
      return { display: 'flex', visibility: 'visible', opacity: '1' }
    }
  }

  const mockDock = {
    offsetParent: {},
    tagName: 'NAV',
    getBoundingClientRect() {
      // Dock top is at 764 on an 844 height screen -> physical height is 80px
      return { top: 764, bottom: 844, height: 80, width: 360 }
    }
  }
  const measuredBottom = getBottomClearance({
    isOverlay: false,
    dockElement: mockDock,
    safeBottom: 0,
    windowInnerHeight: 844
  })
  // 844 - 764 = 80px physical height + 12px gap = 92px
  assert.equal(measuredBottom, 92)
})

test('getChromeHeight computes document-relative offset invariant to inner page scrolling', () => {
  // Scenario 1: Un-scrolled page
  const pageUnscrolled = {
    getBoundingClientRect() { return { top: 0 } }
  }
  const gridUnscrolled = {
    getBoundingClientRect() { return { top: 182 } }
  }
  const chromeUnscrolled = getChromeHeight({
    pageElement: pageUnscrolled,
    gridElement: gridUnscrolled,
    scrollContainer: { scrollTop: 0 }
  })
  assert.equal(chromeUnscrolled, 182)

  // Scenario 2: Scrolled down 120px in body / container
  const pageScrolled = {
    getBoundingClientRect() { return { top: -120 } }
  }
  const gridScrolled = {
    getBoundingClientRect() { return { top: 62 } } // 182 - 120 = 62
  }
  const chromeScrolled = getChromeHeight({
    pageElement: pageScrolled,
    gridElement: gridScrolled,
    scrollContainer: { scrollTop: 120 }
  })
  assert.equal(chromeScrolled, 182, 'Chrome height must remain invariant when page scrolls')
})

test('standard 390x844 viewport fits 10 periods completely above dock across densities', () => {
  // Density 58
  const slot58 = computeSlotHeight({
    viewportHeight: 844,
    chromeHeight: 182,
    bottomClearance: 102, // safe-bottom: 20
    periodCount: 10,
    preferredDensity: 58
  })
  // available = 844 - 182 - 102 = 560 -> fit = 56 -> clamped to 56
  assert.equal(slot58, 56)
  assert.ok(182 + 10 * slot58 <= 844 - 102, '10 periods stay strictly above dock clearance')

  // Density 48 (Compact)
  const slot48 = computeSlotHeight({
    viewportHeight: 844,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 10,
    preferredDensity: 48
  })
  assert.equal(slot48, 48)

  // Density 70 (Spacious)
  const slot70 = computeSlotHeight({
    viewportHeight: 844,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 10,
    preferredDensity: 70
  })
  assert.equal(slot70, 56) // available 560 / 10 = 56
})

test('small screen 360x780 fits 10 periods with responsive slot height', () => {
  const slotH = computeSlotHeight({
    viewportHeight: 780,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 10,
    preferredDensity: 58
  })
  // available = 780 - 182 - 102 = 496 -> fit = 49 -> clamped to 49
  assert.equal(slotH, 49)
  assert.ok(182 + 10 * slotH <= 780 - 102)
})

test('short screen 690px stays at minimum slot height 40px and allows scrolling', () => {
  const slotH = computeSlotHeight({
    viewportHeight: 690,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 10,
    preferredDensity: 58
  })
  // available = 690 - 182 - 102 = 406 -> fit = 40 -> clamped to 40 >= 40
  assert.equal(slotH, 40)
  assert.ok(slotH >= 40)
})

test('13 periods evening classes compute valid slot height and enforce min 40px', () => {
  const slotH = computeSlotHeight({
    viewportHeight: 844,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 13,
    preferredDensity: 58
  })
  // available = 560 / 13 = 43
  assert.equal(slotH, 43)
  assert.ok(slotH >= 40)

  // Short screen with 13 periods clamps to 40px without dropping lower
  const short13SlotH = computeSlotHeight({
    viewportHeight: 600,
    chromeHeight: 182,
    bottomClearance: 102,
    periodCount: 13,
    preferredDensity: 58
  })
  assert.equal(short13SlotH, 40)
})
