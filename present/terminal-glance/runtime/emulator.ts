import type { ProgramStatus } from './program-status'
import { CanvasRenderer, FitAddon, Ghostty, Terminal } from 'ghostty-web'
import { watch } from 'vue'
import { terminalAppearance, TERMINAL_THEMES } from './appearance'
import { themedGhostty } from './palette'
import { ProgramStatusObserver } from './program-status'

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
  onProgramStatus: (listener: (status: ProgramStatus | undefined) => void) => void
  /** Fit the grid to the host's container; a hidden container is left alone. */
  fit: () => void
  focus: () => void
  blur: () => void
}

/** Served from public/fonts/hack-nerd-font-mono/ (see its README.md), declared in components/Terminal.vue. */
const FONT_NAME = 'Hack Nerd Font Mono'
const FONT_FAMILY = `"${FONT_NAME}", Menlo, monospace`
/** In slide pixels (the 1580 px wide canvas of the eloc theme); the exact size is fitted to whole-pixel cells. */
const FONT_SIZE = 18

let loading: Promise<Ghostty> | undefined

/** ghostty-web's WebAssembly module, inlined in its bundle, loaded once per page. */
function loadGhostty(): Promise<Ghostty> {
  loading ??= Ghostty.load()
  return loading
}

let fontLoading: Promise<void> | undefined

/** The terminal font's regular and bold faces (the prompt and the syntax highlighting use bold); the renderer measures it when it opens. */
function loadFont(): Promise<void> {
  fontLoading ??= Promise.all([
    document.fonts.load(`${FONT_SIZE}px "${FONT_NAME}"`),
    document.fonts.load(`bold ${FONT_SIZE}px "${FONT_NAME}"`),
  ]).then(() => {}, () => {})
  return fontLoading
}

/** The font's advance width per pixel of font size (0.602 for Hack); measured once the font is loaded. */
let advancePerPixel: number | undefined

function measureAdvance(fontSize: number): number {
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `${fontSize}px ${FONT_FAMILY}`
  return context.measureText('M').width
}

/**
 * The font size for a slide scale: as close to FONT_SIZE on screen as possible, adjusted so one character is a whole
 * number of pixels wide. Cells then sit on whole pixels, and box-drawing lines (`─`) join without gaps.
 */
function fontSizeFor(scale: number): number {
  advancePerPixel ??= measureAdvance(100) / 100
  const cellWidth = Math.max(1, Math.round(FONT_SIZE * scale * advancePerPixel))
  return cellWidth / advancePerPixel
}

interface CellMetrics {
  width: number
  height: number
  baseline: number
}

/**
 * Line height 1: a row is as tall as the font size, rounded to whole pixels. ghostty-web 0.4.0 has no line-height
 * option; its renderer derives the cell from the ink of "M" in `measureFont()`, which its constructor and every font
 * change call, so that method is replaced here for every renderer.
 *
 * Hack's line box (ascent 0.928 em + descent 0.236 em) is taller than 1 em. The baseline sits so that a glyph spanning
 * the whole line box (`│ ╭ ╰`, tmux borders) covers its own row from top to bottom: rows are repainted one at a time,
 * and each repaint fills its row's background over whatever a neighbor drew into it, so vertical strokes must not rely
 * on overlapping into the next row to join. Letters keep their ascenders inside the row; descenders may reach up to a
 * pixel into the row below.
 * Source: ghostty-web@0.4.0 `dist/ghostty-web.js` (`CanvasRenderer.measureFont`, `renderLine`).
 */
const rendererPrototype = CanvasRenderer.prototype as unknown as {
  measureFont: (this: { fontSize: number, fontFamily: string }) => CellMetrics
}
rendererPrototype.measureFont = function () {
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `${this.fontSize}px ${this.fontFamily}`
  const glyph = context.measureText('M')
  const height = Math.max(1, Math.round(this.fontSize))
  return {
    width: Math.max(1, Math.round(glyph.width)),
    height,
    baseline: Math.min(height, Math.ceil(height - glyph.fontBoundingBoxDescent)),
  }
}

export function createEmulator(): TerminalEmulator {
  return new GhosttyEmulator()
}

