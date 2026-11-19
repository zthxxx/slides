/** The terminal's default colors, as `#rrggbb`, that the color queries report. */
export interface QueriedColors {
  foreground: string
  background: string
}

/**
 * Answers the color and device-attribute queries ghostty-web 0.4.0 ignores, as xterm and Ghostty do.
 * jovial (the zsh theme) sends `ESC ] 11 ; ? ST` then `ESC [ c` when it loads, to pick its dark or light palette;
 * the DA1 reply marks the end of the answers, so without both the first prompt waits out jovial's timeout.
 * Refs: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html (OSC 10/11, DA1),
 * jovial `jovial.zsh-theme` (`@jov.theme-query-send`).
 */
export class QueryResponder {
  #tail = ''
  readonly #reply: (data: string) => void
  readonly #colors: () => QueriedColors

  /** `colors` is read when a query arrives, so the answer follows the terminal's current appearance. */
  constructor(reply: (data: string) => void, colors: () => QueriedColors) {
    this.#reply = reply
    this.#colors = colors
  }

  scan(data: Uint8Array | string): void {
    const hasEscape = typeof data === 'string' ? data.includes('\x1B') : data.includes(0x1B)
    if (!this.#tail && !hasEscape)
      return

    const text = this.#tail + (typeof data === 'string' ? data : BYTES_AS_TEXT.decode(data))
    let answered = 0
    for (const match of text.matchAll(QUERY)) {
      this.#reply(answer(match, this.#colors()))
      answered = match.index + match[0].length
    }
    // A query split across two writes is completed by the next one.
    this.#tail = ''
    for (let start = Math.max(answered, text.length - QUERY_MAX_LENGTH); start < text.length; start++) {
      const rest = text.slice(start)
      if (rest[0] === '\x1B' && QUERIES.some(query => query.startsWith(rest))) {
        this.#tail = rest
        break
      }
    }
  }
}

/** One character per byte: the queries are ASCII, and offsets must match the bytes. */
const BYTES_AS_TEXT = new TextDecoder('latin1')

/** `ESC ] 10|11 ; ? BEL|ST` (foreground / background color) and `ESC [ c` / `ESC [ 0 c` (primary device attributes). */
const QUERY = /\x1B\](1[01]);\?(\x07|\x1B\\)|\x1B\[0?c/g
const QUERIES = ['\x1B]10;?\x07', '\x1B]10;?\x1B\\', '\x1B]11;?\x07', '\x1B]11;?\x1B\\', '\x1B[c', '\x1B[0c']
const QUERY_MAX_LENGTH = Math.max(...QUERIES.map(query => query.length))

function answer([, osc, terminator]: RegExpMatchArray, colors: QueriedColors): string {
  if (!osc)
    return '\x1B[?62;22c' // Ghostty's own DA1: VT220 with ANSI color.
  const color = osc === '10' ? colors.foreground : colors.background
  return `\x1B]${osc};${xtermColor(color)}${terminator}`
}

/** `#272936` → `rgb:2727/2929/3636`, the 16-bit-per-channel form xterm replies with. */
function xtermColor(hex: string): string {
  const channels = hex.slice(1).match(/../g) ?? []
  return `rgb:${channels.map(channel => channel.repeat(2)).join('/')}`
}
