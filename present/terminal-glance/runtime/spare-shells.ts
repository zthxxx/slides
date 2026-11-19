import type { QueriedColors } from './queries'
import { concatBytes, QueryResponder, withoutQueries } from './queries'

/**
 * Shells started ahead of the terminals that will show them. zsh takes 0.4 to 0.6 s to its first prompt in the VM,
 * and two at once about 1 s (they share one CPU), so a terminal that spawned its shell when shown would wait that
 * long. A spare is a shell already at its prompt: a terminal takes one and shows its prompt in the next frame.
 *
 * While nobody shows it, a spare answers its shell's start-up queries itself (jovial asks for the background color
 * and waits for the answer) and holds its output. Handed to a terminal, it is resized to the terminal, and the
 * terminal reads the held output, without the queries answered already, then the shell's output as it comes.
 */

/** The part of unkernel's `Pty` a spare uses. Source: unkernel@0.1.0-261117-0e4b2ec `dist/_chunks/index.d.mts` (`Pty`). */
export interface SparePty {
  readonly output: ReadableStream<Uint8Array>
  /** Settles once the shell has ended and its output has been read to the end. */
  readonly ended: Promise<unknown>
  write: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => void
  close: () => Promise<void>
}

export interface TerminalSize {
  cols: number
  rows: number
}

export interface SpareShellsOptions<P extends SparePty> {
  /** Starts a shell on a new pty of the VM. */
  spawn: (size: TerminalSize) => Promise<P>
  /** The colors to answer the shells' color queries with: the terminals' current ones. */
  colors: () => QueriedColors
  /** Resolves when the page has a moment to spare; each spare starts after one. */
  whenIdle: () => Promise<void>
  /** Output by which a shell says it has finished starting (SHELL_SETTLED_MARK). */
  settledMark: string
  /** A shell that never prints the mark counts as started after this long. */
  settleTimeoutMs: number
  /** How long a spare handed to a terminal waits for its shell to redraw at the terminal's size. */
  redrawWaitMs: number
  capacity: number
  /**
   * The size spares start at. Smaller than any terminal, so handing a spare over always changes its size: the shell
   * then redraws its prompt for that width (SIGWINCH), and the held prompt never wraps in a wider terminal.
   */
  size: TerminalSize
}

/** A spare's shell, as a terminal takes it over. */
export interface HandedOverShell<P extends SparePty> {
  pty: P
  /** Read this instead of `pty.output`: the held output first, then the rest. */
  output: ReadableStream<Uint8Array>
}

/**
 * `.zshrc` (image/guest/rootfs/root/.zshrc) prints this iTerm2 SetUserVar once zinit's turbo loads have run, which
 * zsh does at its prompt without reading keys: after it, the shell takes typed keys at once.
 */
export const SHELL_SETTLED_MARK = '\x1B]1337;SetUserVar=terminal_glance_boot=cGx1Z2lucw==\x07'

export class SpareShells<P extends SparePty> {
  readonly #options: SpareShellsOptions<P>
  /** Oldest first, so a terminal takes the one furthest along. */
  readonly #spares: Array<Spare<P>> = []
  #filling = false
  /** A spare's shell ended on its own before it finished starting: spawning more would likely repeat that. */
  #broken = false

  constructor(options: SpareShellsOptions<P>) {
    this.#options = options
  }

  get count(): number {
    return this.#spares.length
  }

