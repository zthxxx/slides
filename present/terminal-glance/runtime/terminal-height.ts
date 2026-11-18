import { shallowReactive } from 'vue'

/** The part of the Web Storage API the store uses; `localStorage` in the page. */
export type HeightStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface HeightBounds {
  /** About ten rows plus the title bar. */
  min: number
  /** The room the slide has left for this terminal. */
  max: number
}

/** Within the bounds; when the slide has less room than the minimum, the room wins, so nothing overflows the slide. */
export function clampHeight(height: number, { min, max }: HeightBounds): number {
  return Math.min(Math.max(height, min), max)
}

/** Heights a presenter dragged terminals to, in slide pixels (independent of the window size), by session key. */
export interface TerminalHeights {
  get: (key: string) => number | undefined
  /** `undefined` returns the terminal to the slide's layout. */
  set: (key: string, height: number | undefined) => void
  /** Re-read the storage, after another window of the deck changed it. */
  reload: () => void
}

export const HEIGHTS_STORAGE_KEY = 'terminal-glance:terminal-heights'

/**
 * A reactive map of terminal heights kept in `storage` as one JSON object. Storage that is missing, throws or holds
 * something else leaves the map in memory only: a height then lasts until the page reloads.
 */
export function createTerminalHeights(storage: () => HeightStorage | undefined): TerminalHeights {
  const heights = shallowReactive(new Map<string, number>())

  function read(): Map<string, number> {
    try {
      return parseHeights(storage()?.getItem(HEIGHTS_STORAGE_KEY) ?? null)
    }
    catch {
      return new Map()
    }
  }

  function reload(): void {
    const stored = read()
    for (const key of heights.keys()) {
      if (!stored.has(key))
        heights.delete(key)
    }
    for (const [key, height] of stored)
      heights.set(key, height)
  }

  reload()
  return {
    get: key => heights.get(key),
    set(key, height) {
      if (height === undefined || !isHeight(height))
        heights.delete(key)
      else
        heights.set(key, height)
      try {
        storage()?.setItem(HEIGHTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(heights)))
      }
      catch {}
    },
    reload,
  }
}

function parseHeights(raw: string | null): Map<string, number> {
  let value: unknown
  try {
    value = JSON.parse(raw ?? '{}')
  }
  catch {
    return new Map()
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return new Map()
  return new Map(Object.entries(value).filter((entry): entry is [string, number] => isHeight(entry[1])))
}

function isHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function pageStorage(): HeightStorage | undefined {
  try {
    return globalThis.localStorage
  }
  catch {
    return undefined
  }
}

/** The page's terminal heights; the presenter window follows the slide window through storage events. */
export const terminalHeights = createTerminalHeights(pageStorage)

function syncHeights(event: StorageEvent): void {
  if (event.key === HEIGHTS_STORAGE_KEY || event.key === null)
    terminalHeights.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', syncHeights)
  import.meta.hot?.dispose(() => window.removeEventListener('storage', syncHeights))
}
