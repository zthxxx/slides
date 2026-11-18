import type { DiskBase } from 'unkernel/web'
import { CowDisk } from 'unkernel/web'

/**
 * `linux/manifest.json`, written by `image/build.ts`: the preinstalled-tools data disk
 * split into fixed-size chunks, each gzip-compressed and named by its content hash.
 * A chunk index missing from `chunks` reads as zeros.
 */
export interface DiskManifest {
  format: typeof MANIFEST_FORMAT
  /** ext4 label; unkernel's /init mounts the disk labelled `kwdata` and overlays / with it. */
  label: string
  /** The unkernel package version the disk was provisioned with; its overlay sits on that version's initramfs. */
  unkernel: string
  inputHash: string
  size: number
  chunkSize: number
  encoding: 'gzip'
  chunks: Record<string, string>
  /**
   * The chunks the guest reads from power-on to zsh's first prompt, in the order it first reads them,
   * recorded by `image/vm/trace-boot.ts`. Missing in manifests built before it existed.
   */
  boot?: number[]
  /**
   * The bytes the guest reads up to its first prompt, rounded to blocks, in one gzip file (`image/pack.ts`
   * `writeBootBundle`): the blocks of `runs` (`[first block, block count]`, ascending), each `blockSize` long.
   */
  bootBundle?: { file: string, blockSize: number, runs: Array<[number, number]> }
}

export const MANIFEST_FORMAT = 'terminal-glance/disk@1'

/** Decompressed chunks kept in memory; the guest's page cache holds what it reads often anyway. */
const CACHED_CHUNKS = 32
/** Room kept for chunks read after boot, on top of the boot chunks, which must not be evicted before the guest reads them. */
const CACHE_HEADROOM = 8
/** Boot chunks fetched at once: enough to keep a high-latency link busy, few enough not to starve the kernel's own download. */
export const BOOT_PREFETCH_CONCURRENCY = 6
/** Chunks fetched ahead of a missed read, so a sequential read (a binary starting) is pipelined. */
const PREFETCH_CHUNKS = 2

/** Loads a chunk by its manifest path and returns the raw (decompressed) bytes. */
export type ChunkLoader = (file: string) => Promise<Uint8Array>

/** A read-only disk image loaded one chunk at a time, the first time the guest reads inside it. */
export class ChunkedDiskBase implements DiskBase {
  readonly size: number
  readonly identity: string
  readonly #chunkSize: number
  readonly #chunks: Record<string, string>
  readonly #load: ChunkLoader
  readonly #cache = new Map<number, Promise<Uint8Array>>()
  readonly #capacity: number
  /** Chunks queued by prefetch() and not started yet: a guest read starts its chunk at once instead of fetching it again. */
  readonly #queued = new Map<number, () => void>()
  readonly #manifest: DiskManifest
  /** Each boot-bundle block's offset in the bundle file. */
  readonly #bundled = new Map<number, number>()
  #bundle: Promise<Uint8Array> | undefined

  constructor(manifest: DiskManifest, load: ChunkLoader) {
    this.size = manifest.size
    this.identity = `${manifest.format}:${manifest.inputHash}`
    this.#chunkSize = manifest.chunkSize
    this.#chunks = manifest.chunks
    this.#load = load
    this.#capacity = Math.max(CACHED_CHUNKS, (manifest.boot?.length ?? 0) + CACHE_HEADROOM)
    this.#manifest = manifest
    let rank = 0
    for (const [first, count] of manifest.bootBundle?.runs ?? []) {
      for (let block = first; block < first + count; block++)
        this.#bundled.set(block, rank++ * manifest.bootBundle!.blockSize)
    }
  }

