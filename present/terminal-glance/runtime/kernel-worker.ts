/// <reference lib="webworker" />
import type { KernelInstance, Pty } from 'unkernel/web'
import type { FromWorker, ToWorker } from './kernel-worker-protocol'
import { createKernel } from 'unkernel/web'
import { decodeChunk, openImageDisks } from './disk'

/**
 * The kernel on several CPUs. unkernel runs each CPU in a thread of its own on one shared memory, and a CPU blocks
 * while it waits for another, which a page's main thread may not: an SMP kernel needs a worker of a cross-origin
 * isolated page (unkernel@0.2.0-261124-c08e977 `webCpuBlocker`, `CreateKernelOptions.cpus`). unkernel's own worker
 * mode (`worker: true`) takes disks as specs only, which the deck's chunked images are not, so this worker runs
 * unkernel inline, with the same disks as the page's single-CPU path (`disk.ts`), and serves its ptys to the page.
 * Protocol: `kernel-worker-protocol.ts`; the page's side: `kernel-worker-host.ts`.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer)
}

let disks: ReturnType<typeof openImageDisks> | undefined
let machine: Promise<KernelInstance> | undefined
const ptys = new Map<number, Pty>()
const loads = new Map<number, { resolve: (bytes: Uint8Array<ArrayBuffer>) => void, reject: (error: Error) => void }>()
let nextLoad = 0

/** A ChunkLoader that asks the page for the file, as published, and decompresses it here. */
async function load(file: string, priority?: 'low'): Promise<Uint8Array> {
  const id = nextLoad++
  const published = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    loads.set(id, { resolve, reject })
    post({ type: 'load', id, file, priority })
  })
  return decodeChunk(published)
}

async function spawn(id: number, cols: number, rows: number, user: string): Promise<void> {
  try {
    const pty = await (await machine!).spawn(undefined, undefined, { cols, rows, user })
    ptys.set(id, pty)
    void pty.ended.then((end) => {
      ptys.delete(id)
      post({ type: 'ended', id, end })
    })
    post({ type: 'spawned', id, pid: pty.pid, pts: pty.pts, output: pty.output }, [pty.output])
  }
  catch (error) {
    post({ type: 'spawnFailed', id, message: String((error as Error)?.message ?? error) })
  }
}

scope.onmessage = ({ data: message }: MessageEvent<ToWorker>) => {
  switch (message.type) {
    case 'images':
      disks = openImageDisks(message.manifest, load)
      void disks.bootData.then(() => post({ type: 'bootData' }))
      break
    case 'boot':
      machine = createKernel({
        kernel: message.kernel,
        distro: disks!.distro,
        disks: [disks!.disk],
        memoryMiB: message.memoryMiB,
        cpus: message.cpus,
      })
      machine.then(
        vm => post({ type: 'booted', cpus: vm.stats().cpus }),
        error => post({ type: 'bootFailed', message: String((error as Error)?.message ?? error) }),
      )
      break
    case 'file': {
      const pending = loads.get(message.id)
      loads.delete(message.id)
      if (message.bytes)
        pending?.resolve(message.bytes)
      else
        pending?.reject(new Error(message.error ?? 'no bytes'))
      break
    }
    case 'spawn':
      void spawn(message.id, message.cols, message.rows, message.user)
      break
    case 'write': {
      const { id, seq } = message
      const pty = ptys.get(id)
      if (!pty) {
        post({ type: 'written', id, seq, error: 'the pty has ended' })
        break
      }
      pty.write(message.data).then(
        () => post({ type: 'written', id, seq }),
        error => post({ type: 'written', id, seq, error: String((error as Error)?.message ?? error) }),
      )
      break
    }
    case 'resize':
      ptys.get(message.id)?.resize(message.cols, message.rows)
      break
  }
}
