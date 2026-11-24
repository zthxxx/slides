import type { DiskManifest, FileFetcher } from './disk'
import { BACKGROUND_CONCURRENCY, imageChunkFiles, ImageFiles, MANIFEST_FORMAT } from './disk'
import { AHEAD_PRIORITY, readCounted } from './downloads'

/**
 * The published images' files as the page fetches them: the manifest, then each file once, kept as published
 * (`ImageFiles`). It runs on the page's thread whichever thread runs the kernel, because the fetches take over
 * index.html's preloads (vite.config.ts) and feed the terminals' progress bar (`downloads.ts`); a kernel in a worker
 * asks for the files it reads (`kernel-worker-host.ts`).
 */
export interface ImageSource {
  manifest: DiskManifest
  files: ImageFiles
  /** Settles once both boot bundles are here (or failed: the disks then fetch the boot chunks themselves). */
  bootFiles: Promise<void>
  /** Downloads every chunk not fetched yet, at low priority; settles when all have been tried. */
  downloadRest: () => Promise<void>
}

/**
 * Reads the manifest and starts both boot bundles at once, as published bytes, before any disk or kernel exists.
 * Resolves to undefined when the deck has no built image.
 */
export async function openImageSource(manifestUrl: URL): Promise<ImageSource | undefined> {
  const response = await fetch(manifestUrl, { priority: AHEAD_PRIORITY })
  // A dev server answers a missing file with its HTML fallback page.
  if (response.status === 404 || !response.headers.get('content-type')?.includes('json'))
    return undefined
  if (!response.ok)
    throw new Error(`${manifestUrl}: HTTP ${response.status}`)
  const manifest = await response.json() as DiskManifest
  if (manifest.format !== MANIFEST_FORMAT)
    throw new Error(`${manifestUrl}: unknown disk format ${JSON.stringify(manifest.format)}, expected ${MANIFEST_FORMAT}: rebuild it with \`pnpm build:image\``)
  const files = new ImageFiles(fetchFiles(manifestUrl))
  const bundles = [manifest.bootBundle, manifest.distro.bootBundle].flatMap(bundle => bundle ? [bundle.file] : [])
  const bootFiles = Promise.all(bundles.map(file => files.published(file, 'low'))).then(() => {}, () => {})
  const chunks = imageChunkFiles(manifest)
  return { manifest, files, bootFiles, downloadRest: () => files.downloadAll(chunks, BACKGROUND_CONCURRENCY) }
}

function fetchFiles(manifestUrl: URL): FileFetcher {
  return async (file, reason) => {
    const url = new URL(file, manifestUrl)
    const response = await fetch(url, reason === 'need' ? {} : { priority: AHEAD_PRIORITY })
    if (!response.ok)
      throw new Error(`disk chunk ${url}: HTTP ${response.status}`)
    // Nobody waits for a background download, so the terminals' progress bar leaves it out.
    return reason === 'background' ? new Uint8Array(await response.arrayBuffer()) : readCounted(response, file)
  }
}
