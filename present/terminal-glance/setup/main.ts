import { defineAppSetup } from '@slidev/types'
import { prefetchLinux } from '../runtime/kernel'

/**
 * Starts Linux's downloads as soon as the app runs. The first terminal would start them only when it mounts, which
 * for a demo past the opening slide is when Slidev pre-mounts the other slides, about 3 s after the deck renders.
 * Only the audience window (the `play` route outside print mode, where `Terminal.vue` runs Linux) prefetches:
 * another window would compile a kernel it never boots.
 */
export default defineAppSetup(({ router }) => {
  unregisterIsolationWorker()
  void router.isReady().then(() => {
    if (router.currentRoute.value.name === 'play' && !new URLSearchParams(location.search).has('print'))
      prefetchLinux()
  })
})

/**
 * Earlier versions of the deck registered a service worker, `coi-sw.js`, to add COOP and COEP (scope
 * `/present/terminal-glance/` on the site, `/` on the dev origin). The host and the dev server send these headers
 * themselves (the repository root's `public/_headers`, vite.config.ts `server.headers`); a leftover worker would keep
 * intercepting the deck's navigations, and on the dev origin whatever else is served there later, such as another deck.
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
