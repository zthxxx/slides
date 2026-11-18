import type { HeightStorage } from '../runtime/terminal-height'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { clampHeight, createTerminalHeights, HEIGHTS_STORAGE_KEY } from '../runtime/terminal-height'

/** The page's localStorage: strings by key. */
class MemoryStorage implements HeightStorage {
  readonly items = new Map<string, string>()
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

/** Storage the browser refuses, as in a private window or with site data blocked. */
const refusing: HeightStorage = {
  getItem: () => { throw new DOMException('denied', 'SecurityError') },
  setItem: () => { throw new DOMException('denied', 'SecurityError') },
}

const sessionKey = fc.tuple(fc.integer({ min: 1, max: 60 }), fc.constantFrom('a', 'b', 'c')).map(([page, name]) => `${page}/${name}`)
const height = fc.double({ min: 1, max: 2000, noNaN: true })
const drag = fc.tuple(sessionKey, fc.option(height, { nil: undefined }))

describe('terminal heights', () => {
  test('a dragged height stays inside the bounds, and the slide\'s room wins over the minimum', () => {
    fc.assert(fc.property(height, height, height, (wanted, min, max) => {
      const result = clampHeight(wanted, { min, max })
      expect(result).toBeLessThanOrEqual(max)
      if (min <= max) {
        expect(result).toBeGreaterThanOrEqual(min)
        if (wanted >= min && wanted <= max)
          expect(result).toBe(wanted)
      }
    }))
  })

  test('every terminal keeps its last height after a reload, and a reset one returns to the layout', () => {
    fc.assert(fc.property(fc.array(drag, { maxLength: 30 }), (drags) => {
      const storage = new MemoryStorage()
      const before = createTerminalHeights(() => storage)
      const expected = new Map<string, number>()
      for (const [key, value] of drags) {
        before.set(key, value)
        if (value === undefined)
          expected.delete(key)
        else
          expected.set(key, value)
      }
      const reloaded = createTerminalHeights(() => storage)
      for (const [key] of drags)
        expect(reloaded.get(key)).toBe(expected.get(key))
    }))
  })

  test('whatever the storage holds, only positive finite heights are read back', () => {
    const json = fc.jsonValue().map(value => JSON.stringify(value))
    fc.assert(fc.property(fc.oneof(fc.string(), json, fc.dictionary(fc.string(), fc.jsonValue()).map(value => JSON.stringify(value))), (raw) => {
      const storage = new MemoryStorage()
      storage.setItem(HEIGHTS_STORAGE_KEY, raw)
      const heights = createTerminalHeights(() => storage)
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      }
      catch {}
      const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : []
      for (const key of keys) {
        const value = heights.get(key)
        if (value !== undefined)
          expect(Number.isFinite(value) && value > 0).toBe(true)
      }
    }))
  })

  test('without usable storage, heights still apply until the page reloads', () => {
    fc.assert(fc.property(fc.array(drag, { maxLength: 20 }), fc.constantFrom<(() => HeightStorage | undefined)>(() => refusing, () => undefined), (drags, storage) => {
      const heights = createTerminalHeights(storage)
      const expected = new Map<string, number>()
      for (const [key, value] of drags) {
        heights.set(key, value)
        if (value === undefined)
          expected.delete(key)
        else
          expected.set(key, value)
      }
      for (const [key] of drags)
        expect(heights.get(key)).toBe(expected.get(key))
    }))
  })

  test('another window\'s change is picked up on reload', () => {
    fc.assert(fc.property(fc.array(drag, { maxLength: 20 }), (drags) => {
      const storage = new MemoryStorage()
      const slideWindow = createTerminalHeights(() => storage)
      const presenterWindow = createTerminalHeights(() => storage)
      for (const [key, value] of drags)
        slideWindow.set(key, value)
      presenterWindow.reload()
      for (const [key] of drags)
        expect(presenterWindow.get(key)).toBe(slideWindow.get(key))
    }))
  })
})
