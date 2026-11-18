/**
 * Records which disk chunks the guest reads from power-on until zsh shows its first prompt, so the page can
 * fetch them all at once instead of one round trip at a time (runtime/disk.ts `boot`).
 *
 * Boots the published image offline the way the page does: unkernel's bundled kernel and initramfs, the
 * chunks under a copy-on-write disk, no network, a pty from `vm.spawn()` whose terminal queries are answered
 * as runtime/emulator.ts does. Prints `{ "boot": [chunk indices in first-read order], "reads": [[offset, length], ...] }`
 * as JSON: the chunks for the page to prefetch, and the byte ranges image/pack.ts packs into the boot bundle.
 *
 *   node image/vm/trace-boot.ts --manifest public/linux/manifest.json
 *
 * Needs Node >= 24 (WebAssembly JSPI), like provision.ts.
 * Source: unkernel@0.1.0-261117-0e4b2ec `dist/node.d.mts` (`createKernel`, `CowDisk`, `DiskBase`, `Pty`).
 */
import type { DiskBase } from 'unkernel/node'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { CowDisk, createKernel } from 'unkernel/node'

const { values: options } = parseArgs({
  options: {
    'manifest': { type: 'string' },
    /** The longest wait after the first prompt for the turbo-loaded plugins' mark; their reads still count. */
    'settle-ms': { type: 'string', default: '5000' },
    'timeout-ms': { type: 'string', default: '60000' },
  },
})
if (!options.manifest)
  throw new Error('usage: trace-boot.ts --manifest <public/linux/manifest.json>')

interface Manifest { size: number, chunkSize: number, inputHash: string, chunks: Record<string, string> }
const manifest: Manifest = JSON.parse(await readFile(options.manifest, 'utf8'))
const dir = dirname(options.manifest)
const log = (message: string) => process.stderr.write(`[trace-boot] ${message}\n`)

/** Chunk indices in the order the guest first read inside them. */
const order: number[] = []
const loaded = new Map<number, Uint8Array>()
let readBytes = 0
/** Every byte range the guest read, in order; image/pack.ts rounds them to blocks. */
const reads: Array<[number, number]> = []

async function chunk(index: number): Promise<Uint8Array> {
  let bytes = loaded.get(index)
  if (!bytes) {
    const file = manifest.chunks[index]
    bytes = file ? new Uint8Array(gunzipSync(await readFile(join(dir, file)))) : new Uint8Array(manifest.chunkSize)
    loaded.set(index, bytes)
  }
  return bytes
}

const base: DiskBase = {
  size: manifest.size,
  identity: `trace:${manifest.inputHash}`,
  async read(offset: number, length: number): Promise<Uint8Array> {
    readBytes += length
    reads.push([offset, length])
    const out = new Uint8Array(length)
    for (let at = offset; at < offset + length;) {
      const index = Math.floor(at / manifest.chunkSize)
      if (manifest.chunks[index] && !order.includes(index))
        order.push(index)
      const start = at - index * manifest.chunkSize
      const count = Math.min(manifest.chunkSize - start, offset + length - at)
      out.set((await chunk(index)).subarray(start, start + count), at - offset)
      at += count
    }
    return out
  },
}

const t0 = performance.now()
const vm = await createKernel({ disks: [new CowDisk(base)] })
const pty = await vm.spawn(undefined, undefined, { cols: 100, rows: 30 })

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
const atPrompt = order.length
const settle = Date.now() + Number(options['settle-ms'])
while (!plugins && Date.now() < settle)
  await new Promise(resolve => setTimeout(resolve, 20))
// The plugin's own first redraw reads right after its load.
await new Promise(resolve => setTimeout(resolve, 300))

const after = plugins ? `plugins loaded ${((plugins - prompt) / 1000).toFixed(1)} s later` : `no plugins mark within ${options['settle-ms']} ms`
log(`first prompt after ${((prompt - t0) / 1000).toFixed(1)} s, ${after}; ${atPrompt} chunks read by the prompt, ${order.length} in all; ${(readBytes / 2 ** 20).toFixed(1)} MiB read`)
process.stdout.write(`${JSON.stringify({ boot: order, atPrompt, reads })}\n`)
await vm.stop()
process.exit(0)
