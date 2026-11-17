import type { GhosttyTerminal } from 'ghostty-web'
import type { TerminalAppearance } from '../runtime/appearance'
import { expect, test } from 'bun:test'
import fc from 'fast-check'
import { Ghostty } from 'ghostty-web'
import { TERMINAL_THEMES } from '../runtime/appearance'
import { themedGhostty } from '../runtime/palette'

const rgb = (color: string) => [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16))
const colors = (cell: NonNullable<ReturnType<GhosttyTerminal['getLine']>>[number]) => ({
  fg: [cell.fg_r, cell.fg_g, cell.fg_b], bg: [cell.bg_r, cell.bg_g, cell.bg_b],
})

test('palette switches preserve screen, indexed colors and truecolor through resize and alternate screen', async () => {
  await fc.assert(fc.asyncProperty(
    fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })),
    fc.integer({ min: 0, max: 15 }),
    fc.integer({ min: 8, max: 100 }), fc.integer({ min: 4, max: 32 }),
    fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
    async (color, colorIndex, cols, rows, switches) => {
      const ghostty = await Ghostty.load()
      let mode: TerminalAppearance = 'dark'
      const parser = themedGhostty(ghostty, () => mode).createTerminal(80, 24, { scrollbackLimit: 50 })
      try {
        parser.write(`\x1b[0mD\x1b[31mR\x1b[38;2;${color.join(';')}mT\x1b[${colorIndex < 8 ? 30 + colorIndex : 90 + colorIndex - 8}mI\x1b[0m`)
        parser.resize(cols, rows)
        parser.write('\x1b[?1049h\x1b[H\x1b[0mA\x1b[31mB')
        for (const light of switches) {
          mode = light ? 'light' : 'dark'
          expect(parser.isAlternateScreen()).toBe(true)
          expect(parser.getDimensions()).toEqual({ cols, rows })
          const line = parser.getLine(0)!
          expect(line.slice(0, 2).map(cell => cell.codepoint)).toEqual([65, 66])
          expect(colors(line[0])).toEqual({ fg: rgb(TERMINAL_THEMES[mode].foreground), bg: rgb(TERMINAL_THEMES[mode].background) })
          expect(colors(line[1]).fg).toEqual(rgb(TERMINAL_THEMES[mode].red))
        }
        parser.write('\x1b[?1049l')
        for (const next of ['dark', 'light'] as const) {
          mode = next
          const line = parser.getLine(0)!
          expect(line.slice(0, 4).map(cell => cell.codepoint)).toEqual([68, 82, 84, 73])
          expect(colors(line[0])).toEqual({ fg: rgb(TERMINAL_THEMES[mode].foreground), bg: rgb(TERMINAL_THEMES[mode].background) })
          expect(colors(line[1]).fg).toEqual(rgb(TERMINAL_THEMES[mode].red))
          expect(colors(line[2]).fg).toEqual(color)
          const theme = TERMINAL_THEMES[mode]
          const ansi = [theme.black, theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan, theme.white,
            theme.brightBlack, theme.brightRed, theme.brightGreen, theme.brightYellow, theme.brightBlue, theme.brightMagenta, theme.brightCyan, theme.brightWhite]
          expect(colors(line[3]).fg).toEqual(rgb(ansi[colorIndex]))
        }
      }
      finally { parser.free() }
    },
  ), { numRuns: 40 })
})

test('only the active parser replies and switching does not release shadow replies', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }), async switches => {
    const ghostty = await Ghostty.load()
    let mode: TerminalAppearance = 'dark'
    const parser = themedGhostty(ghostty, () => mode).createTerminal(80, 24)
    try {
      for (const light of switches) {
        mode = light ? 'light' : 'dark'
        expect(Boolean(parser.hasResponse())).toBe(false)
        parser.write('\x1b[6n')
        expect(parser.readResponse()).toBe('\x1b[1;1R')
        expect(Boolean(parser.hasResponse())).toBe(false)
        mode = light ? 'dark' : 'light'
        expect(Boolean(parser.hasResponse())).toBe(false)
      }
    }
    finally { parser.free() }
  }), { numRuns: 40 })
})
