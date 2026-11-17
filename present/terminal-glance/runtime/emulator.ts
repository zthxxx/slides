import { FitAddon, init, Terminal } from 'ghostty-web'

/**
 * The terminal emulator a shell session renders into: ghostty-web, Ghostty's VT parser compiled to WebAssembly
 * behind an xterm.js-shaped API, drawing on a canvas.
 * Source: ghostty-web@0.4.0 `dist/index.d.ts` and `dist/ghostty-web.js`.
 *
 * Behaviors this deck relies on, all ghostty-web's own:
 * - a mouse selection is copied to the clipboard when the button is released, a double click selects and copies a word;
 * - URLs and OSC 8 hyperlinks are underlined on hover and open in a new tab on Cmd-click (macOS) or Ctrl-click,
 *   as in Ghostty;
 * - replies to terminal queries such as the cursor position report (`\e[6n`) are sent back through `onData`.
 *
 * The queries ghostty-web 0.4.0 leaves unanswered and the shell asks at start-up are answered here (`QueryResponder`).
 */
export interface TerminalEmulator {
  /** Grid size; 80×24 until the first fit. */
  readonly cols: number
  readonly rows: number
  readonly opened: boolean
  /** Render into `host`, which the emulator then owns (it becomes the focusable, contenteditable input element). */
  open: (host: HTMLElement) => Promise<void>
  /** Resolves once the data is parsed; data written before open() is queued and parsed when it opens. */
  write: (data: Uint8Array | string) => Promise<void>
  /** Keyboard input, pastes and replies to terminal queries, to send to the pty. */
  onData: (listener: (data: string) => void) => void
  onResize: (listener: (size: { cols: number, rows: number }) => void) => void
  /** Fit the grid to the host's container; a hidden container is left alone. */
  fit: () => void
  focus: () => void
  blur: () => void
}

const FONT_FAMILY = '"Fira Code", Menlo, Monaco, Consolas, monospace'
/** In slide pixels (the 1580 px wide canvas of the eloc theme). */
const FONT_SIZE = 18

const THEME = {
  background: '#272936',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
}

let loading: Promise<void> | undefined

/** ghostty-web's WebAssembly module, inlined in its bundle, loaded once per page. */
function loadGhostty(): Promise<void> {
  loading ??= init()
  return loading
}

export function createEmulator(): TerminalEmulator {
  return new GhosttyEmulator()
}

class GhosttyEmulator implements TerminalEmulator {
  #terminal: Terminal | undefined
  #fitAddon = new FitAddon()
  #host: HTMLElement | undefined
  #scale = 1
  #pending: Array<Uint8Array | string> = []
  #queries = new QueryResponder(reply => this.#dataListeners.forEach(listener => listener(reply)))
  #dataListeners: Array<(data: string) => void> = []
  #resizeListeners: Array<(size: { cols: number, rows: number }) => void> = []

  get cols(): number {
    return this.#terminal?.cols ?? 80
  }

  get rows(): number {
    return this.#terminal?.rows ?? 24
  }

  get opened(): boolean {
    return this.#terminal !== undefined
  }

