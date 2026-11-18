import { defineAppSetup } from '@slidev/types'
import { prefetchLinux } from '../runtime/kernel'

/**
 * Starts Linux's downloads as soon as the app runs. The first terminal would start them only when it mounts, which
 * for a demo past the opening slide is when Slidev pre-mounts the other slides, about 3 s after the deck renders.
 * Only the audience window (the `play` route outside print mode, where `Terminal.vue` runs Linux) prefetches:
 * another window would compile a kernel it never boots.
 */
export default defineAppSetup(({ router }) => {
  void router.isReady().then(() => {
    if (router.currentRoute.value.name === 'play' && !new URLSearchParams(location.search).has('print'))
      prefetchLinux()
  })
})
