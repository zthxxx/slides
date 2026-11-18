import type { Terminal } from 'ghostty-web'
import type { CellBox, EraseRegion, KittyCommand, LayoutRequest, PixelSize } from './graphics'
import { cursorPast, decodeBase64, GraphicsStream, imageSize, KittyAssembler, layoutCells, parseLength } from './graphics'

/**
 * Draws iTerm2 and kitty inline images over ghostty-web's canvas.
 *
 * `write()` replaces `terminal.write()`: the output goes through `GraphicsStream`, text reaches ghostty-web unchanged,
 * and each image is placed at the cursor, its rows reserved by moving the cursor past it (kitty's rule, used for both
 * protocols), and drawn as an element over its cells. An image is anchored to its row in the buffer (scrollback
 * length + cursor row when placed), so it scrolls with the text around it.
 *
 * Supported: iTerm2 `File=` with `inline=1` and `width` / `height` in cells, `px`, `%` or `auto`,
 * `preserveAspectRatio`, any format the browser decodes; kitty direct transmission (`t=d`) of PNG (`f=100`) and raw
 * RGB / RGBA (`f=24` / `f=32`), chunked with `m`, actions `T` (transmit and display), `t` + `p` (store by id, place),
 * `d` (delete all or by id) and `q` (query), with `c` / `r` / `C` / `q`.
 * Not supported: kitty compression (`o=z`), files and shared memory (`t=f|t|s`), source rectangles and pixel offsets,
 * z-index under text, animation, Unicode placeholders; iTerm2 multipart transfers. Images do not follow text reflow
 * when the terminal is resized, nor scrolling inside scroll regions; once the scrollback is full (5000 lines),
 * older images drift.
 */
export class GraphicsOverlay {
  readonly #terminal: Terminal
  readonly #reply: (data: string) => void
  readonly #layer: HTMLDivElement
  readonly #stream = new GraphicsStream()
  readonly #kitty = new KittyAssembler()
  readonly #stored = new Map<number, StoredImage>()
  #placements: Placement[] = []
  #frame: number | undefined
  #lastLayout = ''

  constructor(terminal: Terminal, host: HTMLElement, reply: (data: string) => void) {
    this.#terminal = terminal
    this.#reply = reply
    if (getComputedStyle(host).position === 'static')
      host.style.position = 'relative'
    this.#layer = document.createElement('div')
    this.#layer.className = 'terminal-graphics'
    this.#layer.setAttribute('contenteditable', 'false')
    this.#layer.setAttribute('aria-hidden', 'true')
    Object.assign(this.#layer.style, {
      position: 'absolute',
      overflow: 'hidden',
      pointerEvents: 'none',
      transformOrigin: '0 0',
    })
    host.append(this.#layer)
  }

  /** Writes `data` to the terminal, taking image sequences out and drawing them. */
  write(data: Uint8Array | string): void {
    for (const event of this.#stream.push(data)) {
      if (event.kind === 'text')
        this.#terminal.write(event.data)
      else if (event.kind === 'erase')
        this.#erase(event.region, event.data)
      else if (event.kind === 'iterm2')
        this.#iterm2(event.args, event.base64)
      else {
        const command = this.#kitty.push(event)
        if (command)
          this.#kittyCommand(command)
      }
    }
    this.#forgetAlternate()
    this.#schedule()
  }

