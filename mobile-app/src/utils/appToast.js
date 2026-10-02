let host = null
let hideTimer = 0

function ensureHost() {
  if (host && document.body.contains(host)) return host
  host = document.createElement('div')
  host.className = 'app-toast'
  host.setAttribute('role', 'status')
  document.body.appendChild(host)
  return host
}

export function showToast(opts) {
  const message = typeof opts === 'string' ? opts : String((opts && opts.message) || '')
  const duration = typeof opts === 'object' && opts && Number.isFinite(Number(opts.duration))
    ? Number(opts.duration)
    : 2200
  if (!message) return
  const el = ensureHost()
  el.textContent = message
  el.classList.add('is-show')
  window.clearTimeout(hideTimer)
  if (duration > 0) {
    hideTimer = window.setTimeout(closeToast, duration)
  }
}

export function closeToast() {
  window.clearTimeout(hideTimer)
  if (host) host.classList.remove('is-show')
}

export function isToastOpen() {
  return !!(host && host.classList.contains('is-show'))
}
