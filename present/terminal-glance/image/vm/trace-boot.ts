/**
 * Records what the guest reads from power-on until zsh shows its first prompt, from both published images (the
 * distro image and the data disk), so the page can fetch it all at once instead of one round trip at a time
 * (runtime/disk.ts `boot`, `bootBundle`).
 *
 * Boots the published images offline the way the page does: unkernel's bundled kernel and base initramfs, the
 * distro image read-only, the data disk under a copy-on-write layer, no network, root's login shell on a pty from
 * `vm.spawn()` whose terminal queries are answered as runtime/emulator.ts does. Prints, as JSON,
 * `{ "data": Trace, "distro": Trace, "atPrompt": n }` where a Trace is `{ "boot": [chunk indices in first-read
 * order], "reads": [[offset, length], ...] }`: the chunks for the page to prefetch, and the byte ranges image/pack.ts
 * packs into each image's boot bundle.
 *
 *   node image/vm/trace-boot.ts --manifest public/linux/manifest.json
 *
 * Needs Node >= 24 (WebAssembly JSPI), like provision.ts.
 * Source: unkernel@0.2.0-261124-c08e977 `dist/node.d.mts` (`createKernel` with `distro`, `BaseDisk`, `CowDisk`,
 * `DiskBase`, `Pty`, `SpawnOptions.user`).
 */
import type { DiskBase } from 'unkernel/node'
import type { DiskManifest, PackedImage } from '../pack'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { BaseDisk, CowDisk, createKernel } from 'unkernel/node'

const { values: options } = parseArgs({
  options: {
    'manifest': { type: 'string' },
    /** The longest wait after the first prompt for the highlighting plugin's mark; its reads still count. */
    'settle-ms': { type: 'string', default: '5000' },
    'timeout-ms': { type: 'string', default: '60000' },
  },
})
if (!options.manifest)
  throw new Error('usage: trace-boot.ts --manifest <public/linux/manifest.json>')

const manifest: DiskManifest = JSON.parse(await readFile(options.manifest, 'utf8'))
const dir = dirname(options.manifest)
const log = (message: string) => process.stderr.write(`[trace-boot] ${message}\n`)

/** A published image as a DiskBase that records every read: the chunks in first-read order and the byte ranges. */
class TracedImage implements DiskBase {
  readonly size: number
  readonly identity: string
  /** Chunk indices in the order the guest first read inside them. */
  readonly order: number[] = []
  /** Every byte range the guest read, in order; image/pack.ts rounds them to blocks. */
  readonly reads: Array<[number, number]> = []
  readBytes = 0
  readonly #image: PackedImage
  readonly #loaded = new Map<number, Uint8Array>()

  constructor(image: PackedImage, identity: string) {
    this.#image = image
    this.size = image.size
    this.identity = identity
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    this.readBytes += length
    this.reads.push([offset, length])
    const { chunkSize, chunks } = this.#image
    const out = new Uint8Array(length)
    for (let at = offset; at < offset + length;) {
      const index = Math.floor(at / chunkSize)
      if (chunks[index] && !this.order.includes(index))
        this.order.push(index)
      const start = at - index * chunkSize
      const count = Math.min(chunkSize - start, offset + length - at)
      out.set((await this.#chunk(index)).subarray(start, start + count), at - offset)
      at += count
    }
    return out
  }

  async #chunk(index: number): Promise<Uint8Array> {
    let bytes = this.#loaded.get(index)
    if (!bytes) {
      const file = this.#image.chunks[index]
      bytes = file ? new Uint8Array(gunzipSync(await readFile(join(dir, file)))) : new Uint8Array(this.#image.chunkSize)
      this.#loaded.set(index, bytes)
    }
    return bytes
  }
}

const data = new TracedImage(manifest, `trace:${manifest.inputHash}`)
const distro = new TracedImage(manifest.distro, `trace:${manifest.distro.sha256}`)

const t0 = performance.now()
const vm = await createKernel({ distro: new BaseDisk(distro), disks: [new CowDisk(data)] })
const pty = await vm.spawn(undefined, undefined, { cols: 100, rows: 30, user: 'root' })

const decoder = new TextDecoder()
let output = ''
let prompt = 0
let plugins = 0
/** The marks `.zshrc` sends as iTerm2 SetUserVar escapes: `prompt` before the first prompt, `plugins` after the turbo loads. */
const MARK = /\x1B\]1337;SetUserVar=terminal_glance_boot=([A-Za-z0-9+/=]*)\x07/g
void pty.output.pipeTo(new WritableStream({
  write(bytes) {
    const text = decoder.decode(bytes, { stream: true })
    output += text
    // The replies runtime/emulator.ts (QueryResponder) and ghostty-web give: jovial waits for them at start-up.
    if (text.includes('\x1B]11;?'))
      void pty.write('\x1B]11;rgb:2727/2929/3636\x1B\\')
    if (text.includes('\x1B]10;?'))
      void pty.write('\x1B]10;rgb:f8f8/f8f8/f2f2\x1B\\')
    if (/\x1B\[0?c/.test(text))
      void pty.write('\x1B[?62;22c')
    if (text.includes('\x1B[6n'))
      void pty.write('\x1B[1;1R')
    for (const [, value] of output.matchAll(MARK)) {
      const mark = Buffer.from(value, 'base64').toString()
      if (mark === 'prompt' && !prompt)
        prompt = performance.now()
      if (mark === 'plugins' && !plugins)
        plugins = performance.now()
    }
  },
})).catch(() => {})

const deadline = Date.now() + Number(options['timeout-ms'])
while (!prompt && Date.now() < deadline)
  await new Promise(resolve => setTimeout(resolve, 20))
if (!prompt) {
  log(`no prompt within ${options['timeout-ms']} ms; last output: ${JSON.stringify(output.slice(-400))}`)
  process.exit(1)
}
const atPrompt = data.order.length + distro.order.length
const settle = Date.now() + Number(options['settle-ms'])
while (!plugins && Date.now() < settle)
  await new Promise(resolve => setTimeout(resolve, 20))
// The plugin's own first redraw reads right after its load.
await new Promise(resolve => setTimeout(resolve, 300))

const after = plugins ? `plugins loaded ${((plugins - prompt) / 1000).toFixed(1)} s later` : `no plugins mark within ${options['settle-ms']} ms`
const read = (image: TracedImage) => `${image.order.length} chunks, ${(image.readBytes / 2 ** 20).toFixed(1)} MiB`
log(`first prompt after ${((prompt - t0) / 1000).toFixed(1)} s, ${after}; ${atPrompt} chunks read by the prompt; `
  + `read from the distro image ${read(distro)}, from the data disk ${read(data)}`)
const trace = (image: TracedImage) => ({ boot: image.order, reads: image.reads })
process.stdout.write(`${JSON.stringify({ data: trace(data), distro: trace(distro), atPrompt })}\n`)
await vm.stop()
process.exit(0)
