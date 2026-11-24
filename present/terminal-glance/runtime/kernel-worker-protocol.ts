import type { PtyEnd } from 'unkernel/web'
import type { DiskManifest } from './disk'

/**
 * The messages between the page and `kernel-worker.ts`, the Web Worker that runs the kernel when the page boots it
 * on several CPUs (`kernel.ts`). The worker reads the images' files through the page (`load` / `file`), which
 * fetches them; each pty's output crosses as a transferred stream, so the pty's flow control spans both threads.
 */
export type ToWorker =
  /** Open both images and start loading what the boot reads. */
  | { type: 'images', manifest: DiskManifest }
  | { type: 'boot', kernel: WebAssembly.Module, memoryMiB: number, cpus: number }
  /** A file the worker asked for (`load`), as published, or why it could not be fetched. */
  | { type: 'file', id: number, bytes?: Uint8Array<ArrayBuffer>, error?: string }
  | { type: 'spawn', id: number, cols: number, rows: number, user: string }
  | { type: 'write', id: number, seq: number, data: string | Uint8Array }
  | { type: 'resize', id: number, cols: number, rows: number }

export type FromWorker =
  | { type: 'load', id: number, file: string, priority?: 'low' }
  /** What the boot reads from both images has loaded (or failed, leaving reads to fetch it). */
  | { type: 'bootData' }
  | { type: 'booted', cpus: number }
  | { type: 'bootFailed', message: string }
  | { type: 'spawned', id: number, pid: number, pts: number, output: ReadableStream<Uint8Array> }
  | { type: 'spawnFailed', id: number, message: string }
  | { type: 'written', id: number, seq: number, error?: string }
  | { type: 'ended', id: number, end: PtyEnd }
