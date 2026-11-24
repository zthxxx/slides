// Cross-origin isolation for Linux's 4 CPUs (runtime/kernel.ts). Registers public/coi-sw.js, which adds COOP and COEP
// to the deck's documents, and reloads a page the worker did not serve once the worker is active: the first visit
// would otherwise run on 1 CPU. vite.config.ts inlines this file at the top of index.html, so it starts before the
// app's scripts. `__BASE__` is the deck's base URL.
//
// One reload per tab session (sessionStorage): a load that is still not isolated after it, such as a hard reload,
// which bypasses service workers, stays on 1 CPU instead of reloading again; without sessionStorage there is no
// reload at all. Other registrations under the deck's scope (an older script URL or scope) are unregistered; a
// changed coi-sw.js replaces itself (its skipWaiting and clients.claim), and `updateViaCache: 'none'` fetches it past
// the HTTP cache, so a new deploy reaches the next load.
(() => {
  if (!('serviceWorker' in navigator))
    return
  const base = __BASE__
  const script = new URL(`${base}coi-sw.js`, location.href).href
  const scope = new URL(base, location.href).href
  const key = 'terminal-glance:isolation-reload'
  let mayReload = false
  try {
    mayReload = !crossOriginIsolated && sessionStorage.getItem(key) === null
    if (crossOriginIsolated)
      sessionStorage.removeItem(key)
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
