/**
 * Inline images in a terminal's output: the iTerm2 inline images protocol and the kitty graphics protocol.
 * ghostty-web 0.4.0 parses both sequences and draws nothing (its WASM drops OSC 1337 and APC), so the emulator takes
 * them out of the output here, before ghostty-web sees it, and draws them over the canvas (`graphics-overlay.ts`).
 * Everything in this module is pure: bytes in, events out.
 *
 * Refs: iTerm2 "Inline Images Protocol" (https://iterm2.com/documentation-images.html),
 * kitty "Terminal graphics protocol" (https://sw.kovidgoyal.net/kitty/graphics-protocol/).
 */

const ESC = 0x1B
const BEL = 0x07
const BACKSLASH = 0x5C

const latin1 = new TextDecoder('latin1')
const ascii = (text: string) => Uint8Array.from(text, char => char.charCodeAt(0))

/** `ESC _ G`: an APC string whose first byte is G is a kitty graphics command. */
const KITTY_START = ascii('\x1B_G')
/** `ESC ] 1337 ; File=`: an iTerm2 file transfer; `inline=1` makes it an image. */
const ITERM2_START = ascii('\x1B]1337;File=')
/** `ESC c`: full reset (RIS). */
const RESET = ascii('\x1Bc')

/** Image sequences larger than this are dropped instead of buffered. */
export const MAX_SEQUENCE_BYTES = 32 * 1024 * 1024

/** Parts of the output in stream order. */
export type StreamEvent =
  /** Bytes for the VT parser, unchanged. */
  | { kind: 'text', data: Uint8Array }
  /** `ESC ] 1337 ; File = <args> : <base64> BEL|ST`, taken out of the stream. */
  | { kind: 'iterm2', args: Record<string, string>, base64: string }
  /** `ESC _ G <control> ; <base64 payload> ST`, one chunk, taken out of the stream. */
  | { kind: 'kitty', control: Record<string, string>, base64: string }
  /**
   * An erase that may remove images under it, with its own bytes, which still go to the VT parser:
   * `CSI J` / `CSI 0 J` below the cursor, `CSI 2 J` the screen, `CSI 3 J` the scrollback, `ESC c` everything.
   * It is a separate event so the overlay can compare the terminal before and after it.
   */
  | { kind: 'erase', region: EraseRegion, data: Uint8Array }

export type EraseRegion = 'below' | 'screen' | 'scrollback' | 'all'

type Match =
  /** Not one of the sequences handled here. */
  | { kind: 'none' }
  /** The buffer ends before the sequence can be told apart. */
  | { kind: 'undecided' }
  | { kind: 'image', protocol: 'iterm2' | 'kitty', contentStart: number }
  | { kind: 'erase', region: EraseRegion, end: number }

/**
 * Splits a terminal's output into text for the VT parser and image commands, across arbitrary chunk boundaries.
 * A tail that may still become an image sequence is held back until the next chunk. Holding back is invisible:
 * the held bytes start an escape sequence, which the VT parser could not act on before its later bytes arrive either.
 */
export class GraphicsStream {
  #held = new Uint8Array(0)
  /** An image sequence is open in `#held`: where its content starts, and how far the terminator was searched. */
  #open: { protocol: 'iterm2' | 'kitty', contentStart: number, searched: number } | undefined
  /** An oversized sequence is being dropped until its terminator. */
  #dropping = false