  /**
   * Starts downloading what the guest reads up to its first prompt: the boot bundle (one file) when the manifest
   * has one, else the boot chunks, `concurrency` at a time.
   */
  prefetchBoot(concurrency: number): Promise<void> {
    if (this.#bundled.size)
      return this.#loadBundle().then(() => {}, () => {})
    return this.prefetch(this.#manifest.boot ?? [], concurrency)
  }

  /**
   * Fetches chunks ahead of the guest, `concurrency` at a time, in the given order. Every listed chunk is entered
   * in the cache at once, so a guest read of one waits on that entry (and starts it, when still queued) instead
   * of issuing a second fetch. Resolves when all have settled; a failed chunk is fetched again when read.
   */
  async prefetch(indices: readonly number[], concurrency: number): Promise<void> {
    const queue: number[] = []
    for (const index of new Set(indices)) {
      const file = this.#chunks[index]
      if (!file || this.#cache.has(index))
        continue
      let start!: () => void
      const started = new Promise<void>(resolve => start = resolve)
      this.#queued.set(index, () => {
        this.#queued.delete(index)
        start()
      })
      this.#remember(index, started.then(() => this.#load(file)))
      queue.push(index)
    }

    let next = 0
    const lane = async (): Promise<void> => {
      while (next < queue.length) {
        const index = queue[next++]
        this.#queued.get(index)?.()
        await this.#cache.get(index)?.catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane))
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const bundled = this.#readBundle(offset, length)
    if (bundled) {
      try {
        return await bundled
      }
      catch {
        // A failed bundle leaves the chunks, which hold the same bytes.
      }
    }
    const out = new Uint8Array(length)
    const first = Math.floor(offset / this.#chunkSize)
    const last = Math.floor((offset + length - 1) / this.#chunkSize)
    const reads: Promise<void>[] = []
    for (let index = first; index <= last; index++) {
      const chunk = this.#chunk(index)
      if (!chunk)
        continue
      const chunkStart = index * this.#chunkSize
      const start = Math.max(offset, chunkStart)
      const end = Math.min(offset + length, chunkStart + this.#chunkSize)
      reads.push(chunk.then(bytes => out.set(bytes.subarray(start - chunkStart, end - chunkStart), start - offset)))
    }
    await Promise.all(reads)
    return out
  }

  #chunk(index: number, prefetch = true): Promise<Uint8Array> | undefined {
    const file = this.#chunks[index]
    if (!file)
      return undefined

    const cached = this.#cache.get(index)
    if (cached) {
      this.#queued.get(index)?.()
      // Map order is the LRU order: move a hit to the end.
      this.#cache.delete(index)
      this.#cache.set(index, cached)
      return cached
    }

    const loading = this.#load(file)
    this.#remember(index, loading)
    if (prefetch) {
      for (let next = index + 1; next <= index + PREFETCH_CHUNKS; next++) {
        if (!this.#cache.has(next))
          this.#chunk(next, false)?.catch(() => {})
      }
    }
    return loading
  }

  /** A read the boot bundle covers entirely, served from it; undefined when any of its blocks is missing from it. */
  #readBundle(offset: number, length: number): Promise<Uint8Array> | undefined {
    const blockSize = this.#manifest.bootBundle?.blockSize
    if (!blockSize || !this.#bundled.size || length <= 0)
      return undefined
    const first = Math.floor(offset / blockSize)
    const last = Math.floor((offset + length - 1) / blockSize)
    for (let block = first; block <= last; block++) {
      if (!this.#bundled.has(block))
        return undefined
    }
    return this.#loadBundle().then((bundle) => {
      const out = new Uint8Array(length)
      for (let block = first; block <= last; block++) {
        const start = Math.max(offset, block * blockSize)
        const end = Math.min(offset + length, (block + 1) * blockSize)
        const at = this.#bundled.get(block)! + start - block * blockSize
        out.set(bundle.subarray(at, at + end - start), start - offset)
      }
      return out
    })
  }

  #loadBundle(): Promise<Uint8Array> {
    const file = this.#manifest.bootBundle?.file
    if (!file)
      return Promise.reject(new Error('no boot bundle'))
    this.#bundle ??= this.#load(file).catch((error: unknown) => {
      // Reads then go to the chunks for good.
      this.#bundled.clear()
      throw error
    })
    return this.#bundle
  }

  #remember(index: number, loading: Promise<Uint8Array>): void {
    loading.catch(() => {
      if (this.#cache.get(index) === loading)
        this.#cache.delete(index)
    })
    this.#cache.set(index, loading)
    for (const [oldest] of this.#cache) {
      if (this.#cache.size <= this.#capacity)
        break
      this.#cache.delete(oldest)
      // An evicted chunk still queued is started anyway; its lane awaits a promise nobody else holds.
      this.#queued.get(oldest)?.()
    }
  }
}

/** Chunk bytes as published (`encoding: "gzip"`); a server may already have decoded them (`Content-Encoding: gzip`). */
export async function decodeChunk(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (bytes[0] !== 0x1F || bytes[1] !== 0x8B)
    return bytes
  const gunzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(gunzipped).arrayBuffer())
}

function fetchChunks(manifestUrl: URL): ChunkLoader {
  return async (file) => {
    const url = new URL(file, manifestUrl)
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`disk chunk ${url}: HTTP ${response.status}`)
    return decodeChunk(new Uint8Array(await response.arrayBuffer()))
  }
}

export interface ImageDisk {
  disk: CowDisk
  manifest: DiskManifest
}

/**
 * The preinstalled-tools disk, with the guest's writes kept in memory only:
 * every page load starts from the published image.
 * What the guest reads up to its first prompt starts downloading as soon as the manifest is read, before the
 * kernel exists: on a high-latency link the guest would otherwise wait one round trip per chunk it reads.
 */
export async function openImageDisk(manifestUrl: URL): Promise<ImageDisk | undefined> {
  const response = await fetch(manifestUrl)
  // A dev server answers a missing file with its HTML fallback page.
  if (response.status === 404 || !response.headers.get('content-type')?.includes('json'))
    return undefined
  if (!response.ok)
    throw new Error(`${manifestUrl}: HTTP ${response.status}`)
  const manifest = await response.json() as DiskManifest
  if (manifest.format !== MANIFEST_FORMAT)
    throw new Error(`${manifestUrl}: unknown disk format ${JSON.stringify(manifest.format)}`)
  const base = new ChunkedDiskBase(manifest, fetchChunks(manifestUrl))
  void base.prefetchBoot(BOOT_PREFETCH_CONCURRENCY)
  return { disk: new CowDisk(base), manifest }
}