  /** Keeps `capacity` spares, starting one at a time, each once the one before has settled and the page is idle. */
  fill(): void {
    if (this.#filling || this.#broken)
      return
    this.#filling = true
    void this.#fill().catch(() => {}).finally(() => this.#filling = false)
  }

  /** The oldest spare, resized to the terminal's `size`; undefined when there is none. Starts a replacement. */
  take(size: TerminalSize): Promise<HandedOverShell<P>> | undefined {
    const spare = this.#spares.shift()
    if (!spare)
      return undefined
    this.fill()
    return spare.handOver(size, this.#options.redrawWaitMs)
  }

  /** Closes every spare, as when their shells picked colors the terminals no longer have, and starts new ones. */
  retire(): void {
    for (const spare of this.#spares.splice(0)) {
      spare.retired = true
      void spare.pty.close().catch(() => {})
    }
    this.fill()
  }

  async #fill(): Promise<void> {
    const options = this.#options
    while (this.#spares.length < options.capacity && !this.#broken) {
      await options.whenIdle()
      if (this.#spares.length >= options.capacity)
        break
      const spare = new Spare(await options.spawn(options.size), options)
      this.#spares.push(spare)
      spare.pty.ended.catch(() => {}).finally(() => {
        const index = this.#spares.indexOf(spare)
        if (index >= 0)
          this.#spares.splice(index, 1)
      })
      // One at a time: shells starting together share the VM's CPU, and so does a terminal's shell in use.
      await spare.settled
      if (spare.endedUnsettled && !spare.retired && !spare.handedOver)
        this.#broken = true
    }
  }
}

class Spare<P extends SparePty> {
  /** Resolves when the shell has printed the settled mark, has ended, or after the settle timeout. */
  readonly settled: Promise<void>
  readonly output: ReadableStream<Uint8Array>
  endedUnsettled = false
  retired = false
  /** Taken by a terminal: its shell is that terminal's now, and may end on a command typed there. */
  handedOver = false

  readonly #held: Uint8Array[] = []
  #controller!: TransformStreamDefaultController<Uint8Array>
  #onOutput: (() => void) | undefined

  constructor(readonly pty: P, options: SpareShellsOptions<P>) {
    let settle!: () => void
    let isSettled = false
    this.settled = new Promise<void>(resolve => settle = () => {
      isSettled = true
      clearTimeout(timer)
      resolve()
    })
    const timer = setTimeout(settle, options.settleTimeoutMs)
    pty.ended.catch(() => {}).finally(() => {
      if (!isSettled)
        this.endedUnsettled = true
      settle()
    })

    const mark = new MarkWatcher(options.settledMark)
    const queries = new QueryResponder(reply => void pty.write(reply).catch(() => {}), options.colors)
    this.output = pty.output.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(
      {
        start: controller => void (this.#controller = controller),
        transform: (chunk, controller) => {
          if (!isSettled && mark.seen(chunk))
            settle()
          if (this.handedOver)
            return controller.enqueue(chunk)
          queries.scan(chunk)
          this.#held.push(chunk)
          this.#onOutput?.()
        },
      },
      undefined,
      // Room for one chunk keeps the pipe from pty.output running while nobody reads `output` (a TransformStream
      // with none applies backpressure from the start), and paces the shell by the terminal once handed over.
      new CountQueuingStrategy({ highWaterMark: 1 }),
    ))
  }

  async handOver(size: TerminalSize, redrawWaitMs: number): Promise<HandedOverShell<P>> {
    const output = new Promise<void>(resolve => this.#onOutput = resolve)
    this.pty.resize(size.cols, size.rows)
    // The redraw and the held prompt reach the terminal together, so the prompt at the spare's width never shows.
    await Promise.race([output, sleep(redrawWaitMs)])
    this.handedOver = true
    const held = withoutQueries(concatBytes(this.#held.splice(0)))
    if (held.length)
      this.#controller.enqueue(held)
    return { pty: this.pty, output: this.output }
  }
}

/** Finds `mark` in a stream of chunks, also when a chunk boundary splits it. */
export class MarkWatcher {
  #tail = ''
  readonly #mark: string

  constructor(mark: string) {
    this.#mark = mark
  }

  seen(chunk: Uint8Array): boolean {
    const text = this.#tail + LATIN1.decode(chunk)
    this.#tail = text.slice(Math.max(0, text.length - this.#mark.length + 1))
    return text.includes(this.#mark)
  }
}

const LATIN1 = new TextDecoder('latin1')

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
