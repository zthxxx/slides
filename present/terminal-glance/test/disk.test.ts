import type { DiskManifest } from '../image/pack'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CowDisk } from 'unkernel/web'
import { CHUNK_SIZE, packDisk, writeBootBundle } from '../image/pack'
import { ChunkedDiskBase, decodeChunk, MANIFEST_FORMAT } from '../runtime/disk'

/**
 * The published disk is the contract between image/pack.ts (build) and runtime/disk.ts (page):
 * whatever the packer writes, the page must read back byte for byte.
 */
const SECTOR = 512

interface DiskSpec {
  size: number
  /** Chunks filled entirely with pseudo-random bytes (seeded), so every byte position carries data. */
  denseChunks: Array<{ index: number, seed: number }>
  writes: Array<{ offset: number, bytes: Uint8Array }>
  /** Copy the first chunk over the last, so the packer stores two chunk indices in one file. */
  repeatFirstChunk: boolean
}

const diskSpec: fc.Arbitrary<DiskSpec> = fc
  .record({
    fullChunks: fc.integer({ min: 1, max: 4 }),
    tailSectors: fc.integer({ min: 0, max: CHUNK_SIZE / SECTOR - 1 }),
    repeatFirstChunk: fc.boolean(),
  })
  .chain(({ fullChunks, tailSectors, repeatFirstChunk }) => {
    const size = fullChunks * CHUNK_SIZE + tailSectors * SECTOR
    const chunkCount = Math.ceil(size / CHUNK_SIZE)
    // Half of the writes straddle a chunk boundary, where reads split across chunks.
    const nearBoundary = fc
      .tuple(fc.integer({ min: 1, max: chunkCount }), fc.integer({ min: -4096, max: 4096 }))
      .map(([boundary, shift]) => Math.min(size - 1, Math.max(0, boundary * CHUNK_SIZE + shift)))
    const write = fc.record({
      offset: fc.oneof(fc.integer({ min: 0, max: size - 1 }), nearBoundary),
      bytes: fc.uint8Array({ minLength: 1, maxLength: 8192 }),
    })
    return fc.record({
      size: fc.constant(size),
      denseChunks: fc.array(fc.record({ index: fc.integer({ min: 0, max: chunkCount - 1 }), seed: fc.integer() }), { maxLength: 2 }),
      writes: fc.array(write, { maxLength: 12 }),
      repeatFirstChunk: fc.constant(repeatFirstChunk),
    })
  })

function render({ size, denseChunks, writes, repeatFirstChunk }: DiskSpec): Uint8Array {
  const disk = new Uint8Array(size)
  for (const { index, seed } of denseChunks) {
    let state = seed >>> 0
    const end = Math.min(size, (index + 1) * CHUNK_SIZE)
    for (let at = index * CHUNK_SIZE; at < end; at++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      disk[at] = state >>> 24
    }
  }
  for (const { offset, bytes } of writes)
    disk.set(bytes.subarray(0, size - offset), offset)
  const lastChunk = Math.floor((size - 1) / CHUNK_SIZE) * CHUNK_SIZE
  if (repeatFirstChunk && lastChunk + CHUNK_SIZE <= size)
    disk.copyWithin(lastChunk, 0, CHUNK_SIZE)
  return disk
}

async function publish(disk: Uint8Array): Promise<{ manifest: DiskManifest, outDir: string, cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'terminal-glance-disk-'))
  const diskPath = join(root, 'kwdata.img')
  const outDir = join(root, 'linux')
  await Bun.write(diskPath, disk)
  const manifest = await packDisk({ disk: diskPath, outDir, unkernel: 'test', inputHash: 'test' })
  return { manifest, outDir, cleanup: () => rm(root, { recursive: true, force: true }) }
}

function readFromFiles(outDir: string) {
  return async (file: string) => decodeChunk(await Bun.file(join(outDir, file)).bytes())
}