  #iterm2(args: Record<string, string>, base64: string): void {
    // Without inline=1 the file is a download, which this terminal does not offer.
    if (args.inline !== '1')
      return
    const bytes = decodeBase64(base64)
    if (!bytes)
      return
    this.#place(blobImage(bytes), {
      natural: imageSize(bytes),
      width: parseLength(args.width),
      height: parseLength(args.height),
      preserveAspectRatio: args.preserveAspectRatio !== '0',
    }, true)
  }

  #kittyCommand({ control, base64 }: KittyCommand): void {
    const action = control.a ?? 't'
    const id = control.i === undefined ? undefined : Number(control.i)
    const quiet = Number(control.q ?? 0)
    const respond = (message: string) => {
      // A reply goes only to a command with an id, and q=1 hides successes, q=2 everything.
      if (id === undefined || quiet >= 2 || (message === 'OK' && quiet >= 1))
        return
      this.#reply(`\x1B_Gi=${id};${message}\x1B\\`)
    }

    if (action === 'd') {
      const target = control.d ?? 'a'
      const remove = target === 'i' || target === 'I'
        ? (placement: Placement) => placement.imageId === id
        : () => true
      this.#remove(remove)
      if (target === 'I' && id !== undefined)
        this.#stored.delete(id)
      return
    }
    if (action === 'p') {
      const stored = id === undefined ? undefined : this.#stored.get(id)
      if (!stored)
        return respond('ENOENT:image not found')
      this.#placeKitty(stored, control, id)
      return respond('OK')
    }
    if (action !== 't' && action !== 'T' && action !== 'q')
      return respond('EINVAL:unsupported action')
    if ((control.t ?? 'd') !== 'd' || control.o !== undefined)
      return respond('ENOTSUPPORTED:only direct uncompressed transmission')

    const image = kittyImage(control, base64)
    if (!image)
      return respond('EINVAL:bad image data')
    if (action === 'q')
      return respond('OK')
    if (id !== undefined)
      this.#stored.set(id, image)
    if (action === 'T')
      this.#placeKitty(image, control, id)
    respond('OK')
  }

  #placeKitty(image: StoredImage, control: Record<string, string>, id: number | undefined): void {
    const cells = (value: string | undefined) => {
      const number = Number(value)
      return value !== undefined && number > 0 ? { unit: 'cells' as const, value: number } : undefined
    }
    this.#place(image.create(), {
      natural: image.size,
      width: cells(control.c),
      height: cells(control.r),
      // kitty scales the image to fill c × r when both are given.
      preserveAspectRatio: !(control.c && control.r),
    }, control.C !== '1', id)
  }

  /** Puts the image at the cursor and, unless `moveCursor` is false, moves the cursor past it. */
  #place(element: HTMLElement, request: LayoutRequest, moveCursor: boolean, imageId?: number): void {
    const terminal = this.#terminal
    const metrics = terminal.renderer?.getMetrics()
    if (!metrics)
      return
    const buffer = terminal.buffer.active
    const col = buffer.cursorX
    const box = layoutCells(request, {
      cell: { width: metrics.width, height: metrics.height },
      cols: terminal.cols,
      rows: terminal.rows,
      startCol: col,
      devicePixelRatio: window.devicePixelRatio || 1,
    })
    const screen = buffer.type
    const row = (screen === 'normal' ? terminal.getScrollbackLength() : 0) + buffer.cursorY
    Object.assign(element.style, {
      position: 'absolute',
      objectFit: box.fit,
      objectPosition: 'left top',
    })
    this.#layer.append(element)
    this.#placements.push({ element, row, col, box, screen, imageId })
    if (moveCursor)
      terminal.write(cursorPast(box))
  }

  /**
   * Erasing the cells under an image removes it, as in kitty. The erase is written here, so the terminal can be
   * compared before and after it: Ghostty's `CSI 2 J` moves the screen's lines into the scrollback when the cursor is
   * at the top left (as `clear` does), and the images move with them; `CSI 3 J` drops the scrollback, which shifts
   * every row that stays.
   */
  #erase(region: EraseRegion, data: Uint8Array): void {
    const terminal = this.#terminal
    const buffer = terminal.buffer.active
    const onScreen = buffer.type
    const scrollbackOf = () => terminal.buffer.active.type === 'normal' ? terminal.getScrollbackLength() : 0
    const screenTop = scrollbackOf()
    const cursorRow = screenTop + buffer.cursorY
    const cursorCol = buffer.cursorX
    terminal.write(data)
    const scrolledBy = scrollbackOf() - screenTop

    this.#remove((placement) => {
      if (region === 'all')
        return true
      if (placement.screen !== onScreen)
        return false
      if (region === 'scrollback')
        return placement.row < screenTop
      if (region === 'screen')
        return scrolledBy <= 0 && placement.row + placement.box.rows > screenTop
      // Below: from the cursor to the end of the screen. An image is erased when any of its cells is.
      const bottom = placement.row + placement.box.rows - 1
      return bottom > cursorRow || (bottom === cursorRow && placement.col + placement.box.cols > cursorCol)
    })
    if (region === 'scrollback' && onScreen === 'normal' && scrolledBy < 0) {
      for (const placement of this.#placements)
        placement.row += scrolledBy
    }
  }

  /** The alternate screen is discarded when a program leaves it, and its images with it. */
  #forgetAlternate(): void {
    if (this.#terminal.buffer.active.type === 'normal')
      this.#remove(placement => placement.screen === 'alternate')
  }

  #remove(predicate: (placement: Placement) => boolean): void {
    this.#placements = this.#placements.filter((placement) => {
      if (!predicate(placement))
        return true
      placement.element.remove()
      return false
    })
    this.#lastLayout = ''
  }

  /** Keeps the images on their rows while any are shown: the viewport scrolls with output, the wheel and animations. */
  #schedule(): void {
    if (this.#frame !== undefined || this.#placements.length === 0) {
      this.#layout()
      return
    }
    const tick = () => {
      this.#layout()
      this.#frame = this.#placements.length > 0 ? requestAnimationFrame(tick) : undefined
    }
    this.#frame = requestAnimationFrame(tick)
  }

  #layout(): void {
    const terminal = this.#terminal
    const canvas = terminal.element?.querySelector('canvas')
    const metrics = terminal.renderer?.getMetrics()
    if (!canvas || !metrics)
      return
    const buffer = terminal.buffer.active
    const scrollback = terminal.getScrollbackLength()
    const viewport = (terminal as unknown as { viewportY: number }).viewportY
    const key = [canvas.offsetLeft, canvas.offsetTop, canvas.offsetWidth, canvas.offsetHeight, canvas.style.transform, metrics.width, metrics.height, scrollback, viewport, buffer.type, this.#placements.length].join()
    if (key === this.#lastLayout)
      return
    this.#lastLayout = key

    Object.assign(this.#layer.style, {
      left: `${canvas.offsetLeft}px`,
      top: `${canvas.offsetTop}px`,
      width: `${canvas.offsetWidth}px`,
      height: `${canvas.offsetHeight}px`,
      transform: canvas.style.transform,
    })
    // The first row shown: the bottom of the scrollback, moved up by the scroll offset (0 when following the output).
    const top = buffer.type === 'normal' ? scrollback - viewport : 0
    for (const placement of this.#placements) {
      const style = placement.element.style
      style.display = placement.screen === buffer.type ? '' : 'none'
      style.left = `${placement.col * metrics.width}px`
      style.top = `${(placement.row - top) * metrics.height}px`
      style.width = `${placement.box.cols * metrics.width}px`
      style.height = `${placement.box.rows * metrics.height}px`
    }
  }
}

