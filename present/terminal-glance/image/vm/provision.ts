/**
 * Boots unkernel's Alpine image on a fresh kwdata data disk with the host's network, runs image/guest/setup.sh in
 * it as root, and powers off: the data disk file is then the guest image. The Alpine image is the root's read-only
 * lower layer (/dev/wda); everything setup.sh installs lands in the data disk's /data/distros/alpine/upper (/dev/wdb).
 *
 * Needs Node >= 24: unkernel runs on WebAssembly JSPI, which Bun does not have, so image/build.ts
 * (Bun) starts this file with Node. Node 24 strips the TypeScript types itself.
 *
 *   node image/vm/provision.ts --disk <file> --distro <alpine.erofs> --guest <dir>
 *
 * Source: unkernel@0.2.0-261124-c08e977 `dist/node.d.mts` (`createKernel` with `distro`, `createImageFromKwsparse`,
 * `bundledBoot`, `FileDisk`, `nodeFs`, `directBackend`, `SpawnOptions.user`) and `dist/cli.mjs` (`--data`, `--mount`).
 */
import type { BlockDevice, Subprocess } from 'unkernel/node'
import { readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  bundledBoot,
  createImageFromKwsparse,
  createKernel,
  directBackend,
  F_DISCARD,
  F_FLUSH,
  F_WRITE_ZEROES,
  FileDisk,
  nodeFs,
} from 'unkernel/node'

const { values: options } = parseArgs({
  options: {
    'disk': { type: 'string' },
    'distro': { type: 'string' },
    'guest': { type: 'string' },
    'memory': { type: 'string', default: '2048' },
    'input-hash': { type: 'string', default: '' },
    /** The Alpine mirror apk downloads from during the build (image/build.ts picks it). */
    'apk-mirror': { type: 'string', default: '' },
  },
})
if (!options.disk || !options.distro || !options.guest)
  throw new Error('usage: provision.ts --disk <file> --distro <alpine.erofs> --guest <dir> [--memory MiB] [--input-hash HEX]')

const SLAB = 1 << 20

/**
 * FileDisk without discard support would leave deleted files' blocks on the disk, and the packer
 * would publish them. Discards become zeros here, written only where the file is not zero already,
 * so the never-used part of the sparse file stays a hole.
 */
class ZeroingDisk implements BlockDevice {
  readonly size: number
  readonly flags: number
  readonly persistent = true
  readonly #file: FileDisk

  constructor(file: FileDisk) {
    this.#file = file
    this.size = file.size
    this.flags = F_FLUSH | F_DISCARD | F_WRITE_ZEROES
  }

  get flushSeq(): number { return this.#file.flushSeq }
  whenFlushed(after: number): Promise<void> { return this.#file.whenFlushed(after) }
  read(off: number, views: Uint8Array[]): void { this.#file.read(off, views) }
  write(off: number, views: Uint8Array[]): void { this.#file.write(off, views) }
  flush(): void { this.#file.flush() }
  discard(off: number, len: number): void { this.#zero(off, len) }
  writeZeroes(off: number, len: number): void { this.#zero(off, len) }

  #zero(off: number, len: number): void {
    const zeros = new Uint8Array(SLAB)
    for (let at = off; at < off + len; at += SLAB) {
      const slab = new Uint8Array(Math.min(SLAB, off + len - at))
      this.#file.read(at, [slab])
      if (slab.some(byte => byte !== 0))
        this.#file.write(at, [zeros.subarray(0, slab.length)])
    }
  }

  close(): void { this.#file.close() }
}

const t0 = performance.now()
const log = (message: string) => process.stderr.write(`[provision] ${message}\n`)

const kernelFile = fileURLToPath(import.meta.resolve('unkernel/unkernel.wasm'))
const unkernelVersion: string = JSON.parse(await readFile(fileURLToPath(import.meta.resolve('unkernel/package.json')), 'utf8')).version
const module = await WebAssembly.compile(await readFile(kernelFile))
const { datadisk } = bundledBoot(module)
if (!datadisk)
  throw new Error(`${kernelFile} has no bundled data disk template (custom section unkernel.datadisk)`)

await rm(options.disk, { force: true })
await rm(`${options.disk}.kwsnap`, { force: true })
const created = await createImageFromKwsparse(options.disk, datadisk)
log(`unkernel ${unkernelVersion}; data disk ${options.disk}: ${created.size / 2 ** 20} MiB from the bundled template`)
const disk = new ZeroingDisk(new FileDisk(options.disk))

const vm = await createKernel({
  kernel: module,
  memoryMiB: Number(options.memory),
  distro: options.distro,
  disks: [disk],
  net: directBackend(),
  mounts: { '/provision': { fs: nodeFs(options.guest), readOnly: true } },
})
// The kernel log and the console shell, for diagnosing a failed boot.
vm.onOutput(bytes => process.stderr.write(bytes))

// unkernel's distro images run programs as the user `user` unless told otherwise; the image is root's.
const setup: Subprocess = await vm.spawn('/bin/sh', ['/provision/setup.sh'], {
  pty: false,
  user: 'root',
  timeout: 120_000,
  env: { IMAGE_INPUT_HASH: options['input-hash'], UNKERNEL_VERSION: unkernelVersion, APK_MIRROR: options['apk-mirror'] },
})
const forward = (stream: ReadableStream<Uint8Array>, out: NodeJS.WriteStream) =>
  stream.pipeTo(new WritableStream({ write: chunk => void out.write(chunk) }))
await Promise.all([forward(setup.stdout, process.stdout), forward(setup.stderr, process.stderr)])
const end = await setup.ended
log(`setup.sh ended: ${JSON.stringify(end)}`)

if (end.type !== 'exit' || end.code !== 0) {
  await vm.stop()
  disk.close()
  process.exit(1)
}

// poweroff ends the vsock session it runs on, so its own end is not awaited.
void vm.spawn('/sbin/poweroff', [], { pty: false, user: 'root' }).catch(() => {})
const exit = await vm.exited
disk.close()
log(`kernel exited: ${JSON.stringify({ code: exit.code, kind: exit.kind, reason: exit.reason })} after ${((performance.now() - t0) / 1000).toFixed(0)} s`)
process.exit(exit.code === 0 && exit.kind === 'halt' ? 0 : 1)