class GhosttyEmulator implements TerminalEmulator {
  #terminal: Terminal | undefined
  #fitAddon = new FitAddon()
  #host: HTMLElement | undefined
  #pending: Array<Uint8Array | string> = []
  #queries = new QueryResponder(reply => this.#dataListeners.forEach(listener => listener(reply)))
  #dataListeners: Array<(data: string) => void> = []
  #resizeListeners: Array<(size: { cols: number, rows: number }) => void> = []
  #programStatusListeners: Array<(status: ProgramStatus | undefined) => void> = []
  #programStatus = new ProgramStatusObserver({
    reply: reply => this.#dataListeners.forEach(listener => listener(reply)),
    onStatus: status => this.#programStatusListeners.forEach(listener => listener(status)),
  })

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
    const [ghostty] = await Promise.all([loadGhostty(), loadFont()])
    this.#host = host
    const scale = slideScale(host)
    applyCounterScale(host, scale)

    const terminal = new Terminal({
      ghostty: themedGhostty(ghostty, () => terminalAppearance.value),
      fontFamily: FONT_FAMILY,
      fontSize: fontSizeFor(scale),
      cursorBlink: true,
      scrollback: 5000,
      theme: TERMINAL_THEMES[terminalAppearance.value],
    })
    terminal.loadAddon(this.#fitAddon)
    terminal.onData(data => this.#dataListeners.forEach(listener => listener(data)))
    terminal.onResize(size => this.#resizeListeners.forEach(listener => listener(size)))
    terminal.open(host)
    // ghostty-web 0.4.0's canvas is still resampled by Slidev's transform chain after scale cancellation.
    host.querySelector('canvas')!.style.imageRendering = 'pixelated'
    this.#terminal = terminal
    watch(terminalAppearance, mode => {
      // ghostty-web@0.4.0 `dist/ghostty-web.js`: options.theme only warns; setTheme updates the canvas renderer.
      terminal.renderer!.setTheme(TERMINAL_THEMES[mode])
      const view = terminal as unknown as {
        wasmTerm: Parameters<CanvasRenderer['render']>[0]
        viewportY: number
      }
      terminal.renderer!.render(view.wasmTerm, true, view.viewportY, terminal)
    }, { flush: 'sync' })
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
    // A slide transition moves the terminal after it was fitted; align it again where it comes to rest.
    for (const type of ['transitionend', 'animationend'])
      document.addEventListener(type, () => this.#alignToDevicePixels(), { capture: true, passive: true })
    this.#watchDevicePixelRatio()
  }

  async write(data: Uint8Array | string): Promise<void> {
    this.#programStatus.scan(data)
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

  onProgramStatus(listener: (status: ProgramStatus | undefined) => void): void {
    this.#programStatusListeners.push(listener)
  }

  fit(): void {
    const host = this.#host
    const terminal = this.#terminal
    if (!host || !terminal || !host.parentElement?.offsetWidth)
      return

    const scale = slideScale(host)
    // A new font size makes ghostty-web clear the selection and redraw: set it only when the cell width changes.
    const fontSize = fontSizeFor(scale)
    if (fontSize !== terminal.options.fontSize)
      terminal.options.fontSize = fontSize
    applyCounterScale(host, scale)
    this.#fitAddon.fit()
    this.#alignToDevicePixels()
  }

  /**
   * Make the canvas map 1:1 onto device pixels: the counter-scale must cancel the slide's scale exactly (a residual
   * like 0.9999 resamples every pixel), and the canvas origin must sit on a whole device pixel.
   */
  #alignToDevicePixels(): void {
    const host = this.#host
    const canvas = host?.querySelector('canvas')
    if (!host || !canvas?.offsetWidth)
      return

    canvas.style.transform = ''
    // The computed transforms the scale is read from are serialized with 6 significant digits; the canvas's
    // on-screen width against its CSS width gives the residual exactly.
    const residual = canvas.getBoundingClientRect().width / canvas.offsetWidth
    if (Number.isFinite(residual) && Math.abs(residual - 1) > 1e-7)
      applyCounterScale(host, slideScale(host) * residual)

    const ratio = window.devicePixelRatio || 1
    const { left, top } = canvas.getBoundingClientRect()
    const dx = (Math.round(left * ratio) - left * ratio) / ratio
    const dy = (Math.round(top * ratio) - top * ratio) / ratio
    // Under the counter-scale the canvas is in screen pixels, so this shift is in screen pixels too.
    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4)
      canvas.style.transform = `translate(${dx}px, ${dy}px)`
  }

  /**
   * ghostty-web reads devicePixelRatio once, when its renderer is created. Moving the window to another display or
   * zooming the page changes it; its render loop resizes the canvas backing store once the renderer's value differs.
   */
  #watchDevicePixelRatio(): void {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    query.addEventListener('change', () => {
      const renderer = this.#terminal?.renderer as unknown as { devicePixelRatio: number } | undefined
      if (renderer)
        renderer.devicePixelRatio = window.devicePixelRatio
      this.fit()
      this.#watchDevicePixelRatio()
    }, { once: true })
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
 *
 * The scale is the product of the ancestors' computed transforms: a ratio of rendered to layout width
 * (offsetWidth is rounded to whole pixels) is off by up to 0.1 %, which the canvas then shows resampled.
 */
function slideScale(host: HTMLElement): number {
  let scale = 1
  for (let node = host.parentElement; node; node = node.parentElement) {
    const transform = getComputedStyle(node).transform
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(transform)
      scale *= Math.hypot(matrix.a, matrix.b)
    }
  }
  return scale
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
  const theme = TERMINAL_THEMES[terminalAppearance.value]
  const color = osc === '10' ? theme.foreground : theme.background
  return `\x1B]${osc};${xtermColor(color)}${terminator}`
}

/** `#272936` → `rgb:2727/2929/3636`, the 16-bit-per-channel form xterm replies with. */
function xtermColor(hex: string): string {
  const channels = hex.slice(1).match(/../g) ?? []
  return `rgb:${channels.map(channel => channel.repeat(2)).join('/')}`
}
