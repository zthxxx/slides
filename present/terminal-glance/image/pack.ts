import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * One published disk image, read by runtime/disk.ts: chunk i holds bytes [i * chunkSize, min(size, (i + 1) *
 * chunkSize)) of the image, gzip-compressed, stored by content (`<dir>/<first 16 hex of sha256(raw)>.gz`, so equal
 * chunks are stored once); chunks that are all zeros are left out of `chunks`.
 */
export interface PackedImage {
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

/**
 * `linux/manifest.json`: the preinstalled-tools data disk (the top level) and the distro image under it. The guest's
 * base initramfs mounts the distro image (erofs labelled `kwroot`) read-only as the root's lower layer and the data
 * disk (ext4 labelled `kwdata`) at /data, whose `/data/distros/<name>/upper` is the root's upper layer.
 */
export interface DiskManifest extends PackedImage {
  format: 'terminal-glance/disk@2'
  label: 'kwdata'
  /** The unkernel version the disk was provisioned on; its release published the distro image. */
  unkernel: string
  /** sha256 of the image/ sources and the unkernel version, see image/build.ts. */
  inputHash: string
  distro: DistroImage
}

/** unkernel's distro image as its release publishes it (`distros.json`), packed like the data disk. */
export interface DistroImage extends PackedImage {
  /** The distro's name, `/usr/lib/kw-distro`: the data disk keeps its changes in `/data/distros/<name>/`. */
  name: string
  /** The image id, `/usr/lib/kw-image`, recorded in `/data/distros/<name>/lower` when the data disk was provisioned. */
  image: string
  /** sha256 of the image file, as in the release's `distros.json`. */
  sha256: string
}

export interface BootBundle {
  file: string
  blockSize: number
  runs: Array<[number, number]>
}

export const CHUNK_SIZE = 1 << 20
/** Small enough that the bundle holds little the guest does not read, large enough to absorb small differences between boots. */
export const BOOT_BLOCK_SIZE = 16 << 10

/**
 * Publishes the image file `image` as chunks in `outDir/dir/`, deleting the files there that it no longer
 * references, and returns its description, with `chunks` paths relative to `outDir`.
 */
export async function packImage(image: string, outDir: string, dir: string): Promise<PackedImage> {
  const file = Bun.file(image)
  const size = file.size
  const chunkDir = join(outDir, dir)
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

    const name = `${dir}/${new Bun.CryptoHasher('sha256').update(raw).digest('hex').slice(0, 16)}.gz`
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
    if (!written.has(`${dir}/${entry}`))
      await rm(join(chunkDir, entry), { recursive: true })
  }

  return {
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
}

/**
 * Packs the blocks covering `reads` (byte ranges, as image/vm/trace-boot.ts records them) from the image's published
 * chunks into `<dir>/<first 16 hex of sha256(raw)>.gz`, deletes other bundles there, and returns its description.
 */
export async function writeBootBundle(outDir: string, image: PackedImage, reads: Array<[number, number]>, dir = 'boot', blockSize = BOOT_BLOCK_SIZE): Promise<BootBundle> {
  if (image.chunkSize % blockSize !== 0)
    throw new Error(`boot block size ${blockSize} does not divide the chunk size ${image.chunkSize}`)
  const blocks = new Set<number>()
  for (const [offset, length] of reads) {
    const end = Math.min(image.size, offset + length)
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
      const file = image.chunks[index]
      bytes = file ? Bun.gunzipSync(await Bun.file(join(outDir, file)).bytes()) : new Uint8Array(image.chunkSize)
      chunks.set(index, bytes)
    }
    return bytes
  }
  // Every block takes blockSize bytes, the image's last one padded with zeros, so a block's place in the file is its
  // rank. A chunk shorter than chunkSize (the end of an image whose size is not a multiple) is padded the same way.
  const raw = new Uint8Array(sorted.length * blockSize)
  for (const [rank, block] of sorted.entries()) {
    const start = block * blockSize
    const index = Math.floor(start / image.chunkSize)
    const within = start - index * image.chunkSize
    raw.set((await chunk(index)).subarray(within, within + blockSize), rank * blockSize)
  }

  const bootDir = join(outDir, dir)
  await mkdir(bootDir, { recursive: true })
  const file = `${dir}/${new Bun.CryptoHasher('sha256').update(raw).digest('hex').slice(0, 16)}.gz`
  if (!(await Bun.file(join(outDir, file)).exists()))
    await Bun.write(join(outDir, file), Bun.gzipSync(raw, { level: 9 }))
  for (const entry of await readdir(bootDir)) {
    if (`${dir}/${entry}` !== file)
      await rm(join(bootDir, entry), { recursive: true })
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
