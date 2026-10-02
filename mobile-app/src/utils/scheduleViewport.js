/**
 * Viewport and layout budget calculations for Schedule calendar.
 * Replaces hardcoded chrome 208 and bottom 64/20 with dynamic measurements
 * and CSS shared token fallbacks.
 */

export const DEFAULT_TOKENS = {
  tabCapsuleHeight: 60, // --tab-capsule-height
  tabFloatGap: 10,      // --tab-float-gap
  dockPadding: 12,      // extra padding above dock
  dockMask: 0,          // --dock-mask
  minSlotHeight: 40,    // minimum usable slot height
  defaultChrome: 182,   // fallback header chrome height (safe-top + page padding + compact bar + week rail + weekday header)
  overlayBottom: 20     // fallback bottom clearance when in overlay mode
}

/**
 * Resolves safe area inset bottom from a DOM probe element or CSS computed styles.
 * Handles env(safe-area-inset-bottom) and calc(...) expressions by reading resolved
 * computed pixel values on dedicated single-token probe elements.
 */
export function resolveSafeAreaBottom(probeElement = null) {
  if (probeElement && typeof window !== 'undefined') {
    try {
      const style = window.getComputedStyle(probeElement)
      const val = parseFloat(style.height)
      if (!isNaN(val) && val >= 0) {
        return val
      }
    } catch (e) {}
  }
  return 0
}

/**
 * Checks if a DOM element is currently rendered and visible.
 * Does NOT rely on offsetParent heuristic because fixed elements (like .floating-dock)
 * have offsetParent === null in standard CSSOM implementations.
 * Relies strictly on display, visibility, opacity, and getBoundingClientRect dimensions.
 */
export function isElementVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false
  if (typeof window !== 'undefined') {
    try {
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false
      }
    } catch (e) {}
  }
  const rect = el.getBoundingClientRect()
  return rect.height > 0 && rect.width > 0
}

/**
 * Calculate bottom clearance needed so timetable content stays strictly above the dock.
 * In overlay mode or when dock is explicitly hidden, reserves safe-bottom + dockPadding.
 * In tab mode, accounts for measured dock top position plus extra 12px gap (or token fallback).
 */
export function getBottomClearance({
  isOverlay = false,
  dockElement = null,
  safeBottom = 0,
  windowInnerHeight = (typeof window !== 'undefined' ? window.innerHeight : 844),
  tokens = DEFAULT_TOKENS
} = {}) {
  const safe = typeof safeBottom === 'number' && !isNaN(safeBottom) ? Math.max(0, safeBottom) : 0

  // Explicit overlay mode OR dockElement exists in DOM but is hidden:
  if (isOverlay || (dockElement && !isElementVisible(dockElement))) {
    return Math.max(tokens.overlayBottom, safe + tokens.dockPadding)
  }

  // Token-based minimum for normal Tab mode: calc(60px + 10px + safe-bottom + 12px)
  const minimum = tokens.tabCapsuleHeight + tokens.tabFloatGap + safe + tokens.dockPadding

  // If dock element is rendered and visible in DOM:
  // Measure its top relative to viewport, and reserve an extra 12px gap (dockPadding) above physical dock top.
  if (dockElement && typeof dockElement.getBoundingClientRect === 'function') {
    const rect = dockElement.getBoundingClientRect()
    if (rect.top > 0 && windowInnerHeight > 0) {
      const measured = Math.round(windowInnerHeight - rect.top) + tokens.dockPadding
      return Math.max(minimum, measured)
    }
  }

  return minimum
}

/**
 * Measure chrome height: the vertical space from the visible viewport top
 * down to the top of the timetable grid tracks, including safe-top, page padding,
 * top bar, week rail, and weekday header.
 *
 * Coordinate system:
 * In un-scrolled state, the grid top relative to viewport top is:
 *   chrome = pageTopOffsetInViewport + (gridRect.top - pageRect.top)
 * By using (gridRect.top - pageRect.top), inner page scrolling does not alter
 * the measured height of the header chrome, preventing slotH jump/jitter.
 */
export function getChromeHeight({
  pageElement = null,
  gridElement = null,
  scrollContainer = null,
  defaultChrome = DEFAULT_TOKENS.defaultChrome
} = {}) {
  if (pageElement && gridElement && typeof pageElement.getBoundingClientRect === 'function' && typeof gridElement.getBoundingClientRect === 'function') {
    const pageRect = pageElement.getBoundingClientRect()
    const gridRect = gridElement.getBoundingClientRect()

    // Document-relative offset of page from scroll container or body
    const scrollY = (scrollContainer ? scrollContainer.scrollTop : (typeof window !== 'undefined' ? window.scrollY || window.pageYOffset : 0)) || 0
    const pageUnscrolledTop = Math.max(0, pageRect.top + scrollY)

    // Distance from page top to grid tracks (includes page padding-top + compact bar + week rail + weekday header)
    const pageToGrid = gridRect.top - pageRect.top

    const totalChrome = Math.round(pageUnscrolledTop + pageToGrid)
    if (totalChrome >= 60) {
      return totalChrome
    }
  }
  return defaultChrome
}

/**
 * Clamp helper
 */
export function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), Math.max(hi, lo))
}

/**
 * Pure slot height computation
 */
export function computeSlotHeight({
  viewportHeight = 844,
  chromeHeight = DEFAULT_TOKENS.defaultChrome,
  bottomClearance = 82,
  periodCount = 10,
  preferredDensity = 58,
  minSlotHeight = DEFAULT_TOKENS.minSlotHeight
} = {}) {
  const safePeriods = Math.max(1, periodCount)
  const available = Math.max(0, viewportHeight - chromeHeight - bottomClearance)
  const fit = Math.floor(available / safePeriods)
  return clamp(fit, minSlotHeight, preferredDensity)
}