  push(chunk: Uint8Array | string): StreamEvent[] {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    const buffer = this.#held.length === 0 ? bytes : concat(this.#held, bytes)
    this.#held = new Uint8Array(0)
    const events: StreamEvent[] = []
    let textStart = 0
    let index = 0

    if (this.#dropping) {
      const end = findTerminator(buffer, 0, true)
      if (end === undefined) {
        this.#held = buffer.slice(Math.max(0, buffer.length - 1))
        return events
      }
      this.#dropping = false
      index = textStart = end.end
    }

    const text = (end: number) => {
      if (end > textStart)
        events.push({ kind: 'text', data: buffer.subarray(textStart, end) })
    }

    while (index < buffer.length) {
      const open = this.#open
      let match: Match
      if (open) {
        this.#open = undefined
        match = { kind: 'image', protocol: open.protocol, contentStart: open.contentStart }
      }
      else {
        const escape = buffer.indexOf(ESC, index)
        if (escape < 0)
          break
        index = escape
        match = classify(buffer, index)
      }

      if (match.kind === 'none') {
        index++
        continue
      }
      if (match.kind === 'undecided') {
        text(index)
        this.#held = buffer.slice(index)
        return events
      }
      if (match.kind === 'erase') {
        text(index)
        events.push({ kind: 'erase', region: match.region, data: buffer.subarray(index, match.end) })
        textStart = index = match.end
        continue
      }

      // An image sequence: find its end.
      const from = open ? Math.max(match.contentStart, open.searched) : match.contentStart
      const end = findTerminator(buffer, from, match.protocol === 'iterm2')
      if (end === undefined) {
        text(index)
        const rest = buffer.subarray(index)
        if (rest.length > MAX_SEQUENCE_BYTES) {
          this.#dropping = true
          this.#held = rest.slice(rest.length - 1)
          return events
        }
        this.#held = rest.slice()
        this.#open = {
          protocol: match.protocol,
          contentStart: match.contentStart - index,
          // The last byte may be an ESC whose `\` is still to come.
          searched: Math.max(match.contentStart - index, rest.length - 1),
        }
        return events
      }
      text(index)
      if (end.aborted) {
        // ESC followed by anything but `\` ends the string unterminated; the sequence is dropped, and the escape
        // that interrupted it is parsed as usual.
        textStart = index = end.contentEnd
        continue
      }
      const content = latin1.decode(buffer.subarray(match.contentStart, end.contentEnd))
      events.push(match.protocol === 'kitty' ? parseKitty(content) : parseITerm2(content))
      textStart = index = end.end
    }

    text(buffer.length)
    return events
  }
}

function classify(buffer: Uint8Array, at: number): Match {
  for (const [start, protocol] of [[KITTY_START, 'kitty'], [ITERM2_START, 'iterm2']] as const) {
    const prefix = comparePrefix(buffer, at, start)
    if (prefix === 'match')
      return { kind: 'image', protocol, contentStart: at + start.length }
    if (prefix === 'partial')
      return { kind: 'undecided' }
  }
  const reset = comparePrefix(buffer, at, RESET)
  if (reset === 'match')
    return { kind: 'erase', region: 'all', end: at + RESET.length }
  if (reset === 'partial')
    return { kind: 'undecided' }

  // CSI Ps J (erase in display).
  if (at + 1 >= buffer.length)
    return { kind: 'undecided' }
  if (buffer[at + 1] !== 0x5B)
    return { kind: 'none' }
  let index = at + 2
  let digits = ''
  while (index < buffer.length && buffer[index] >= 0x30 && buffer[index] <= 0x39 && digits.length < 4)
    digits += String.fromCharCode(buffer[index++])
  if (index >= buffer.length)
    return digits.length < 4 ? { kind: 'undecided' } : { kind: 'none' }
  if (buffer[index] !== 0x4A)
    return { kind: 'none' }
  const region = ({ '': 'below', '0': 'below', '2': 'screen', '3': 'scrollback' } as const)[digits as '' | '0' | '2' | '3']
  return region ? { kind: 'erase', region, end: index + 1 } : { kind: 'none' }
}

function comparePrefix(buffer: Uint8Array, at: number, prefix: Uint8Array): 'match' | 'partial' | 'differ' {
  for (let offset = 0; offset < prefix.length; offset++) {
    if (at + offset >= buffer.length)
      return 'partial'
    if (buffer[at + offset] !== prefix[offset])
      return 'differ'
  }
  return 'match'
}

/** ST (`ESC \`) ends both strings; BEL also ends an OSC. ESC followed by anything else aborts the string. */
function findTerminator(buffer: Uint8Array, from: number, allowBell: boolean): { contentEnd: number, end: number, aborted: boolean } | undefined {
  for (let index = from; index < buffer.length; index++) {
    const byte = buffer[index]
    if (allowBell && byte === BEL)
      return { contentEnd: index, end: index + 1, aborted: false }
    if (byte !== ESC)
      continue
    if (index + 1 >= buffer.length)
      return undefined
    return buffer[index + 1] === BACKSLASH
      ? { contentEnd: index, end: index + 2, aborted: false }
      : { contentEnd: index, end: index, aborted: true }
  }
  return undefined
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.length + b.length)
  joined.set(a)
  joined.set(b, a.length)
  return joined
}

