import type { PtyEnd } from 'unkernel/web'
import type { ImageSource } from './image-source'
import type { FromWorker, ToWorker } from './kernel-worker-protocol'

/** The part of unkernel's `Pty` the terminals use (`session.ts`), whichever thread runs the kernel. */
export interface ShellPty {
  readonly pid: number
  readonly pts: number
  readonly output: ReadableStream<Uint8Array>
  readonly ended: Promise<PtyEnd>
  write: (data: Uint8Array | string) => Promise<void>
  resize: (cols: number, rows: number) => void
}

export interface SpawnSize {
  cols: number
  rows: number
}

/** The part of unkernel's `KernelInstance` the terminals use: a login shell on a new pty. */
export interface LinuxVm {
  spawn: (file: undefined, args: undefined, options: SpawnSize & { user: string }) => Promise<ShellPty>
}

/**
 * The page's side of `kernel-worker.ts`: starts the worker, gives it the images' files from `source` (fetched here,
 * where index.html's preloads and the progress bar are), and makes its ptys look like unkernel's.
 */
export class KernelWorkerHost {
  /** Settles once what the boot reads from both images has loaded in the worker. */
  readonly bootData: Promise<void>
  readonly #worker: Worker
  readonly #source: ImageSource
  readonly #spawning = new Map<number, { resolve: (pty: ShellPty) => void, reject: (error: Error) => void, ended: Promise<PtyEnd> }>()
  readonly #ending = new Map<number, (end: PtyEnd) => void>()
  readonly #writes = new Map<string, { resolve: () => void, reject: (error: Error) => void }>()
  #booted: { resolve: (cpus: number) => void, reject: (error: Error) => void } | undefined
  #nextPty = 0
  #nextWrite = 0
  #bootDataDone!: () => void

  constructor(source: ImageSource) {
    this.#source = source
    this.bootData = new Promise(resolve => this.#bootDataDone = resolve)
    this.#worker = new Worker(new URL('./kernel-worker.ts', import.meta.url), { type: 'module', name: 'linux' })
    this.#worker.onmessage = ({ data }: MessageEvent<FromWorker>) => this.#receive(data)
    this.#worker.onerror = (event) => {
      event.preventDefault()
      this.#fail(new Error(`Linux's worker failed: ${event.message || 'unknown error'}`))
    }
    this.#post({ type: 'images', manifest: source.manifest })
  }

  /** Boots the kernel in the worker; resolves to the CPUs it got. */
  boot(kernel: WebAssembly.Module, memoryMiB: number, cpus: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.#booted = { resolve, reject }
      this.#post({ type: 'boot', kernel, memoryMiB, cpus })
    })
  }

  readonly vm: LinuxVm = {
    spawn: (_file, _args, { cols, rows, user }) => new Promise<ShellPty>((resolve, reject) => {
      const id = this.#nextPty++
      // Exists from the request on: a worker that dies before `spawned` still ends the shell.
      const ended = new Promise<PtyEnd>(end => this.#ending.set(id, end))
      this.#spawning.set(id, { resolve, reject, ended })
      this.#post({ type: 'spawn', id, cols, rows, user })
    }),
  }

  #receive(message: FromWorker): void {
    switch (message.type) {
      case 'load': {
        const { id, file, priority } = message
        this.#source.files.published(file, priority).then(
          // A copy crosses: the page keeps the published bytes for the next read and the background download.
          (bytes) => {
            const copy = bytes.slice()
            this.#post({ type: 'file', id, bytes: copy }, [copy.buffer])
          },
          error => this.#post({ type: 'file', id, error: String((error as Error)?.message ?? error) }),
        )
        break
      }
      case 'bootData':
        this.#bootDataDone()
        break
      case 'booted':
        this.#booted?.resolve(message.cpus)
        break
      case 'bootFailed':
        this.#booted?.reject(new Error(message.message))
        break
      case 'spawned': {
        const pending = this.#spawning.get(message.id)
        this.#spawning.delete(message.id)
        if (pending)
          pending.resolve(this.#pty(message.id, message.pid, message.pts, message.output, pending.ended))
        break
      }
      case 'spawnFailed': {
        const pending = this.#spawning.get(message.id)
        this.#spawning.delete(message.id)
        this.#ending.delete(message.id)
        pending?.reject(new Error(message.message))
        break
      }
      case 'written': {
        const key = `${message.id}:${message.seq}`
        const pending = this.#writes.get(key)
        this.#writes.delete(key)
        if (message.error)
          pending?.reject(new Error(message.error))
        else
          pending?.resolve()
        break
      }
      case 'ended':
        this.#ending.get(message.id)?.(message.end)
        this.#ending.delete(message.id)
        break
    }
  }

  #pty(id: number, pid: number, pts: number, output: ReadableStream<Uint8Array>, ended: Promise<PtyEnd>): ShellPty {
    return {
      pid,
      pts,
      output,
      ended,
      write: data => new Promise<void>((resolve, reject) => {
        const seq = this.#nextWrite++
        this.#writes.set(`${id}:${seq}`, { resolve, reject })
        this.#post({ type: 'write', id, seq, data })
      }),
      resize: (cols, rows) => this.#post({ type: 'resize', id, cols, rows }),
    }
  }

  /** The worker died: the boot, pending spawns and writes fail, and every shell ends as lost. */
  #fail(error: Error): void {
    this.#booted?.reject(error)
    for (const { reject } of this.#spawning.values())
      reject(error)
    this.#spawning.clear()
    for (const { reject } of this.#writes.values())
      reject(error)
    this.#writes.clear()
    for (const ended of this.#ending.values())
      ended({ type: 'lost' })
    this.#ending.clear()
  }

  #post(message: ToWorker, transfer: Transferable[] = []): void {
    this.#worker.postMessage(message, transfer)
  }
}
