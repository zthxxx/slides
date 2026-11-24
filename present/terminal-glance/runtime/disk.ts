import type { DiskBase } from 'unkernel/web'
import { BaseDisk, CowDisk } from 'unkernel/web'

/**
 * One published disk image (`image/pack.ts`): split into fixed-size chunks, each gzip-compressed and named by its
 * content hash. A chunk index missing from `chunks` reads as zeros.
 */
export interface PackedImage {
  size: number
  chunkSize: number
  encoding: 'gzip'
  chunks: Record<string, string>
  /**
   * The chunks the guest reads from power-on to zsh's first prompt, in the order it first reads them,
   * recorded by `image/vm/trace-boot.ts`.
   */
  boot?: number[]
  /**
   * The bytes the guest reads up to its first prompt, rounded to blocks, in one gzip file (`image/pack.ts`
   * `writeBootBundle`): the blocks of `runs` (`[first block, block count]`, ascending), each `blockSize` long.
   */
  bootBundle?: { file: string, blockSize: number, runs: Array<[number, number]> }
}

/**
 * `linux/manifest.json`, written by `image/build.ts`: the preinstalled-tools data disk (the top level) and unkernel's
 * distro image (`distro`). The kernel's base initramfs mounts the distro image (labelled `kwroot`) read-only as the
 * root's lower layer, and the data disk (labelled `kwdata`) at /data, whose `/data/distros/<name>/upper` holds the
 * preinstalled tools as the root's upper layer.
 */
export interface DiskManifest extends PackedImage {
  format: typeof MANIFEST_FORMAT
  label: string
  /** The unkernel package version the disk was provisioned with; its release published the distro image. */
  unkernel: string
  inputHash: string
  distro: PackedImage & {
    /** `/usr/lib/kw-distro`, e.g. `alpine`. */
    name: string
    /** `/usr/lib/kw-image`, the image id the data disk's upper layer was provisioned on. */
    image: string
    sha256: string
  }
}

export const MANIFEST_FORMAT = 'terminal-glance/disk@2'

/**
 * Decompressed chunks kept in memory, besides prefetched ones the guest has not read yet;
 * the guest's page cache holds what it reads often anyway.
 */
const CACHED_CHUNKS = 32
/** Boot chunks fetched at once: enough to keep a high-latency link busy, few enough not to starve the kernel's own download. */
export const BOOT_PREFETCH_CONCURRENCY = 6
/** Chunks fetched ahead of a missed read, so a sequential read (a binary starting) is pipelined. */
const PREFETCH_CHUNKS = 2

/**
 * Loads a chunk by its manifest path and returns the raw (decompressed) bytes. `low` marks a download made ahead of
 * need (the boot bundle, boot chunks), which should yield to the page's own scripts and styles; a chunk the guest is
 * waiting for has the default priority.
 */
export type ChunkLoader = (file: string, priority?: 'low') => Promise<Uint8Array>

/** A read-only disk image loaded one chunk at a time, the first time the guest reads inside it. */
export class ChunkedDiskBase implements DiskBase {
  readonly size: number
  readonly identity: string
  readonly #chunkSize: number
  readonly #chunks: Record<string, string>
  readonly #load: ChunkLoader
  readonly #cache = new Map<number, Promise<Uint8Array>>()
  /** Chunks queued by prefetch() and not started yet: a guest read starts its chunk at once instead of fetching it again. */
  readonly #queued = new Map<number, () => void>()
  /** Prefetched chunks the guest has not read yet: never evicted, so none is downloaded twice. */
  readonly #unread = new Set<number>()
  readonly #manifest: PackedImage
  /** Each boot-bundle block's offset in the bundle file. */
  readonly #bundled = new Map<number, number>()
  #bundle: Promise<Uint8Array> | undefined

  /** `identity` names the image's content for unkernel's disk snapshots, which the deck does not take. */
  constructor(manifest: PackedImage, load: ChunkLoader, identity = `chunked:${manifest.size}`) {
    this.size = manifest.size
    this.identity = identity
    this.#chunkSize = manifest.chunkSize
    this.#chunks = manifest.chunks
    this.#load = load
    this.#manifest = manifest
    let rank = 0
    for (const [first, count] of manifest.bootBundle?.runs ?? []) {
      for (let block = first; block < first + count; block++)
        this.#bundled.set(block, rank++ * manifest.bootBundle!.blockSize)
    }
  }