/** `a=T,f=100,c=24;<base64>`: comma-separated `key=value` control data, then the payload. */
function parseKitty(content: string): StreamEvent {
  const separator = content.indexOf(';')
  const control = separator < 0 ? content : content.slice(0, separator)
  return {
    kind: 'kitty',
    control: parsePairs(control, ','),
    base64: separator < 0 ? '' : content.slice(separator + 1),
  }
}

/** `inline=1;width=24:<base64>`: semicolon-separated `key=value` arguments, then the file contents. */
function parseITerm2(content: string): StreamEvent {
  const separator = content.indexOf(':')
  const args = separator < 0 ? content : content.slice(0, separator)
  return {
    kind: 'iterm2',
    args: parsePairs(args, ';'),
    base64: separator < 0 ? '' : content.slice(separator + 1),
  }
}

function parsePairs(text: string, separator: string): Record<string, string> {
  const pairs: Record<string, string> = {}
  for (const pair of text.split(separator)) {
    const equals = pair.indexOf('=')
    if (equals > 0)
      pairs[pair.slice(0, equals)] = pair.slice(equals + 1)
  }
  return pairs
}

/** A complete kitty command: chunks of one transmission (`m=1` … `m=0`) joined, keyed by the first chunk's control data. */
export interface KittyCommand {
  control: Record<string, string>
  base64: string
}

/**
 * Joins chunked kitty transmissions. The first chunk carries the control data and `m=1`; the following chunks carry
 * only `m` (and optionally `q`), the last one `m=0`. A chunk with other keys while a transmission is open starts over.
 */
export class KittyAssembler {
  #open: { control: Record<string, string>, parts: string[] } | undefined

  push(command: { control: Record<string, string>, base64: string }): KittyCommand | undefined {
    const continuation = this.#open && Object.keys(command.control).every(key => key === 'm' || key === 'q')
    if (continuation) {
      this.#open!.parts.push(command.base64)
      if (command.control.m === '1')
        return undefined
      const { control, parts } = this.#open!
      this.#open = undefined
      return { control, base64: parts.join('') }
    }
    this.#open = undefined
    if (command.control.m === '1') {
      this.#open = { control: command.control, parts: [command.base64] }
      return undefined
    }
    return { control: command.control, base64: command.base64 }
  }
}

/** Base64 to bytes, ignoring whitespace; undefined when it is not base64. */
export function decodeBase64(text: string): Uint8Array | undefined {
  try {
    const binary = atob(text.replace(/\s+/g, ''))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  }
  catch {
    return undefined
  }
}

export interface PixelSize {
  width: number
  height: number
}

/** The pixel size from a PNG, GIF, JPEG or WebP file's header; the browser decodes the file itself later. */
export function imageSize(bytes: Uint8Array): PixelSize | undefined {
  const at = (offset: number) => bytes[offset] ?? 0
  const u16be = (offset: number) => (at(offset) << 8) | at(offset + 1)
  const u16le = (offset: number) => at(offset) | (at(offset + 1) << 8)
  const u24le = (offset: number) => at(offset) | (at(offset + 1) << 8) | (at(offset + 2) << 16)
  const u32be = (offset: number) => ((at(offset) << 24) >>> 0) + (at(offset + 1) << 16) + (at(offset + 2) << 8) + at(offset + 3)
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  const valid = (size: PixelSize) => size.width > 0 && size.height > 0 ? size : undefined

  if (bytes.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1A\n' && text(12, 4) === 'IHDR')
    return valid({ width: u32be(16), height: u32be(20) })
  if (bytes.length >= 10 && (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a'))
    return valid({ width: u16le(6), height: u16le(8) })
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const chunk = text(12, 4)
    if (chunk === 'VP8X')
      return valid({ width: u24le(24) + 1, height: u24le(27) + 1 })
    if (chunk === 'VP8L' && at(20) === 0x2F) {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24)
      return valid({ width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 })
    }
    if (chunk === 'VP8 ')
      return valid({ width: u16le(26) & 0x3FFF, height: u16le(28) & 0x3FFF })
    return undefined
  }
  if (bytes.length >= 4 && at(0) === 0xFF && at(1) === 0xD8) {
    // Walk the JPEG segments to the first start-of-frame marker (SOF0–SOF15 except DHT, JPG and DAC).
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (at(offset) !== 0xFF)
        return undefined
      const marker = at(offset + 1)
      if (marker === 0xFF) {
        offset++
        continue
      }
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC)
        return valid({ width: u16be(offset + 7), height: u16be(offset + 5) })
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
        offset += 2
        continue
      }
      offset += 2 + u16be(offset + 2)
    }
  }
  return undefined
}

