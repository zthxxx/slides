/**
 * The terminal bell: which BEL characters (0x07) in a terminal's output ring, and the sound they make.
 *
 * A BEL rings only as a control character of its own. The BEL that ends an OSC string (`ESC ] … BEL`, xterm's
 * alternative to ST) and anything inside a DCS / APC / PM / SOS string do not; ghostty-web 0.4.0 fires its `onBell`
 * for every 0x07 byte in a write (`dist/ghostty-web.js`, `Terminal.write`), so the deck detects bells itself.
 * The parser keeps its state between writes: a sequence split across two writes is still recognized.
 * Refs: the DEC VT500-series parser (https://vt100.net/emu/dec_ansi_parser),
 * XTerm Control Sequences (https://invisible-island.net/xterm/ctlseqs/ctlseqs.html, OSC "terminated by BEL or ST").
 */

type ParserState = 'ground' | 'escape' | 'csi' | 'string' | 'string-escape'

const BEL = 0x07
const ESC = 0x1B
/** CAN and SUB cancel a sequence in progress. */
const CAN = 0x18
const SUB = 0x1A

/** The byte after ESC that opens a string: OSC `]`, DCS `P`, APC `_`, PM `^`, SOS `X`. */
const STRING_INTRODUCERS = new Set([0x5D, 0x50, 0x5F, 0x5E, 0x58])

export class BellDetector {
  #state: ParserState = 'ground'

  /** How many bells `data` rings. */
  scan(data: Uint8Array | string): number {
    let bells = 0
    const length = data.length
    for (let index = 0; index < length; index++) {
      const byte = typeof data === 'string' ? data.charCodeAt(index) : data[index]
      if (this.#step(byte))
        bells++
    }
    return bells
  }

  /** Advance by one byte; true when it rings. */
  #step(byte: number): boolean {
    switch (this.#state) {
      case 'ground':
        if (byte === ESC)
          this.#state = 'escape'
        return byte === BEL

      case 'escape':
        // C0 controls inside an escape or control sequence are executed where they stand.
        if (byte === BEL)
          return true
        if (byte === ESC)
          return false
        if (byte === 0x5B)
          this.#state = 'csi'
        else if (STRING_INTRODUCERS.has(byte))
          this.#state = 'string'
        else if (byte < 0x20 || byte > 0x2F)
          this.#state = 'ground'
        // 0x20–0x2F are intermediates: the escape sequence goes on.
        return false

      case 'csi':
        if (byte === BEL)
          return true
        if (byte === ESC)
          this.#state = 'escape'
        else if (byte === CAN || byte === SUB || (byte >= 0x40 && byte <= 0x7E))
          this.#state = 'ground'
        return false

      case 'string':
        // BEL ends the string (OSC) or is part of it: either way it does not ring.
        if (byte === BEL || byte === CAN || byte === SUB)
          this.#state = 'ground'
        else if (byte === ESC)
          this.#state = 'string-escape'
        return false

      case 'string-escape':
        // `ESC \` is ST; any other ESC aborts the string and starts a new escape sequence.
        if (byte === 0x5C) {
          this.#state = 'ground'
          return false
        }
        this.#state = 'escape'
        return this.#step(byte)
    }
  }
}

/** Rings closer together than this make one sound, as a burst of BEL bytes would otherwise stack into noise. */
const SOUND_GAP_MS = 120

let audio: AudioContext | undefined
let lastSound = -Infinity
let armed = false

function audioContext(): AudioContext | undefined {
  try {
    audio ??= new AudioContext()
  }
  catch {
    return undefined
  }
  if (audio.state === 'suspended')
    void audio.resume().catch(() => {})
  return audio
}

/**
 * A browser keeps audio silent until the page has seen a user gesture, and a bell arrives some time after the click
 * that caused it (the command still has to be typed and run). The first click or key press therefore creates the
 * audio context, so a later bell can sound.
 */
export function armBellSound(): void {
  if (typeof window === 'undefined' || armed)
    return
  armed = true
  for (const type of ['pointerdown', 'keydown'])
    window.addEventListener(type, () => void audioContext(), { capture: true, passive: true })
}

/** A short two-tone chime, quieter than a system alert. */
export function playBellSound(): void {
  const now = performance.now()
  if (now - lastSound < SOUND_GAP_MS)
    return
  lastSound = now
  const context = audioContext()
  if (!context || context.state !== 'running')
    return

  const start = context.currentTime
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
  gain.connect(context.destination)
  for (const [frequency, delay] of [[1046.5, 0], [1568, 0.06]] as const) {
    const tone = context.createOscillator()
    tone.type = 'sine'
    tone.frequency.value = frequency
    tone.connect(gain)
    tone.start(start + delay)
    tone.stop(start + 0.46)
  }
}
