import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The published form of the guest disk, read by runtime/disk.ts:
 * chunk i holds bytes [i * chunkSize, min(size, (i + 1) * chunkSize)) of the disk, gzip-compressed,
 * stored by content (`chunks/<first 16 hex of sha256(raw)>.gz`, so equal chunks are stored once);
 * chunks that are all zeros are left out of `chunks`.
 */
export interface DiskManifest {
  format: 'terminal-glance/disk@1'
  label: 'kwdata'
  /** The unkernel version the disk was provisioned on; its initramfs is the overlay's lower layer. */
  unkernel: string
  /** sha256 of the image/ sources and the unkernel version, see image/build.ts. */
  inputHash: string
  size: number
  chunkSize: number
  encoding: 'gzip'
  chunks: Record<string, string>
  /** Chunk indices the guest reads up to zsh's first prompt, in first-read order (image/vm/trace-boot.ts). */
  boot?: number[]
  /**
   * The bytes the guest reads up to zsh's first prompt, rounded to `blockSize` blocks, as one gzip file:
   * one download instead of every chunk those bytes sit in. The file is the blocks of `runs`
   * (`[first block, block count]`, ascending) one after another, each `blockSize` bytes long.
   */
  bootBundle?: BootBundle
  stats: {
    nonZeroChunks: number
    uniqueChunks: number
    rawBytes: number
    compressedBytes: number
  }
}

export interface BootBundle {
  file: string
  blockSize: number
  runs: Array<[number, number]>
}

export const CHUNK_SIZE = 1 << 20
/** Small enough that the bundle holds little the guest does not read, large enough to absorb small differences between boots. */
export const BOOT_BLOCK_SIZE = 16 << 10

export interface PackOptions {
  disk: string
  outDir: string
  unkernel: string
  inputHash: string
}

export async function packDisk({ disk, outDir, unkernel, inputHash }: PackOptions): Promise<DiskManifest> {
  const file = Bun.file(disk)
  const size = file.size
  const chunkDir = join(outDir, 'chunks')
  await mkdir(chunkDir, { recursive: true })

  const chunks: Record<string, string> = {}
  const written = new Map<string, number>()
  let nonZeroChunks = 0
  let rawBytes = 0

  for (let index = 0; index * CHUNK_SIZE < size; index++) {
    const start = index * CHUNK_SIZE
    const raw = new Uint8Array(await file.slice(start, Math.min(size, start + CHUNK_SIZE)).arrayBuffer())
    if (isZero(raw))
      continue
    nonZeroChunks++
    rawBytes += raw.length

    const name = `chunks/${new Bun.CryptoHasher('sha256').update(raw).digest('hex').slice(0, 16)}.gz`
    chunks[index] = name
    if (written.has(name))
      continue
    const target = Bun.file(join(outDir, name))
    if (await target.exists()) {
      written.set(name, target.size)
      continue
    }
    const gzip = Bun.gzipSync(raw, { level: 9 })
    await Bun.write(target, gzip)
    written.set(name, gzip.length)
  }

  for (const entry of await readdir(chunkDir)) {
    if (!written.has(`chunks/${entry}`))
      await rm(join(chunkDir, entry))
  }

  const manifest: DiskManifest = {
    format: 'terminal-glance/disk@1',
    label: 'kwdata',
    unkernel,
    inputHash,
    size,
    chunkSize: CHUNK_SIZE,
    encoding: 'gzip',
    chunks,
    stats: {
      nonZeroChunks,
      uniqueChunks: written.size,
      rawBytes,
      compressedBytes: [...written.values()].reduce((sum, bytes) => sum + bytes, 0),
    },
  }
  await writeManifest(outDir, manifest)
  return manifest
}

/**
 * Packs the blocks covering `reads` (byte ranges, as image/vm/trace-boot.ts records them) from the published chunks
 * into `boot/<first 16 hex of sha256(raw)>.gz`, deletes other bundles, and returns its description for the manifest.
 */
export async function writeBootBundle(outDir: string, manifest: DiskManifest, reads: Array<[number, number]>, blockSize = BOOT_BLOCK_SIZE): Promise<BootBundle> {
  if (manifest.chunkSize % blockSize !== 0)
    throw new Error(`boot block size ${blockSize} does not divide the chunk size ${manifest.chunkSize}`)
  const blocks = new Set<number>()
  for (const [offset, length] of reads) {
    const end = Math.min(manifest.size, offset + length)
    for (let block = Math.floor(offset / blockSize); block * blockSize < end; block++)
      blocks.add(block)
  }
  const sorted = [...blocks].sort((a, b) => a - b)
  const runs: Array<[number, number]> = []
  for (const block of sorted) {
    const last = runs.at(-1)
    if (last && last[0] + last[1] === block)
      last[1]++
    else
      runs.push([block, 1])
  }

  const chunks = new Map<number, Uint8Array>()
  const chunk = async (index: number): Promise<Uint8Array> => {
    let bytes = chunks.get(index)
    if (!bytes) {
      const file = manifest.chunks[index]
      bytes = file ? Bun.gunzipSync(await Bun.file(join(outDir, file)).bytes()) : new Uint8Array(manifest.chunkSize)
      chunks.set(index, bytes)
    }
    return bytes
  }
  // Every block takes blockSize bytes, the disk's last one padded with zeros, so a block's place in the file is its rank.
  const raw = new Uint8Array(sorted.length * blockSize)
  for (const [rank, block] of sorted.entries()) {
    const start = block * blockSize
    const index = Math.floor(start / manifest.chunkSize)
    const within = start - index * manifest.chunkSize
    raw.set((await chunk(index)).subarray(within, within + blockSize), rank * blockSize)
  }

  const bootDir = join(outDir, 'boot')
  await mkdir(bootDir, { recursive: true })
  const file = `boot/${new Bun.CryptoHasher('sha256').update(raw).digest('hex').slice(0, 16)}.gz`
  if (!(await Bun.file(join(outDir, file)).exists()))
    await Bun.write(join(outDir, file), Bun.gzipSync(raw, { level: 9 }))
  for (const entry of await readdir(bootDir)) {
    if (`boot/${entry}` !== file)
      await rm(join(bootDir, entry))
  }
  return { file, blockSize, runs }
}

/** The manifest goes last and in one rename, so a half-written output never looks complete. */
export async function writeManifest(outDir: string, manifest: DiskManifest): Promise<void> {
  const manifestPath = join(outDir, 'manifest.json')
  await Bun.write(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(`${manifestPath}.tmp`, manifestPath)
}

const ZEROS = Buffer.alloc(CHUNK_SIZE)

function isZero(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).equals(ZEROS.subarray(0, bytes.length))
}
