/**
 * Mouse reporting: how a terminal turns pointer actions into input bytes for a program that asked for them.
 * A program enables a tracking mode with a DEC private mode (`CSI ? <mode> h`) and, optionally, the SGR encoding;
 * the terminal then writes reports into the same input stream as the keyboard.
 * Ref: XTerm Control Sequences, "Mouse Tracking" (https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking).
 */

/** Which pointer actions are reported, from the tracking mode set: X10 (9), normal (1000), button-event (1002), any-event (1003). */
export type MouseTracking = 'x10' | 'normal' | 'button' | 'any'

/** How a report is written: the default `CSI M Cb Cx Cy` bytes, or SGR (1006) `CSI < Cb ; Cx ; Cy M|m`. */
export type MouseEncoding = 'default' | 'sgr'

export interface MouseProtocol {
  tracking: MouseTracking
  encoding: MouseEncoding
}

export const MOUSE_MODES = { x10: 9, normal: 1000, button: 1002, any: 1003, sgr: 1006 } as const

/** Left, middle, right. */
export type MouseButton = 0 | 1 | 2

export type WheelDirection = 'up' | 'down'

export type MouseAction =
  | { kind: 'press' | 'release', button: MouseButton }
  /** Pointer moved to another cell, with the button still held, if any. */
  | { kind: 'move', button?: MouseButton }
  | { kind: 'wheel', direction: WheelDirection }

export interface MouseReport {
  action: MouseAction
  /** Zero-based cell under the pointer. */
  col: number
  row: number
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
}

/**
 * The protocol in effect for the terminal's current DEC modes, or undefined when no program asked for mouse reports.
 * Programs set one tracking mode at a time; if several are set, the one reporting the most wins.
 */
export function mouseProtocol(getMode: (mode: number) => boolean): MouseProtocol | undefined {
  const tracking = (['any', 'button', 'normal', 'x10'] as const).find(name => getMode(MOUSE_MODES[name]))
  if (!tracking)
    return undefined
  return { tracking, encoding: getMode(MOUSE_MODES.sgr) ? 'sgr' : 'default' }
}

const WHEEL_CODE: Record<WheelDirection, number> = { up: 64, down: 65 }
const MOTION = 32
/** The button code of a release in the default encoding, which cannot tell which button was released; also "no button" in a motion report. */
const NO_BUTTON = 3

/** The largest coordinate or code the default encoding can carry: each is one byte, offset by 32. */
const DEFAULT_ENCODING_LIMIT = 255 - 32

/**
 * The bytes to send for a pointer action under a protocol, or undefined when the protocol does not report it
 * (X10 reports presses only; motion needs mode 1002 with a button held, or 1003) or the default encoding cannot
 * represent the cell.
 */
export function encodeMouse(report: MouseReport, protocol: MouseProtocol): Uint8Array | undefined {
  const { action } = report
  const { tracking, encoding } = protocol
  if (tracking === 'x10' && action.kind !== 'press' && action.kind !== 'wheel')
    return undefined
  if (action.kind === 'move' && !(tracking === 'any' || (tracking === 'button' && action.button !== undefined)))
    return undefined

  let code: number
  switch (action.kind) {
    case 'press': code = action.button; break
    case 'release': code = encoding === 'sgr' ? action.button : NO_BUTTON; break
    case 'move': code = (action.button ?? NO_BUTTON) + MOTION; break
    case 'wheel': code = WHEEL_CODE[action.direction]; break
  }
  // X10 mode predates modifier reporting.
  if (tracking !== 'x10')
    code += (report.shift ? 4 : 0) + (report.alt ? 8 : 0) + (report.ctrl ? 16 : 0)

  const x = report.col + 1
  const y = report.row + 1
  if (encoding === 'sgr')
    return ascii(`\x1B[<${code};${x};${y}${action.kind === 'release' ? 'm' : 'M'}`)

  if (x > DEFAULT_ENCODING_LIMIT || y > DEFAULT_ENCODING_LIMIT)
    return undefined
  return Uint8Array.of(0x1B, 0x5B, 0x4D, code + 32, x + 32, y + 32)
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0))
}

/**
 * The arrow keys that move a shell's cursor from one cell to another, for Option(Alt)-click: the cursor walks along
 * the line, wrapping at the right edge, as zle and readline move through a command that spans rows.
 * As iTerm2's Option-click and xterm.js's `altClickMovesCursor`; `application` is DECCKM (`CSI ? 1 h`), under which
 * the arrows are `ESC O C` / `ESC O D`.
 */
export function cursorMoveKeys(from: { col: number, row: number }, to: { col: number, row: number }, cols: number, application = false): string {
  const steps = (to.row - from.row) * cols + (to.col - from.col)
  const key = `\x1B${application ? 'O' : '['}${steps < 0 ? 'D' : 'C'}`
  return key.repeat(Math.abs(steps))
}
