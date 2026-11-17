import type { Pty, PtyEnd } from 'unkernel/web'
import type { SessionField, StepChunk, StepInput } from './steps'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { ref, shallowReactive } from 'vue'
import { useKernel } from './kernel'
import { referencedSessions, resolveSessionRefs, stepChunks } from './steps'

export type SessionStatus = 'idle' | 'starting' | 'running' | 'failed'

const TYPING_DELAY_MS = 24
const KEY_PAUSE_MS = 160

/**
 * One shell on its own pty of the shared VM, shown by one xterm.
 * The pty is spawned the first time the terminal is shown, so pty numbers follow the order slides are visited.
 */
export class ShellSession {
  readonly status = ref<SessionStatus>('idle')
  readonly pts = ref<number>()
  readonly pid = ref<number>()
  /** The element xterm renders into; a terminal component adopts it. */
  readonly host = document.createElement('div')
  readonly terminal = new Terminal({
    fontFamily: '"Fira Code", Menlo, Monaco, Consolas, monospace',
    fontSize: 18,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
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
    },
  })

  #fit = new FitAddon()
  #opening: Promise<void> | undefined
  #pty: Pty | undefined
  #starting: Promise<Pty> | undefined
  #typing: Promise<void> = Promise.resolve()

  constructor(readonly key: string) {
    this.host.className = 'shell-session'
    this.terminal.loadAddon(this.#fit)
    this.terminal.onData(data => void this.#pty?.write(data))
    this.terminal.onBinary(data => void this.#pty?.write(Uint8Array.from(data, char => char.charCodeAt(0))))
    this.terminal.onResize(({ cols, rows }) => this.#pty?.resize(cols, rows))
  }

  /** Render into a visible container; the first call also opens xterm and starts the shell. */
  async show(container: HTMLElement): Promise<void> {
    if (this.host.parentElement !== container)
      container.append(this.host)
    this.#opening ??= this.#open()
    await this.#opening
    this.fit()
    void this.start().catch(() => {})
  }

  async #open(): Promise<void> {
    // xterm measures its cell size once at open(), so the web font must be ready by then.
    await document.fonts.load(`${this.terminal.options.fontSize}px "Fira Code"`).catch(() => {})
    this.terminal.open(this.host)
  }

  fit(): void {
    if (this.terminal.element && this.host.clientWidth > 0 && this.host.clientHeight > 0)
      this.#fit.fit()
  }

  start(): Promise<Pty> {
    this.#starting ??= this.#spawn()
    return this.#starting
  }

  /** Type the chunks into the shell, after any steps still being typed. */
  play(chunks: StepChunk[]): Promise<void> {
    const typing = this.#typing.then(async () => {
      const pty = await this.start()
      for (const chunk of chunks) {
        if (!chunk.typed) {
          await pty.write(chunk.text)
          await sleep(KEY_PAUSE_MS)
          continue
        }
        for (const char of chunk.text) {
          await pty.write(char)
          await sleep(TYPING_DELAY_MS)
        }
      }
    })
    this.#typing = typing.catch(() => {})
    return typing
  }

  async #spawn(): Promise<Pty> {
    this.status.value = 'starting'
    try {
      const vm = await useKernel()
      const pty = await vm.spawn(undefined, undefined, { cols: this.terminal.cols, rows: this.terminal.rows })
      this.#pty = pty
      this.pts.value = pty.pts
      this.pid.value = pty.pid
      this.status.value = 'running'

      // Resolving after xterm has parsed each chunk lets the pty's flow control pace a flood such as `yes`.
      void pty.output
        .pipeTo(new WritableStream({ write: chunk => new Promise(resolve => this.terminal.write(chunk, resolve)) }))
        .catch(() => {})
      pty.ended.then(end => this.#ended(end), error => this.#failed(error))
      return pty
    }
    catch (error) {
      this.#failed(error)
      throw error
    }
  }

  /** A shell that exits (`exit`, ^D on an empty line) is replaced, so a slip mid-talk never leaves a dead terminal. */
  #ended(end: PtyEnd): void {
    this.#pty = undefined
    if (end.type !== 'exit' && end.type !== 'signal') {
      this.#failed(new Error('Linux has stopped; reload the page to boot it again.'))
      return
    }
    const how = end.type === 'exit' ? `exited with ${end.code}` : `killed by signal ${end.signal}`
    this.terminal.write(`\r\n\x1B[2m[shell ${how}, starting a new one]\x1B[0m\r\n`)
    this.#starting = undefined
    void this.start().catch(() => {})
  }

  #failed(error: unknown): void {
    this.status.value = 'failed'
    const message = error instanceof Error ? error.message : String(error)
    this.terminal.write(`\r\n\x1B[31m${message.replaceAll('\n', '\r\n')}\x1B[0m\r\n`)
  }
}

// Kept across Vite HMR: each session owns a live pty on the one VM.
const sessions: Map<string, ShellSession> = import.meta.hot?.data.sessions ?? shallowReactive(new Map())
if (import.meta.hot)
  import.meta.hot.data.sessions = sessions

/** A terminal is identified by its slide and its name on that slide (`a`, `b`, ...). */
export function sessionKey(page: number, name: string): string {
  return `${page}/${name}`
}

export function useShellSession(key: string): ShellSession {
  let session = sessions.get(key)
  if (!session) {
    session = new ShellSession(key)
    sessions.set(key, session)
  }
  return session
}

export function findShellSession(key: string): ShellSession | undefined {
  return sessions.get(key)
}

function sessionFields(page: number) {
  return (name: string, field: SessionField) => findShellSession(sessionKey(page, name))?.[field].value
}

/** Fill `{a.pts}` / `{a.pid}` from the terminals on the same slide, as far as they are known now. */
export function describeStepText(page: number, text: string): string {
  return resolveSessionRefs(text, sessionFields(page))
}

/** Play a step into terminal `to` of slide `page`, after the terminals its text refers to are running. */
export async function playStep(page: number, to: string, step: StepInput): Promise<void> {
  const referenced = referencedSessions(step.type, step.run)
  await Promise.all(referenced.map(name => useShellSession(sessionKey(page, name)).start()))

  const lookup = sessionFields(page)
  await useShellSession(sessionKey(page, to)).play(stepChunks({
    keys: step.keys,
    type: step.type && resolveSessionRefs(step.type, lookup),
    run: step.run && resolveSessionRefs(step.run, lookup),
  }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