describe('published disk image', () => {
  test('reads back every byte range the packer published', async () => {
    await fc.assert(
      fc.asyncProperty(
        diskSpec,
        fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 1, max: 3 * CHUNK_SIZE })), { minLength: 1, maxLength: 8 }),
        async (spec, ranges) => {
          const disk = render(spec)
          const { manifest, outDir, cleanup } = await publish(disk)
          try {
            const base = new ChunkedDiskBase(manifest, readFromFiles(outDir))
            expect(base.size).toBe(disk.length)
            for (const [position, wanted] of ranges) {
              const offset = Math.min(disk.length - 1, Math.floor(position * disk.length))
              const length = Math.min(wanted, disk.length - offset)
              expect(await base.read(offset, length)).toEqual(disk.subarray(offset, offset + length))
            }
          }
          finally {
            await cleanup()
          }
        },
      ),
      { numRuns: 25 },
    )
  }, 120_000)

  test('publishes only chunks that hold data, each stored once', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, async (spec) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const chunkCount = Math.ceil(disk.length / CHUNK_SIZE)
          for (let index = 0; index < chunkCount; index++) {
            const raw = disk.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
            expect(index in manifest.chunks).toBe(raw.some(byte => byte !== 0))
          }
          const files = new Set(Object.values(manifest.chunks))
          expect(manifest.stats.uniqueChunks).toBe(files.size)
          for (const file of files)
            expect(await Bun.file(join(outDir, file)).exists()).toBe(true)
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 25 },
    )
  }, 120_000)
})

/**
 * Reads from the published files after a delay that differs per chunk file, so fetches finish out of order;
 * a file in `failing` fails after its delay, as a download that breaks off.
 */
function slowLoader(outDir: string, seed: number, loads: Map<string, number>, failing: ReadonlySet<string> = new Set()) {
  const read = readFromFiles(outDir)
  return async (file: string) => {
    loads.set(file, (loads.get(file) ?? 0) + 1)
    const delay = [...file].reduce((sum, char) => (sum * 31 + char.charCodeAt(0) + seed) >>> 0, 0) % 5
    await new Promise(resolve => setTimeout(resolve, delay))
    if (failing.has(file))
      throw new Error(`${file}: connection reset`)
    return read(file)
  }
}

/** Chunk indices with equal contents share one file; each index is still fetched on its own. */
function indicesPerFile(manifest: DiskManifest): Map<string, number> {
  const count = new Map<string, number>()
  for (const file of Object.values(manifest.chunks))
    count.set(file, (count.get(file) ?? 0) + 1)
  return count
}

describe('boot prefetch', () => {
  const plan = fc.record({
    /** Positions (0..1) of the chunks to prefetch, in the order to prefetch them. */
    boot: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }),
    concurrency: fc.integer({ min: 1, max: 8 }),
    seed: fc.nat(),
    /** Guest reads, each started before or after the prefetch begins, while it runs. */
    reads: fc.array(fc.record({ position: fc.double({ min: 0, max: 1, noNaN: true }), length: fc.integer({ min: 1, max: 2 * CHUNK_SIZE }), early: fc.boolean() }), { minLength: 1, maxLength: 8 }),
  })

  test('prefetching never changes the bytes the guest reads', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, plan, async (spec, { boot, concurrency, seed, reads }) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const chunkCount = Math.ceil(disk.length / CHUNK_SIZE)
          const bootIndices = boot.map(position => Math.min(chunkCount - 1, Math.floor(position * chunkCount)))
          const base = new ChunkedDiskBase({ ...manifest, boot: bootIndices }, slowLoader(outDir, seed, new Map()))
          const read = ({ position, length }: { position: number, length: number }) => {
            const offset = Math.min(disk.length - 1, Math.floor(position * disk.length))
            const end = Math.min(disk.length, offset + length)
            return base.read(offset, end - offset).then(bytes => expect(bytes).toEqual(disk.subarray(offset, end)))
          }
          const early = reads.filter(r => r.early).map(read)
          const prefetching = base.prefetch(bootIndices, concurrency)
          const late = reads.filter(r => !r.early).map(read)
          await Promise.all([...early, prefetching, ...late])
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  test('a chunk wanted by the prefetch and by guest reads at the same time is fetched once', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, plan, async (spec, { boot, concurrency, seed, reads }) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const chunkCount = Math.ceil(disk.length / CHUNK_SIZE)
          const bootIndices = boot.map(position => Math.min(chunkCount - 1, Math.floor(position * chunkCount)))
          const loads = new Map<string, number>()
          const base = new ChunkedDiskBase({ ...manifest, boot: bootIndices }, slowLoader(outDir, seed, loads))
          const read = ({ position, length }: { position: number, length: number }) => {
            const offset = Math.min(disk.length - 1, Math.floor(position * disk.length))
            return base.read(offset, Math.min(length, disk.length - offset))
          }
          await Promise.all([...reads.filter(r => r.early).map(read), base.prefetch(bootIndices, concurrency), ...reads.filter(r => !r.early).map(read)])
          // The disks here have at most 5 chunks, fewer than the cache holds, so nothing is evicted and fetched again.
          const perFile = indicesPerFile(manifest)
          for (const [file, count] of loads)
            expect(count).toBeLessThanOrEqual(perFile.get(file) ?? 0)
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)
})

