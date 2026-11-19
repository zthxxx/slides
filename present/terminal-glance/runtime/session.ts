import type { Pty, PtyEnd } from 'unkernel/web'
import type { SessionField, StepInput, TimedWrite } from './steps'
import type { ProgramStatus } from './program-status'
import { ref, shallowReactive } from 'vue'
import { playBellSound } from './bell'
import { createEmulator } from './emulator'
import { downloadRestOfDisk, markLinuxUp, useLinux } from './kernel'
import { referencedSessions, resolveSessionRefs, stepChunks, typingPlan } from './steps'

export type SessionStatus = 'idle' | 'starting' | 'running' | 'failed'

/**
 * One shell on its own pty of the shared VM, shown by one terminal emulator.
 * The pty is spawned the first time the terminal is shown, so pty numbers follow the order slides are visited.
 */
export class ShellSession {
  readonly programStatus = ref<ProgramStatus>()
  /** Counts the writes that rang the bell; a terminal shows its bell icon again whenever it grows. */
  readonly bells = ref(0)
  readonly status = ref<SessionStatus>('idle')
  /** The shell has written its first output (its first prompt); stays true when a replacement shell starts. */
  readonly ready = ref(false)
  readonly pts = ref<number>()
  readonly pid = ref<number>()
  /** The element the terminal emulator renders into; a terminal component adopts it. */
  readonly host = document.createElement('div')
  readonly terminal = createEmulator()

  #opening: Promise<void> | undefined
  #pty: Pty | undefined
  #starting: Promise<Pty> | undefined
  #typing: Promise<void> = Promise.resolve()

  constructor(readonly key: string) {
    this.host.className = 'shell-session'
    this.terminal.onData(data => void this.#pty?.write(data))
    this.terminal.onProgramStatus(status => this.programStatus.value = status)
    this.terminal.onBell(() => {
      this.bells.value++
      playBellSound()
    })
    this.terminal.onResize(({ cols, rows }) => this.#pty?.resize(cols, rows))
  }

  /** Render into a visible container; the first call also opens the emulator and starts the shell. */
  async show(container: HTMLElement): Promise<void> {
    if (this.host.parentElement !== container)
      container.append(this.host)
    this.#opening ??= this.terminal.open(this.host)
    await this.#opening
    this.fit()
    void this.start().catch(() => {})
  }

  fit(): void {
    this.terminal.fit()
  }

  start(): Promise<Pty> {
    this.#starting ??= this.#spawn()
    return this.#starting
  }

  /** Play the writes into the shell on their schedule, after any steps still being typed. */
  play(writes: TimedWrite[]): Promise<void> {
    const typing = this.#typing.then(async () => {
      const pty = await this.start()
      // Timed from the start rather than between writes, so a slow write does not stretch the step.
      const start = performance.now()
      for (const { at, text } of writes) {
        const wait = start + at - performance.now()
        if (wait > 0)
          await sleep(wait)
        await pty.write(text)
      }
    })
    this.#typing = typing.catch(() => {})
    return typing
  }

  async #spawn(): Promise<Pty> {
    this.status.value = 'starting'
    try {
      const { vm, notice } = await useLinux()
      if (notice)
        void this.terminal.write(`\x1B[33m${notice}\x1B[0m\r\n`)
      const size = { cols: this.terminal.cols, rows: this.terminal.rows }
      const pty = await vm.spawn(undefined, undefined, size)
      markLinuxUp()
      this.#pty = pty
      // A fit while the pty was spawning could not reach it.
      if (this.terminal.cols !== size.cols || this.terminal.rows !== size.rows)
        pty.resize(this.terminal.cols, this.terminal.rows)
      this.pts.value = pty.pts
      this.pid.value = pty.pid
      this.status.value = 'running'

      // Resolving after the emulator has parsed each chunk lets the pty's flow control pace a flood such as `yes`.
      void pty.output
        .pipeTo(new WritableStream({
          write: (chunk) => {
            if (!this.ready.value) {
              this.ready.value = true
              downloadRestOfDisk()
            }
            return this.terminal.write(chunk)
          },
        }))
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
    this.programStatus.value = undefined
    this.#pty = undefined
    if (end.type !== 'exit' && end.type !== 'signal') {
      this.#failed(new Error('Linux has stopped; reload the page to boot it again.'))
      return
    }
    const how = end.type === 'exit' ? `exited with ${end.code}` : `killed by signal ${end.signal}`
    void this.terminal.write(`\r\n\x1B[2m[shell ${how}, starting a new one]\x1B[0m\r\n`)
    this.#starting = undefined
    void this.start().catch(() => {})
  }

  #failed(error: unknown): void {
    this.status.value = 'failed'
    const message = error instanceof Error ? error.message : String(error)
    void this.terminal.write(`\r\n\x1B[31m${message.replaceAll('\n', '\r\n')}\x1B[0m\r\n`)
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
  await useShellSession(sessionKey(page, to)).play(typingPlan(stepChunks({
    keys: step.keys,
    type: step.type && resolveSessionRefs(step.type, lookup),
    run: step.run && resolveSessionRefs(step.run, lookup),
  })))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
