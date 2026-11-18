import type { MouseAction, MouseProtocol, MouseReport } from '../runtime/mouse'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { encodeMouse, MOUSE_MODES, mouseProtocol } from '../runtime/mouse'

const button = fc.constantFrom(0 as const, 1 as const, 2 as const)
const action: fc.Arbitrary<MouseAction> = fc.oneof(
  fc.record({ kind: fc.constantFrom('press' as const, 'release' as const), button }),
  fc.record({ kind: fc.constant('move' as const), button: fc.option(button, { nil: undefined }) }),
  fc.record({ kind: fc.constant('wheel' as const), direction: fc.constantFrom('up' as const, 'down' as const) }),
)
const report = (maxCell: number): fc.Arbitrary<MouseReport> => fc.record({
  action,
  col: fc.nat(maxCell),
  row: fc.nat(maxCell),
  shift: fc.boolean(),
  alt: fc.boolean(),
  ctrl: fc.boolean(),
})
const protocol: fc.Arbitrary<MouseProtocol> = fc.record({
  tracking: fc.constantFrom('x10' as const, 'normal' as const, 'button' as const, 'any' as const),
  encoding: fc.constantFrom('default' as const, 'sgr' as const),
})

/** Reads a report back the way a program does (xterm ctlseqs, "Mouse Tracking"). */
function decode(bytes: Uint8Array, encoding: MouseProtocol['encoding']) {
  const text = String.fromCharCode(...bytes)
  if (encoding === 'sgr') {
    const match = /^\x1B\[<(\d+);(\d+);(\d+)([Mm])$/.exec(text)
    if (!match)
      throw new Error(`not an SGR report: ${JSON.stringify(text)}`)
    return { code: Number(match[1]), x: Number(match[2]), y: Number(match[3]), release: match[4] === 'm' }
  }
  expect([...bytes.slice(0, 3)]).toEqual([0x1B, 0x5B, 0x4D])
  expect(bytes.length).toBe(6)
  return { code: bytes[3] - 32, x: bytes[4] - 32, y: bytes[5] - 32, release: undefined }
}

function reported(report: MouseReport, { tracking }: MouseProtocol): boolean {
  const { action } = report
  switch (tracking) {
    case 'x10': return action.kind === 'press' || action.kind === 'wheel'
    case 'normal': return action.kind !== 'move'
    case 'button': return action.kind !== 'move' || action.button !== undefined
    case 'any': return true
  }
}

describe('mouse reports', () => {
  test('report exactly the actions the tracking mode asks for, at the 1-based cell, with the button and modifiers', () => {
    fc.assert(fc.property(report(222), protocol, (input, mode) => {
      const bytes = encodeMouse(input, mode)
      expect(bytes !== undefined).toBe(reported(input, mode))
      if (!bytes)
        return

      const { code, x, y, release } = decode(bytes, mode.encoding)
      expect([x, y]).toEqual([input.col + 1, input.row + 1])
      const modifiers = code & 0b11100
      expect(modifiers).toBe(mode.tracking === 'x10' ? 0 : (input.shift ? 4 : 0) | (input.alt ? 8 : 0) | (input.ctrl ? 16 : 0))

      const { action } = input
      const base = code & ~0b11100
      if (action.kind === 'wheel')
        expect(base).toBe(action.direction === 'up' ? 64 : 65)
      if (action.kind === 'move')
        expect(base).toBe(32 + (action.button ?? 3))
      if (action.kind === 'press')
        expect(base).toBe(action.button)
      if (action.kind === 'release')
        // The default encoding has no way to say which button went up.
        expect(base).toBe(mode.encoding === 'sgr' ? action.button : 3)
      if (mode.encoding === 'sgr')
        expect(release).toBe(action.kind === 'release')
    }))
  })

  test('the default encoding drops cells beyond its one-byte range; SGR reports any cell', () => {
    fc.assert(fc.property(report(2000), protocol, (input, mode) => {
      const bytes = encodeMouse(input, mode)
      if (!reported(input, mode))
        return expect(bytes).toBeUndefined()
      const fits = input.col + 1 <= 223 && input.row + 1 <= 223
      expect(bytes !== undefined).toBe(mode.encoding === 'sgr' || fits)
      // Every byte is one the pty passes through unchanged: no UTF-8 multi-byte sequences are produced.
      if (bytes && mode.encoding === 'sgr')
        expect([...bytes].every(byte => byte < 0x80)).toBe(true)
    }))
  })

  test('the protocol follows the DEC modes the program set', () => {
    const modes = fc.subarray<number>(Object.values(MOUSE_MODES))
    fc.assert(fc.property(modes, (set) => {
      const protocol = mouseProtocol(mode => set.includes(mode))
      const tracking = set.filter(mode => mode !== MOUSE_MODES.sgr)
      if (tracking.length === 0)
        return expect(protocol).toBeUndefined()
      expect<number>(MOUSE_MODES[protocol!.tracking]).toBe(Math.max(...tracking))
      expect(protocol!.encoding).toBe(set.includes(MOUSE_MODES.sgr) ? 'sgr' : 'default')
    }))
  })
})
