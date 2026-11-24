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
 * CPUs (runtime/kernel.ts). Only where iframes can be `credentialless` (Chromium), because isolation blocks the
 * embedded botmux page otherwise. The first visit does not reload: it boots on one CPU, and the worker isolates the
 * next load.
 */
function registerIsolation(): void {
  if (!('serviceWorker' in navigator) || !('credentialless' in HTMLIFrameElement.prototype))
    return
  const base = import.meta.env.BASE_URL
  void navigator.serviceWorker.register(`${base}coi-sw.js`, { scope: base }).catch(() => {})
}