describe('boot bundle', () => {
  /** Byte ranges the guest reads at boot, and other reads, as positions (0..1) of the disk and lengths. */
  const range = fc.record({ position: fc.double({ min: 0, max: 1, noNaN: true }), length: fc.integer({ min: 1, max: 96 * 1024 }) })
  const at = (disk: Uint8Array, { position, length }: { position: number, length: number }): [number, number] => {
    const offset = Math.min(disk.length - 1, Math.floor(position * disk.length))
    return [offset, Math.min(length, disk.length - offset)]
  }

  test('reads return the disk\'s bytes whether the bundle covers them or not', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(range, { minLength: 1, maxLength: 12 }), fc.array(range, { minLength: 1, maxLength: 8 }), fc.nat(), async (spec, bootReads, otherReads, seed) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const boot = bootReads.map(r => at(disk, r))
          const bootBundle = await writeBootBundle(outDir, manifest, boot)
          const base = new ChunkedDiskBase({ ...manifest, bootBundle }, slowLoader(outDir, seed, new Map()))
          const prefetching = base.prefetchBoot(4)
          await Promise.all([...boot, ...otherReads.map(r => at(disk, r))].map(([offset, length]) =>
            base.read(offset, length).then(bytes => expect(bytes).toEqual(disk.subarray(offset, offset + length)))))
          await prefetching
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  test('the reads recorded at boot download the bundle once and no chunk', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(fc.tuple(range, fc.boolean()), { minLength: 1, maxLength: 12 }), fc.nat(), async (spec, bootReads, seed) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const boot = bootReads.map(([r, early]) => [...at(disk, r), early] as const)
          const bootBundle = await writeBootBundle(outDir, manifest, boot.map(([offset, length]) => [offset, length]))
          const loads = new Map<string, number>()
          const base = new ChunkedDiskBase({ ...manifest, bootBundle }, slowLoader(outDir, seed, loads))
          // Any part of a recorded read is covered as well: the guest may split a read differently.
          // Some reads come before the page starts the bundle's download, all of them before it arrives.
          const read = ([offset, length]: readonly [number, number, boolean]) =>
            base.read(offset + Math.floor(length / 3), Math.max(1, Math.floor(length / 2)))
          const early = boot.filter(([, , first]) => first).map(read)
          const prefetching = base.prefetchBoot(4)
          await Promise.all([...early, prefetching, ...boot.filter(([, , first]) => !first).map(read)])
          expect([...loads.keys()]).toEqual([bootBundle.file])
          expect(loads.get(bootBundle.file)).toBe(1)
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  test('the bundle file is the blocks the boot read, in the order of its runs', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(range, { maxLength: 12 }), async (spec, bootReads) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const reads = bootReads.map(r => at(disk, r))
          const { file, blockSize, runs } = await writeBootBundle(outDir, manifest, reads)
          const touched = new Set(reads.flatMap(([offset, length]) => {
            const first = Math.floor(offset / blockSize)
            return Array.from({ length: Math.floor((offset + length - 1) / blockSize) - first + 1 }, (_, k) => first + k)
          }))
          const blocks = runs.flatMap(([first, count]) => Array.from({ length: count }, (_, k) => first + k))
          expect(blocks).toEqual([...touched].sort((a, b) => a - b))
          // Runs are maximal: two runs never touch.
          for (const [i, [first, count]] of runs.entries()) {
            expect(count).toBeGreaterThan(0)
            if (i > 0)
              expect(first).toBeGreaterThan(runs[i - 1][0] + runs[i - 1][1])
          }
          const bundle = await decodeChunk(await Bun.file(join(outDir, file)).bytes())
          expect(bundle.length).toBe(blocks.length * blockSize)
          for (const [rank, block] of blocks.entries()) {
            // The disk's last block is padded with zeros.
            const expected = new Uint8Array(blockSize)
            expected.set(disk.subarray(block * blockSize, (block + 1) * blockSize))
            expect(bundle.subarray(rank * blockSize, (rank + 1) * blockSize)).toEqual(expected)
          }
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  test('a failed bundle leaves every read to the chunks, and the boot chunks are fetched ahead, each once', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(fc.tuple(range, fc.boolean()), { minLength: 1, maxLength: 12 }), fc.nat(), async (spec, reads, seed) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const ranges = reads.map(([r, early]) => [...at(disk, r), early] as const)
          const bootBundle = await writeBootBundle(outDir, manifest, ranges.map(([offset, length]) => [offset, length]))
          const boot = [...new Set(ranges.map(([offset]) => Math.floor(offset / CHUNK_SIZE)))].filter(index => index in manifest.chunks)
          const loads = new Map<string, number>()
          const base = new ChunkedDiskBase({ ...manifest, boot, bootBundle }, slowLoader(outDir, seed, loads, new Set([bootBundle.file])))
          const read = ([offset, length]: readonly [number, number, boolean]) =>
            base.read(offset, length).then(bytes => expect(bytes).toEqual(disk.subarray(offset, offset + length)))
          const early = ranges.filter(([, , first]) => first).map(read)
          await base.prefetchBoot(4)
          // Every boot chunk is fetched by now, whether a read asked for it or not.
          for (const index of boot)
            expect(loads.get(manifest.chunks[index]) ?? 0).toBeGreaterThan(0)
          await Promise.all([...early, ...ranges.filter(([, , first]) => !first).map(read)])
          // Read again once the bundle is known to have failed.
          await Promise.all(ranges.map(read))
          expect(loads.get(bootBundle.file)).toBe(1)
          const perFile = indicesPerFile(manifest)
          for (const [file, count] of loads) {
            if (file !== bootBundle.file)
              expect(count).toBeLessThanOrEqual(perFile.get(file) ?? 0)
          }
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)

  test('without a boot trace nothing is fetched ahead of the guest', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(range, { minLength: 1, maxLength: 8 }), fc.nat(), async (spec, reads, seed) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          expect(manifest.boot).toBeUndefined()
          expect(manifest.bootBundle).toBeUndefined()
          const loads = new Map<string, number>()
          const base = new ChunkedDiskBase(manifest, slowLoader(outDir, seed, loads))
          await base.prefetchBoot(4)
          expect(loads.size).toBe(0)
          for (const [offset, length] of reads.map(r => at(disk, r)))
            expect(await base.read(offset, length)).toEqual(disk.subarray(offset, offset + length))
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 10 },
    )
  }, 120_000)
})

