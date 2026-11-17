import type { Ghostty, GhosttyTerminal } from 'ghostty-web'
import type { TerminalAppearance } from './appearance'
import { TERMINAL_THEMES } from './appearance'

const PALETTE_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const

const hex = (value: string) => Number.parseInt(value.slice(1), 16)

/**
 * ghostty-web@0.4.0 `dist/ghostty-web.js` (`Terminal.handleOptionChange`, `GhosttyTerminal`):
 * changing options.theme cannot update the WASM defaults/palette, and the WASM exports expose no color setter.
 * Two parsers consume the same stream with different startup palettes; choosing one preserves truecolor,
 * screen state and bounded scrollback without storing an unbounded output replay log.
 */
/**
 * ghostty-web@0.4.0 `dist/ghostty-web.js` resolves cell colors in its WASM parser; renderer.setTheme only changes
 * canvas colors. Its `dist/index.d.ts` GhosttyTerminal API supplies the synchronized writes, reads and responses here.
 */
export function themedGhostty(ghostty: Ghostty, appearance: () => TerminalAppearance): Ghostty {
  return new Proxy(ghostty, {
    get(target, key, receiver) {
      if (key !== 'createTerminal')
        return Reflect.get(target, key, receiver)
      return (cols?: number, rows?: number, config?: Parameters<Ghostty['createTerminal']>[2]) => {
        const parsers = Object.fromEntries((['dark', 'light'] as const).map(mode => {
          const theme = TERMINAL_THEMES[mode]
          return [mode, target.createTerminal(cols, rows, {
            ...config,
            fgColor: hex(theme.foreground), bgColor: hex(theme.background), cursorColor: hex(theme.cursor),
            palette: PALETTE_KEYS.map(key => hex(theme[key])),
          })]
        })) as Record<TerminalAppearance, GhosttyTerminal>

        return new Proxy(parsers.dark, {
          get(_, method) {
            if (method === 'write') {
              return (data: string | Uint8Array) => {
                parsers.dark.write(data)
                parsers.light.write(data)
                const inactive = parsers[appearance() === 'dark' ? 'light' : 'dark']
                // Only the displayed parser may answer the PTY; the shadow's response queue must stay bounded.
                while (inactive.hasResponse())
                  inactive.readResponse()
              }
            }
            if (method === 'resize')
              return (cols: number, rows: number) => Object.values(parsers).forEach(parser => parser.resize(cols, rows))
            if (method === 'free')
              return () => Object.values(parsers).forEach(parser => parser.free())
            const current = parsers[appearance()]
            const value = Reflect.get(current, method, current)
            return typeof value === 'function' ? value.bind(current) : value
          },
        })
      }
    },
  })
}
