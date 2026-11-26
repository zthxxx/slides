import { defineAppSetup } from '@slidev/types'
import { prefetchLinux } from '../runtime/kernel'

/**
 * Starts Linux's downloads as soon as the app runs. The first terminal would start them only when it mounts, which
 * for a demo past the opening slide is when Slidev pre-mounts the other slides, about 3 s after the deck renders.
 * Only the audience window (the `play` route outside print mode, where `Terminal.vue` runs Linux) prefetches:
 * another window would compile a kernel it never boots.
 */
export default defineAppSetup(({ router }) => {
  if (import.meta.env.DEV)
    unregisterIsolationWorker()
  void router.isReady().then(() => {
    if (router.currentRoute.value.name === 'play' && !new URLSearchParams(location.search).has('print'))
      prefetchLinux()
  })
})

/**
 * The dev server isolates the page with its own headers (vite.config.ts `server.headers`), so it needs no service
 * worker; one registered here by an earlier version of the deck would add the headers to whatever else is served on
 * this origin later, such as another deck. A build keeps it: on GitHub Pages, which does not send the headers, the
 * worker is what isolates the page (runtime/isolate-page.js).
 */
function unregisterIsolationWorker(): void {
  void navigator.serviceWorker?.getRegistrations()
    .then(registrations => Promise.all(registrations
      .filter((registration) => {
        const worker = registration.active ?? registration.waiting ?? registration.installing
        return worker?.scriptURL.includes('/coi-sw.js')
      })
      .map(registration => registration.unregister())))
    .catch(() => {})
}
