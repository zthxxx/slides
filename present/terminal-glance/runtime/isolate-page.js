// Cross-origin isolation for Linux's 4 CPUs (runtime/kernel.ts) on a host that does not send COOP and COEP itself
// (GitHub Pages; Cloudflare Pages sends them from the repository root's `public/_headers`). A page that is not
// cross-origin isolated registers public/coi-sw.js, which adds both headers to the deck's documents, and reloads once
// the worker is active. vite.config.ts inlines this file at the top of index.html, so it starts before the app's
// scripts. `__BASE__` is the deck's base URL.
//
// An isolated page, by its host's headers or by an active worker, registers nothing. One reload per tab session
// (sessionStorage), cleared by the next isolated load: a load that is still not isolated after it stays on 1 CPU
// instead of reloading again; without sessionStorage there is no reload at all. Other registrations under the deck's
// scope (an older script URL or scope) are unregistered; a changed coi-sw.js replaces itself (its skipWaiting and
// clients.claim), and `updateViaCache: 'none'` fetches it past the HTTP cache, so a new deploy reaches the next load.
(() => {
  const key = 'terminal-glance:isolation-reload'
  if (window.crossOriginIsolated) {
    try {
      sessionStorage.removeItem(key)
    }
    catch {}
    return
  }
  if (!('serviceWorker' in navigator))
    return
  const base = __BASE__
  const script = new URL(`${base}coi-sw.js`, location.href).href
  const scope = new URL(base, location.href).href
  let mayReload = false
  try {
    mayReload = sessionStorage.getItem(key) === null
  }
  catch {}

  const reloadOnce = () => {
    try {
      sessionStorage.setItem(key, String(Date.now()))
    }
    catch {
      return
    }
    location.reload()
  }

  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter(registration => registration.scope.startsWith(scope)
        && (registration.active || registration.waiting || registration.installing)?.scriptURL !== script)
      .map(registration => registration.unregister())))
    .catch(() => {})
    .then(() => navigator.serviceWorker.register(script, { scope, updateViaCache: 'none' }))
    .then((registration) => {
      if (!mayReload)
        return
      const worker = registration.installing || registration.waiting || registration.active
      if (worker.state === 'activated')
        return reloadOnce()
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated')
          reloadOnce()
      })
    })
    .catch(() => {})
})()