  /**
   * Starts downloading what the guest reads up to its first prompt: the boot bundle (one file) when the manifest
   * has one, else, or when the bundle fails, the boot chunks, `concurrency` at a time.
   */
  async prefetchBoot(concurrency: number): Promise<void> {
    if (this.#bundled.size) {
      try {
        await this.#loadBundle()
        return
      }
      catch {
        // The chunks hold the same bytes.
      }
    }
    await this.prefetch(this.#manifest.boot ?? [], concurrency)
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
      this.#unread.add(index)
      this.#remember(index, started.then(() => this.#load(file, 'low')))
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
      this.#unread.delete(index)
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
    this.#bundle ??= this.#load(file, 'low').catch((error: unknown) => {
      // Reads then go to the chunks for good.
      this.#bundled.clear()
      throw error
    })
    return this.#bundle
  }

  #remember(index: number, loading: Promise<Uint8Array>): void {
    loading.catch(() => {
      if (this.#cache.get(index) !== loading)
        return
      this.#cache.delete(index)
      this.#unread.delete(index)
    })
    this.#cache.set(index, loading)
    // Unread chunks are all in the cache and stay; the others are held to CACHED_CHUNKS, oldest out first.
    for (const [oldest] of this.#cache) {
      if (this.#cache.size - this.#unread.size <= CACHED_CHUNKS)
        break
      if (!this.#unread.has(oldest))
        this.#cache.delete(oldest)
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

/**
 * Why a file is fetched: the guest waits for it (`need`), the boot will read it (`ahead`), or the rest of the image
 * is being downloaded while nothing waits (`background`).
 */
export type FetchReason = 'need' | 'ahead' | 'background'

/** Fetches one published file (a chunk or the boot bundle) by its manifest path; resolves to its bytes as published. */
export type FileFetcher = (file: string, reason: FetchReason) => Promise<Uint8Array<ArrayBuffer>>

/**
 * The images' published files, each fetched once and kept as published (gzip): both images are 24 MiB this way,
 * against 91 MiB decompressed, and no chunk the guest has evicted from its cache is downloaded again.
 */
export class ImageFiles {
  readonly #fetch: FileFetcher
  readonly #files = new Map<string, Promise<Uint8Array<ArrayBuffer>>>()

  constructor(fetchFile: FileFetcher) {
    this.#fetch = fetchFile
  }

  /** A ChunkLoader: the file's decompressed bytes, fetched the first time only. */
  readonly load: ChunkLoader = async (file, priority) => decodeChunk(await this.published(file, priority))

  /** The file's bytes as published, fetched the first time only; `low` marks a download made ahead of need. */
  published(file: string, priority?: 'low'): Promise<Uint8Array<ArrayBuffer>> {
    return this.#get(file, priority ? 'ahead' : 'need')
  }

  /**
   * Fetches every listed file not fetched yet, `concurrency` at a time, in the given order. A guest read of a file
   * in flight waits for that fetch. Resolves when all have settled; a failed file is fetched again when read.
   */
  async downloadAll(files: readonly string[], concurrency: number): Promise<void> {
    const queue = [...new Set(files)]
    let next = 0
    const lane = async (): Promise<void> => {
      while (next < queue.length)
        await this.#get(queue[next++], 'background').catch(() => {})
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane))
  }

  #get(file: string, reason: FetchReason): Promise<Uint8Array<ArrayBuffer>> {
    let fetching = this.#files.get(file)
    if (!fetching) {
      const started = this.#fetch(file, reason)
      started.catch(() => {
        if (this.#files.get(file) === started)
          this.#files.delete(file)
      })
      this.#files.set(file, started)
      fetching = started
    }
    return fetching
  }
}

/** Files of the background download fetched at once: enough to finish soon, few enough to leave a guest read room. */
export const BACKGROUND_CONCURRENCY = 2

/** Both images as unkernel disks, reading their files through `load`, on the page's thread or in the kernel's worker. */
export interface ImageDisks {
  /** The data disk, with the guest's writes kept in memory only. */
  disk: CowDisk
  /** The distro image, read-only: unkernel's `createKernel({ distro })`. */
  distro: BaseDisk
  /**
   * Settles once what the guest reads up to its first prompt, from both images, has downloaded (or failed,
   * leaving reads to fetch it).
   */
  bootData: Promise<void>
}

/**
 * The preinstalled-tools disk and the distro image under it. Every page load starts from the published images: the
 * guest's writes stay in memory. What the guest reads up to its first prompt starts loading at once, before the
 * kernel exists: on a high-latency link the guest would otherwise wait one round trip per chunk it reads.
 */
export function openImageDisks(manifest: DiskManifest, load: ChunkLoader): ImageDisks {
  const data = new ChunkedDiskBase(manifest, load, `${manifest.format}:${manifest.inputHash}`)
  const distro = new ChunkedDiskBase(manifest.distro, load, `distro:${manifest.distro.sha256}`)
  const bootData = Promise.all([
    data.prefetchBoot(BOOT_PREFETCH_CONCURRENCY),
    distro.prefetchBoot(BOOT_PREFETCH_CONCURRENCY),
  ]).then(() => {}, () => {})
  return { disk: new CowDisk(data), distro: new BaseDisk(distro), bootData }
}

/**
 * Every published chunk of both images, each in disk order, the distro image's first: it is small, and every program
 * reads its C library from it.
 */
export function imageChunkFiles(manifest: DiskManifest): string[] {
  return [manifest.distro, manifest].flatMap(image =>
    Object.entries(image.chunks).sort(([a], [b]) => Number(a) - Number(b)).map(([, file]) => file))
}