describe('chunk cache', () => {
  /** A disk of small chunks made up by the loader, so a test can read more chunks than the cache holds. */
  const CHUNK = 4096
  const content = (index: number) => {
    const bytes = new Uint8Array(CHUNK)
    let state = (index + 1) * 2654435761 >>> 0
    for (let at = 0; at < CHUNK; at++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      bytes[at] = state >>> 24
    }
    return bytes
  }
  const manifestOf = (count: number, boot: number[]): DiskManifest => ({
    format: MANIFEST_FORMAT,
    label: 'kwdata',
    unkernel: 'test',
    inputHash: 'test',
    size: count * CHUNK,
    chunkSize: CHUNK,
    encoding: 'gzip',
    chunks: Object.fromEntries(Array.from({ length: count }, (_, index) => [index, `chunks/${index}.gz`])),
    boot,
    stats: { nonZeroChunks: count, uniqueChunks: count, rawBytes: count * CHUNK, compressedBytes: count * CHUNK },
  })

  const plan = fc.integer({ min: 96, max: 192 }).chain(count => fc.record({
    count: fc.constant(count),
    boot: fc.uniqueArray(fc.nat(count - 1), { minLength: 1, maxLength: 48, size: 'max' }),
    /** Chunks the guest reads before any boot chunk: usually more than the cache holds besides the boot chunks. */
    others: fc.array(fc.nat(count - 1), { minLength: 64, maxLength: 192, size: 'max' }),
    concurrency: fc.integer({ min: 1, max: 8 }),
    seed: fc.nat(),
  }))

  test('a prefetched chunk is downloaded once, however many other chunks the guest reads before it', async () => {
    await fc.assert(
      fc.asyncProperty(plan, async ({ count, boot, others, concurrency, seed }) => {
        const loads = new Map<string, number>()
        const base = new ChunkedDiskBase(manifestOf(count, boot), async (file) => {
          loads.set(file, (loads.get(file) ?? 0) + 1)
          const index = Number(/\d+/.exec(file)![0])
          await new Promise(resolve => setTimeout(resolve, (index * 7 + seed) % 3))
          return content(index)
        })
        const read = (index: number) => base.read(index * CHUNK, CHUNK).then(bytes => expect(bytes).toEqual(content(index)))
        const prefetching = base.prefetchBoot(concurrency)
        await Promise.all(others.filter(index => !boot.includes(index)).map(read))
        await prefetching
        await Promise.all(boot.map(read))
        for (const index of boot)
          expect(loads.get(`chunks/${index}.gz`)).toBe(1)
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

describe('copy-on-write over the published disk', () => {
  const SECTORS_PER_IO = 64
  const op = fc.record({
    write: fc.boolean(),
    position: fc.double({ min: 0, max: 1, noNaN: true }),
    sectors: fc.integer({ min: 1, max: SECTORS_PER_IO }),
    fill: fc.nat(255),
  })

  test('the guest reads back what it wrote, and the published bytes everywhere else', async () => {
    await fc.assert(
      fc.asyncProperty(diskSpec, fc.array(fc.record({ position: fc.double({ min: 0, max: 1, noNaN: true }), length: fc.integer({ min: 1, max: 96 * 1024 }) }), { maxLength: 8 }), fc.array(op, { minLength: 1, maxLength: 24 }), fc.nat(), async (spec, bootReads, ops, seed) => {
        const disk = render(spec)
        const { manifest, outDir, cleanup } = await publish(disk)
        try {
          const sectors = disk.length / SECTOR
          const reads = bootReads.map(({ position, length }): [number, number] => {
            const offset = Math.min(disk.length - 1, Math.floor(position * disk.length))
            return [offset, Math.min(length, disk.length - offset)]
          })
          const bootBundle = await writeBootBundle(outDir, manifest, reads)
          const base = new ChunkedDiskBase({ ...manifest, bootBundle }, slowLoader(outDir, seed, new Map()))
          void base.prefetchBoot(4)
          const cow = new CowDisk(base)
          const model = disk.slice()
          for (const { write, position, sectors: count, fill } of ops) {
            const first = Math.min(sectors - 1, Math.floor(position * sectors))
            const offset = first * SECTOR
            const length = Math.min(count, sectors - first) * SECTOR
            if (write) {
              const bytes = new Uint8Array(length).map((_, k) => (fill + k) & 0xFF)
              await cow.write(offset, [bytes])
              model.set(bytes, offset)
            }
            else {
              const out = new Uint8Array(length)
              await cow.read(offset, [out])
              expect(out).toEqual(model.subarray(offset, offset + length))
            }
          }
        }
        finally {
          await cleanup()
        }
      }),
      { numRuns: 20 },
    )
  }, 120_000)
})
