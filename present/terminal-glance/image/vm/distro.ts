/**
 * Gets unkernel's Alpine image for this package version and prints it as JSON: `{ path, size, sha256, name, image }`.
 * The image is not in the npm package: unkernel's `fetchDistro` downloads it once from the GitHub release of the
 * installed version, checks it against the release's `distros.json` (size and SHA-256), and keeps it in `--cache`.
 * The name and image id come from the image's distro header (`/usr/lib/kw-distro`, `/usr/lib/kw-image`).
 *
 *   node image/vm/distro.ts --cache .cache/unkernel
 *
 * Needs Node >= 24, like provision.ts. Source: unkernel@0.2.0-261124-c08e977 `dist/node.d.mts` (`fetchDistro`,
 * `openDistroDisk`, `DistroInfo`).
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { fetchDistro, openDistroDisk } from 'unkernel/node'

/** The distro the deck boots: Alpine's image is about 4 MB, Debian's 73 MB. */
const DISTRO = 'alpine'

const { values: options } = parseArgs({ options: { cache: { type: 'string' } } })
if (!options.cache)
  throw new Error('usage: distro.ts --cache <dir>')

const log = (message: string) => process.stderr.write(`[distro] ${message}\n`)
let reported = 0
const path = await fetchDistro(DISTRO, {
  cacheDir: options.cache,
  onProgress: ({ stage, loaded = 0, total = 0, url, cached }) => {
    if (stage === 'download' && (loaded === total || loaded - reported >= 1 << 20)) {
      reported = loaded
      log(`${url ?? ''} ${(loaded / 2 ** 20).toFixed(1)} of ${(total / 2 ** 20).toFixed(1)} MiB`)
    }
    if (stage === 'done')
      log(cached ? 'from the cache' : 'downloaded')
  },
})
const disk = await openDistroDisk(path, { prefetch: false })
const { distro: name, image, size } = disk.info
disk.close()
if (name !== DISTRO || !image)
  throw new Error(`${path}: its distro header names ${JSON.stringify(name)} / ${JSON.stringify(image)}, not an ${DISTRO} image`)
const sha256 = createHash('sha256').update(await readFile(path)).digest('hex')
process.stdout.write(`${JSON.stringify({ path, size, sha256, name, image })}\n`)
