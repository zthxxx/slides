import { and, not } from '@vueuse/math'
import {
  useMagicKeys,
  useLocalStorage,
} from '@vueuse/core'
import {
  defineShortcutsSetup,
} from '@slidev/types'
import type {
  NavOperations,
  ShortcutOptions,
} from '@slidev/types'


// https://github.com/slidevjs/slidev/blob/v0.49.29/packages/client/composables/useDrawings.ts#L23
const drawingEnabled = useLocalStorage('slidev-drawing-enabled', false)

// https://github.com/slidevjs/slidev/blob/v0.49.29/packages/client/state/index.ts#L9
const showOverview = useLocalStorage('slidev-show-overview', false)
// https://github.com/slidevjs/slidev/blob/v0.49.29/packages/client/state/index.ts#31
const showEditor = useLocalStorage('slidev-show-editor', false)

const magicKeys = useMagicKeys()


export default defineShortcutsSetup((nav: NavOperations, base: ShortcutOptions[]) => {
  const { escape, tab, home, end, pageup, pagedown } = magicKeys

  return [
    ...base,

    // { name: 'prev_page_key', key: and(pageup, not(showOverview)), fn: nav.prev, autoRepeat: true },
    // { name: 'next_page_key', key: and(pagedown, not(showOverview)), fn: nav.next, autoRepeat: true },

    { name: 'goHome', key: and(home, not(showOverview)), fn: nav.goFirst },
    { name: 'goEnd', key: and(end, not(showOverview)), fn: nav.goLast },

    // NOT WORK with `showOverview` or `drawingEnabled` by trigger key escape
    {
      name: 'showEditor',
      key: and(
        tab,
        not(showOverview),
        not(drawingEnabled),
      ),
      fn: () => showEditor.value = true,
    },
    {
      name: 'closeEditor',
      key: and(escape, showEditor),
      fn: () => showEditor.value = false,
    },
  ]
})
