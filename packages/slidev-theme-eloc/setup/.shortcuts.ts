import {
  and,
  not,
  useToggle,
} from '@vueuse/core'
import {
  magicKeys,
  showEditor,
  showOverview,
} from '@slidev/client/state'
import {
  drawingEnabled,
} from '@slidev/client/logic/drawings'
import { defineShortcutsSetup, NavOperations } from '@slidev/types'

const toggleEditor = useToggle(showEditor)

/**
 * NOT WORK with `showOverview` or `drawingEnabled`,
 *
 * due to @slidev/cli running with bundled @slidev/client,
 * so that the import are two instance.
 */
export default defineShortcutsSetup((nav: NavOperations) => {
  const { escape, home, end, pageup, pagedown } = magicKeys

  return [
    { key: and(home, not(showOverview)), fn: nav.goFirst },
    { key: and(end, not(showOverview)), fn: nav.goLast },
    { key: and(pageup, not(showOverview)), fn: nav.prevSlide, autoRepeat: true },
    { key: and(pagedown, not(showOverview)), fn: nav.nextSlide, autoRepeat: true },
    {
      key: and(
        escape,
        not(showOverview),
        not(drawingEnabled),
      ),
      fn: toggleEditor,
    },
  ]
})
