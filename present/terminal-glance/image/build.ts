#!/usr/bin/env bun
/**
 * Builds the guest disk image the deck boots with: zsh + jovial, bash, tmux, htop, git, less
 * bat and neovim preinstalled on unkernel's Alpine, so the page needs no network.
 *
 *   bun image/build.ts [--force]      (or `pnpm build:image` in present/terminal-glance)
 *
 * 1. Hash the inputs: every file under image/ and the installed unkernel version. When
 *    public/linux/manifest.json already has that hash, the build is skipped (--force rebuilds).
 * 2. image/vm/provision.ts boots unkernel on a fresh data disk with the network and runs
 *    image/guest/setup.sh in it. It runs on Node >= 24 (WebAssembly JSPI, which Bun lacks):
 *    the `node` on PATH when it is new enough, else `npx -y node@24`.
 * 3. image/pack.ts publishes the disk as gzip chunks + manifest.json in public/linux/.
 * 4. image/vm/trace-boot.ts boots the published disk offline, as the page does, and records what the guest reads
 *    up to zsh's first prompt: the chunks go into the manifest's `boot`, the bytes into one boot bundle
 *    (`bootBundle`), so the page downloads the boot in one request instead of one round trip per chunk.
 *
 * Outputs (both gitignored): .cache/image/kwdata.img (the raw disk) and public/linux/.
 */
import type { DiskManifest } from './pack'
import { $, Glob } from 'bun'
import { mkdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { packDisk, writeBootBundle, writeManifest } from './pack'

$.env({ ...process.env, FORCE_COLOR: '1' })

const { values: options } = parseArgs({
  args: Bun.argv.slice(2),
  options: { force: { type: 'boolean', default: false } },
})

const imageDir = import.meta.dir
const deckDir = resolve(imageDir, '..')
const outDir = join(deckDir, 'public/linux')
const cacheDir = join(deckDir, '.cache/image')
const diskPath = join(cacheDir, 'kwdata.img')
const log = (message: string) => console.log(`[image] ${message}`)

const unkernel: string = JSON.parse(await readFile(join(deckDir, 'node_modules/unkernel/package.json'), 'utf8')).version
const inputHash = await hashInputs()

const previous = await Bun.file(join(outDir, 'manifest.json')).json().catch(() => undefined) as DiskManifest | undefined
if (!options.force && previous?.inputHash === inputHash) {
  if (!previous.boot || !previous.bootBundle)
    await traceBoot(previous, await nodeCommand())
  log(`up to date (inputs ${inputHash.slice(0, 12)}): ${relative(process.cwd(), outDir)}/manifest.json`)
  process.exit(0)
}

log(`building for unkernel ${unkernel}, inputs ${inputHash.slice(0, 12)}`)
await mkdir(cacheDir, { recursive: true })
const started = performance.now()

const node = await nodeCommand()
log(`VM driver on ${node.join(' ')}`)
await $`${node} ${join(imageDir, 'vm/provision.ts')} --disk ${diskPath} --guest ${join(imageDir, 'guest')} --input-hash ${inputHash}`
  .cwd(deckDir)
const provisioned = performance.now()

const manifest = await packDisk({ disk: diskPath, outDir, unkernel, inputHash })
const packed = performance.now()
await traceBoot(manifest, node)
const { stats } = manifest
log(`provisioned in ${seconds(provisioned - started)}, packed in ${seconds(packed - provisioned)}, traced in ${seconds(performance.now() - packed)}`)
log(`disk ${mib(manifest.size)}: ${stats.nonZeroChunks} non-zero chunks (${mib(stats.rawBytes)}), `
  + `${stats.uniqueChunks} unique, ${mib(stats.compressedBytes)} gzip in ${relative(process.cwd(), outDir)}/`)

/**
 * Boots the published disk once, offline, and stores what it reads up to the first prompt: the chunks' indices,
 * and the bytes themselves as the boot bundle. The page downloads the bundle at boot, in one request.
 */
async function traceBoot(published: DiskManifest, node: string[]): Promise<void> {
  const manifestPath = join(outDir, 'manifest.json')
  const output = await $`${node} ${join(imageDir, 'vm/trace-boot.ts')} --manifest ${manifestPath}`.cwd(deckDir).text()
  const { boot, reads } = JSON.parse(output) as { boot: number[], reads: Array<[number, number]> }
  published.boot = boot
  published.bootBundle = await writeBootBundle(outDir, published, reads)
  await writeManifest(outDir, published)
  const chunkBytes = await Promise.all(boot.map(index => Bun.file(join(outDir, published.chunks[index])).size))
  const bundleBytes = Bun.file(join(outDir, published.bootBundle.file)).size
  log(`boot reads ${boot.length} chunks (${mib(chunkBytes.reduce((sum, bytes) => sum + bytes, 0))} gzip); `
    + `the boot bundle holds the bytes read, ${mib(bundleBytes)} gzip`)
}

function mib(bytes: number): string {
  return `${(bytes / 2 ** 20).toFixed(1)} MiB`
}

/** Every file under image/ (path and content, in path order) and the unkernel version. */
async function hashInputs(): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(`unkernel@${unkernel}\n`)
  const files = [...new Glob('**/*').scanSync({ cwd: imageDir, dot: true })].sort()
  for (const file of files) {
    hasher.update(`${file}\n`)
    hasher.update(new Uint8Array(await Bun.file(join(imageDir, file)).arrayBuffer()))
  }
  return hasher.digest('hex')
}

async function nodeCommand(): Promise<string[]> {
  const version = await $`node --version`.quiet().nothrow().text()
  const major = Number(/^v(\d+)/.exec(version.trim())?.[1] ?? 0)
  return major >= 24 ? ['node'] : ['npx', '-y', 'node@24']
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(0)} s`
}
