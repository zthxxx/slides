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
}

export const MANIFEST_FORMAT = 'terminal-glance/disk@1'

/** Decompressed chunks kept in memory; the guest's page cache holds what it reads often anyway. */
const CACHED_CHUNKS = 32
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

  constructor(manifest: DiskManifest, load: ChunkLoader) {
    this.size = manifest.size
    this.identity = `${manifest.format}:${manifest.inputHash}`
    this.#chunkSize = manifest.chunkSize
    this.#chunks = manifest.chunks
    this.#load = load
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
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
      // Map order is the LRU order: move a hit to the end.
      this.#cache.delete(index)
      this.#cache.set(index, cached)
      return cached
    }

    const loading = this.#load(file)
    loading.catch(() => this.#cache.delete(index))
    this.#cache.set(index, loading)
    for (const [oldest] of this.#cache) {
      if (this.#cache.size <= CACHED_CHUNKS)
        break
      this.#cache.delete(oldest)
    }
    if (prefetch) {
      for (let next = index + 1; next <= index + PREFETCH_CHUNKS; next++) {
        if (!this.#cache.has(next))
          this.#chunk(next, false)?.catch(() => {})
      }
    }
    return loading
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

/**
 * The preinstalled-tools disk, with the guest's writes kept in memory only:
 * every page load starts from the published image.
 */
export async function openImageDisk(manifestUrl: URL): Promise<{ disk: CowDisk, manifest: DiskManifest } | undefined> {
  const response = await fetch(manifestUrl)
  // A dev server answers a missing file with its HTML fallback page.
  if (response.status === 404 || !response.headers.get('content-type')?.includes('json'))
    return undefined
  if (!response.ok)
    throw new Error(`${manifestUrl}: HTTP ${response.status}`)
  const manifest = await response.json() as DiskManifest
  if (manifest.format !== MANIFEST_FORMAT)
    throw new Error(`${manifestUrl}: unknown disk format ${JSON.stringify(manifest.format)}`)
  return { disk: new CowDisk(new ChunkedDiskBase(manifest, fetchChunks(manifestUrl))), manifest }
}
