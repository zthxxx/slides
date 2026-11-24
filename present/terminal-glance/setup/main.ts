import { defineAppSetup } from '@slidev/types'
import { prefetchLinux } from '../runtime/kernel'

/**
 * Starts Linux's downloads as soon as the app runs. The first terminal would start them only when it mounts, which
 * for a demo past the opening slide is when Slidev pre-mounts the other slides, about 3 s after the deck renders.
 * Only the audience window (the `play` route outside print mode, where `Terminal.vue` runs Linux) prefetches:
 * another window would compile a kernel it never boots.
 */
export default defineAppSetup(({ router }) => {
  registerIsolation()
  void router.isReady().then(() => {
    if (router.currentRoute.value.name === 'play' && !new URLSearchParams(location.search).has('print'))
      prefetchLinux()
  })
})

/**
 * Registers `public/coi-sw.js`, which makes the deck's pages cross-origin isolated, so that Linux runs on several
 * CPUs (runtime/kernel.ts). The first visit does not reload: it boots on one CPU, and the worker isolates the next
 * load. Any other registration of the deck (an older script URL or scope) is unregistered, so no stale worker keeps
 * serving its pages; a changed coi-sw.js replaces itself (its skipWaiting and clients.claim). The browser fetches the
 * worker's script past the HTTP cache (`updateViaCache: 'none'`), so it sees a new deploy on the next load.
 */
function registerIsolation(): void {
  if (!('serviceWorker' in navigator))
    return
  const base = import.meta.env.BASE_URL
  const script = new URL(`${base}coi-sw.js`, location.href).href
  const scope = new URL(base, location.href).href
  void navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter(registration => registration.scope.startsWith(scope) && workerScript(registration) !== script)
      .map(registration => registration.unregister())))
    .catch(() => {})
    .then(() => navigator.serviceWorker.register(script, { scope, updateViaCache: 'none' }))
    .catch(() => {})
}

function workerScript(registration: ServiceWorkerRegistration): string | undefined {
  return (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL
}