/** One dimension of a requested size: cells, CSS pixels, or percent of the terminal's width or height. */
export type Length =
  | { unit: 'cells', value: number }
  | { unit: 'px', value: number }
  | { unit: 'percent', value: number }

/** iTerm2's `width` / `height` argument: `N`, `Npx`, `N%` or `auto` (undefined). */
export function parseLength(value: string | undefined): Length | undefined {
  const match = /^(\d+(?:\.\d+)?)(px|%)?$/.exec(value ?? '')
  if (!match)
    return undefined
  const number = Number(match[1])
  if (!(number > 0))
    return undefined
  return { unit: match[2] === 'px' ? 'px' : match[2] === '%' ? 'percent' : 'cells', value: number }
}

export interface LayoutRequest {
  /** The image's pixel size, when its header could be read. */
  natural: PixelSize | undefined
  width?: Length
  height?: Length
  /** With both a width and a height: keep the aspect ratio inside the box (iTerm2's default) or stretch to it. */
  preserveAspectRatio: boolean
}

export interface Geometry {
  /** One cell in CSS pixels. */
  cell: PixelSize
  /** The terminal in cells. */
  cols: number
  rows: number
  /** Columns left of the cursor, which the image cannot use. */
  startCol: number
  /** Image pixels per CSS pixel, as native terminals map image pixels to device pixels. */
  devicePixelRatio: number
}

export interface CellBox {
  cols: number
  rows: number
  /** How the image fills its cells. */
  fit: 'contain' | 'fill'
}

/** Without a size or a readable header, an image gets a box this many cells wide, square in pixels. */
const FALLBACK_COLS = 24

/**
 * The cells an image covers. A requested width or height is used as given, the other follows the aspect ratio;
 * without either, the image keeps its pixel size. The result is kept inside the columns right of the cursor and
 * the terminal's height, scaled down in proportion, so the whole image stays visible.
 */
export function layoutCells(request: LayoutRequest, geometry: Geometry): CellBox {
  const { cell, devicePixelRatio } = geometry
  const terminalPx = { width: geometry.cols * cell.width, height: geometry.rows * cell.height }
  const toPx = (length: Length | undefined, axis: 'width' | 'height') => {
    if (!length)
      return undefined
    if (length.unit === 'cells')
      return length.value * cell[axis]
    if (length.unit === 'px')
      return length.value
    return length.value / 100 * terminalPx[axis]
  }
  const natural = request.natural
    ? { width: request.natural.width / devicePixelRatio, height: request.natural.height / devicePixelRatio }
    : { width: FALLBACK_COLS * cell.width, height: FALLBACK_COLS * cell.width }
  const aspect = natural.height / natural.width

  let width = toPx(request.width, 'width')
  let height = toPx(request.height, 'height')
  const both = width !== undefined && height !== undefined
  if (width === undefined && height === undefined) {
    width = natural.width
    height = natural.height
  }
  else if (width === undefined) {
    width = height! / aspect
  }
  else if (height === undefined) {
    height = width * aspect
  }

  const maxWidth = Math.max(1, geometry.cols - geometry.startCol) * cell.width
  const maxHeight = Math.max(1, geometry.rows - 1) * cell.height
  const shrink = Math.min(1, maxWidth / width!, maxHeight / height!)
  return {
    cols: clampCells(Math.ceil(width! * shrink / cell.width - 1e-6), geometry.cols - geometry.startCol),
    rows: clampCells(Math.ceil(height! * shrink / cell.height - 1e-6), geometry.rows - 1),
    fit: both && !request.preserveAspectRatio ? 'fill' : 'contain',
  }
}

function clampCells(value: number, max: number): number {
  return Math.min(Math.max(1, value), Math.max(1, max))
}

/**
 * The bytes that move the cursor past an image, as kitty does after a placement: down to the image's last row
 * (line feeds, which scroll the screen when the image reaches the bottom), then right past its last column.
 * Line feeds keep the column (the VT parser does not add a carriage return), so the image keeps its left edge.
 */
export function cursorPast(box: CellBox): string {
  return '\n'.repeat(box.rows - 1) + (box.cols > 0 ? `\x1B[${box.cols}C` : '')
}