  async open(host: HTMLElement): Promise<void> {
    // The renderer measures its cell size from the font when it opens.
    await Promise.all([
      loadGhostty(),
      document.fonts.load(`${FONT_SIZE}px "Fira Code"`).catch(() => {}),
    ])
    this.#host = host
    this.#scale = slideScale(host)
    applyCounterScale(host, this.#scale)

    const terminal = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: FONT_SIZE * this.#scale,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME,
    })
    terminal.loadAddon(this.#fitAddon)
    terminal.onData(data => this.#dataListeners.forEach(listener => listener(data)))
    terminal.onResize(size => this.#resizeListeners.forEach(listener => listener(size)))
    terminal.open(host)
    this.#terminal = terminal
    // Focus sits on the host, a contenteditable div, which Slidev does not count as typing, and ghostty-web
    // stops only the keys it encodes itself: without this, a space typed into the shell also turns the slide.
    host.addEventListener('keydown', event => event.stopPropagation())

    for (const data of this.#pending.splice(0))
      terminal.write(data)
    // The slide's scale follows the window size, which resizes no element inside the slide. Slidev derives it
    // from a ResizeObserver and applies it a frame or two after the resize event, so measure once resizing settles.
    let settle: ReturnType<typeof setTimeout> | undefined
    window.addEventListener('resize', () => {
      clearTimeout(settle)
      settle = setTimeout(() => this.fit(), 150)
    })
  }

  async write(data: Uint8Array | string): Promise<void> {
    this.#queries.scan(data)
    // Parsing is synchronous; ghostty-web's write callback would wait for the next animation frame and cap a flood at one chunk per frame.
    if (this.#terminal)
      this.#terminal.write(data)
    else
      this.#pending.push(data)
  }

  onData(listener: (data: string) => void): void {
    this.#dataListeners.push(listener)
  }

  onResize(listener: (size: { cols: number, rows: number }) => void): void {
    this.#resizeListeners.push(listener)
  }

  fit(): void {
    const host = this.#host
    const terminal = this.#terminal
    if (!host || !terminal || !host.parentElement?.offsetWidth)
      return

    const scale = slideScale(host)
    if (scale !== this.#scale) {
      this.#scale = scale
      applyCounterScale(host, scale)
      terminal.options.fontSize = FONT_SIZE * scale
    }
    this.#fitAddon.fit()
  }

  focus(): void {
    this.#terminal?.focus()
  }

  blur(): void {
    this.#terminal?.blur()
  }
}

/**
 * Slidev fits the slide to the window with `transform: scale()`. ghostty-web maps pointer positions with
 * getBoundingClientRect() (scaled) against its cell size (unscaled), so under a scale its link hit-testing lands on
 * the wrong cells, and its canvas is drawn at the unscaled size and blurs when enlarged.
 * The host is therefore scaled back by the inverse, enlarged by the same factor, with the font enlarged to match:
 * the emulator then sits in an untransformed coordinate space at the real screen size.
 */
function slideScale(host: HTMLElement): number {
  const container = host.parentElement
  if (!container?.offsetWidth)
    return 1
  return Math.round(container.getBoundingClientRect().width / container.offsetWidth * 1000) / 1000
}

function applyCounterScale(host: HTMLElement, scale: number): void {
  host.style.width = `${scale * 100}%`
  host.style.height = `${scale * 100}%`
  host.style.transform = scale === 1 ? '' : `scale(${1 / scale})`
  host.style.transformOrigin = '0 0'
}

/**
 * Answers the color and device-attribute queries ghostty-web 0.4.0 ignores, as xterm and Ghostty do.
 * jovial (the zsh theme) sends `ESC ] 11 ; ? ST` then `ESC [ c` when it loads, to pick its dark or light palette;
 * the DA1 reply marks the end of the answers, so without both the first prompt waits out jovial's timeout.
 * Refs: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html (OSC 10/11, DA1),
 * jovial `jovial.zsh-theme` (`@jov.theme-query-send`).
 */
class QueryResponder {
  #tail = ''
  readonly #reply: (data: string) => void

  constructor(reply: (data: string) => void) {
    this.#reply = reply
  }

  scan(data: Uint8Array | string): void {
    const hasEscape = typeof data === 'string' ? data.includes('\x1B') : data.includes(0x1B)
    if (!this.#tail && !hasEscape)
      return

    const text = this.#tail + (typeof data === 'string' ? data : BYTES_AS_TEXT.decode(data))
    let answered = 0
    for (const match of text.matchAll(QUERY)) {
      this.#reply(answer(match))
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

function answer([, osc, terminator]: RegExpMatchArray): string {
  if (!osc)
    return '\x1B[?62;22c' // Ghostty's own DA1: VT220 with ANSI color.
  const color = osc === '10' ? THEME.foreground : THEME.background
  return `\x1B]${osc};${xtermColor(color)}${terminator}`
}

/** `#272936` → `rgb:2727/2929/3636`, the 16-bit-per-channel form xterm replies with. */
function xtermColor(hex: string): string {
  const channels = hex.slice(1).match(/../g) ?? []
  return `rgb:${channels.map(channel => channel.repeat(2)).join('/')}`
}
