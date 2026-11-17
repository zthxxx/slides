export interface ProgramStatus {
  state: 'idle' | 'working' | 'done' | 'blocked' | 'error'
  app?: string
  progress?: number
}

interface ObserverOptions {
  reply: (data: string) => void
  onStatus: (status: ProgramStatus | undefined) => void
}

const STATES = new Set(['idle', 'working', 'done', 'blocked', 'error', 'clear'])
const REPLY = '\x1B]7501;?\x1B\\'
const LIMIT = 4096

/**
 * Observe OSC 7501's root record without changing the terminal's display stream.
 * Wire format and tmux envelope: botmux@cb8ff44b2d9e0d250040f3228feb11e9225d6514
 * https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-parser.ts#L14-L120
 * Probe reply: src/utils/program-status-probe-relay.ts:24–26 at the same revision.
 * https://www.superlogical.com/rex/docs/build/program-status (revision 0.4).
 * Child records need a separate task view; they never overwrite this root status.
 */
export class ProgramStatusObserver {
  #mode: 'text' | 'escape' | 'osc' | 'osc-escape' | 'dcs' | 'dcs-escape' = 'text'
  #body = ''
  #length = 0
  #overflow = false

  constructor(private readonly options: ObserverOptions) {}

  scan(data: Uint8Array | string): void {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    for (const byte of bytes)
      this.#scanByte(byte)
  }

  #scanByte(byte: number): void {
    if (this.#mode === 'text') {
      if (byte === 0x1B)
        this.#mode = 'escape'
      return
    }
    if (this.#mode === 'escape') {
      this.#mode = byte === 0x1B ? 'escape' : 'text'
      if (byte === 0x5D || byte === 0x50) {
        this.#mode = byte === 0x5D ? 'osc' : 'dcs'
        this.#body = ''
        this.#length = 2
        this.#overflow = false
      }
      else if (byte === 0x63) {
        this.options.onStatus(undefined)
      }
      return
    }

    const dcs = this.#mode === 'dcs' || this.#mode === 'dcs-escape'
    const escaped = this.#mode === 'osc-escape' || this.#mode === 'dcs-escape'
    if (escaped) {
      if (byte === 0x5C) {
        this.#length += 2
        this.#mode = 'text'
        if (!this.#overflow && this.#length <= LIMIT)
          this.#complete(dcs)
      }
      else if (dcs) {
        this.#append('\x1B' + String.fromCharCode(byte))
        this.#mode = 'dcs'
      }
      else {
        // A different escape invalidates this OSC; the new sequence may be a valid report.
        this.#mode = 'escape'
        this.#scanByte(byte)
      }
      return
    }
    if (byte === 0x1B) {
      this.#mode = dcs ? 'dcs-escape' : 'osc-escape'
    }
    else if (!dcs && byte === 0x07) {
      this.#length++
      this.#mode = 'text'
      if (!this.#overflow && this.#length <= LIMIT)
        this.#complete(false)
    }
    else {
      this.#append(String.fromCharCode(byte))
    }
  }

  #append(text: string): void {
    this.#length += text.length
    if (this.#length > LIMIT) {
      this.#overflow = true
      this.#body = ''
    }
    else if (!this.#overflow) {
      this.#body += text
    }
  }

  #complete(dcs: boolean): void {
    let body = this.#body
    this.#body = ''
    if (dcs) {
      if (!body.startsWith('tmux;\x1B\x1B]7501;'))
        return
      const inner = body.slice(5).replaceAll('\x1B\x1B', '\x1B')
      const match = /^\x1B\]([^\x1B\x07]*)(?:\x07|\x1B\\)$/.exec(inner)
      if (!match)
        return
      body = match[1]!
    }
    if (!body.startsWith('7501;'))
      return
    const payload = body.slice(5)
    if (payload.trim() === '?') {
      this.options.reply(REPLY)
      return
    }

    const fields = new Map<string, string>()
    for (const pair of payload.split(':')) {
      const equals = pair.indexOf('=')
      if (equals < 0)
        continue
      const key = pair.slice(0, equals).trim()
      // A malformed child address must never fall back to the root record.
      if (key === 'id')
        return
      const value = pair.slice(equals + 1).trim()
      if (/^[a-z]{1,16}$/.test(key) && /^[A-Za-z0-9_.,+/=-]*$/.test(value))
        fields.set(key, value)
    }
    const state = fields.get('state')
    if (!state || !STATES.has(state))
      return
    if (state === 'clear') {
      this.options.onStatus(undefined)
      return
    }
    const status: ProgramStatus = { state: state as ProgramStatus['state'] }
    const app = fields.get('app')
    if (app && /^[A-Za-z0-9_.+-]{1,32}$/.test(app))
      status.app = app
    const progress = fields.get('progress')
    if ((state === 'working' || state === 'blocked') && progress && /^\d+$/.test(progress)) {
      const percentage = Number(progress)
      if (percentage <= 100)
        status.progress = percentage
    }
    this.options.onStatus(status)
  }
}