interface Placement {
  element: HTMLElement
  /** Row in the buffer: scrollback lines above the screen plus the screen row, for the normal screen. */
  row: number
  col: number
  box: CellBox
  screen: 'normal' | 'alternate'
  imageId: number | undefined
}

/** A kitty image kept for `a=p`: its size, and how to make one more element showing it. */
interface StoredImage {
  size: PixelSize | undefined
  create: () => HTMLElement
}

function kittyImage(control: Record<string, string>, base64: string): StoredImage | undefined {
  const bytes = decodeBase64(base64)
  if (!bytes)
    return undefined
  const format = control.f ?? '32'
  if (format === '100') {
    const size = imageSize(bytes)
    return size ? { size, create: () => blobImage(bytes) } : undefined
  }
  if (format !== '24' && format !== '32')
    return undefined
  const width = Number(control.s)
  const height = Number(control.v)
  const channels = format === '24' ? 3 : 4
  if (!(width > 0 && height > 0) || bytes.length < width * height * channels)
    return undefined
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba.set(bytes.subarray(pixel * channels, pixel * channels + 3), pixel * 4)
    rgba[pixel * 4 + 3] = channels === 4 ? bytes[pixel * channels + 3] : 255
  }
  const pixels = new ImageData(rgba, width, height)
  return {
    size: { width, height },
    create: () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.putImageData(pixels, 0, 0)
      return canvas
    },
  }
}

/** An `<img>` of an encoded file; the browser sniffs the format. */
function blobImage(bytes: Uint8Array): HTMLImageElement {
  const image = document.createElement('img')
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]))
  image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  image.addEventListener('error', () => URL.revokeObjectURL(url), { once: true })
  image.decoding = 'async'
  image.alt = ''
  image.src = url
  return image
}
