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


// https://github.com/slidevjs/slidev/blob/v51.1.1/packages/client/composables/useDrawings.ts#L23
const drawingEnabled = useLocalStorage('slidev-drawing-enabled', false)

// https://github.com/slidevjs/slidev/blob/v51.1.1/packages/client/state/storage.ts#L9
// TODO import showOverview
const showOverview = useLocalStorage('slidev-show-overview', false)

// https://github.com/slidevjs/slidev/blob/v51.1.1/packages/client/state/storage.ts#L41
const showEditor = useLocalStorage('slidev-show-editor', false)

const magicKeys = useMagicKeys()


export default defineShortcutsSetup((nav: NavOperations, base: ShortcutOptions[]) => {
  const { escape, tab, home, end, pageup, pagedown } = magicKeys

  return [
    /**
     * default shortcuts
     * https://github.com/slidevjs/slidev/blob/v51.1.1/packages/client/setup/shortcuts.ts#L34
     */
    ...base,

    { name: 'goHome', key: and(home, not(showOverview)), fn: nav.goFirst },
    { name: 'goEnd', key: and(end, not(showOverview)), fn: nav.goLast },

    // NOT WORK with `showOverview` or `drawingEnabled` by trigger key escape
    // {
    //   name: 'showEditor',
    //   key: and(
    //     tab,
    //     not(showOverview),
    //     not(drawingEnabled),
    //   ),
    //   fn: () => showEditor.value = true,
    // },
    // {
    //   name: 'closeEditor',
    //   key: and(escape, showEditor),
    //   fn: () => showEditor.value = false,
    // },
  ]
})
