import type { DiskManifest } from '../image/pack'
import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHUNK_SIZE, packDisk } from '../image/pack'
import { ChunkedDiskBase, decodeChunk } from '../runtime/disk'

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
