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
  stats: {
    nonZeroChunks: number
    uniqueChunks: number
    rawBytes: number
    compressedBytes: number
  }
}

export const CHUNK_SIZE = 1 << 20

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
  // The manifest goes last and in one rename, so a half-written output never looks complete.
  const manifestPath = join(outDir, 'manifest.json')
  await Bun.write(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(`${manifestPath}.tmp`, manifestPath)
  return manifest
}

const ZEROS = Buffer.alloc(CHUNK_SIZE)

function isZero(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).equals(ZEROS.subarray(0, bytes.length))
}
