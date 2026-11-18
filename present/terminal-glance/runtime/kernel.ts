import type { KernelInstance } from 'unkernel/web'
import type { ImageDisk } from './disk'
import kernelUrl from 'unkernel/alpine.wasm?url'
import { checkSupport, createKernel, loadKernelModule } from 'unkernel/web'
import { openImageDisk } from './disk'
import { AHEAD_PRIORITY, trackDownload } from './downloads'

/**
 * The page's only Linux VM: unkernel's bundled kernel and Alpine 3.24 riscv64 initramfs,
 * plus the preinstalled-tools disk built by `image/` (zsh + jovial, bash, tmux, htop, git, less, neovim).
 * Its /init finds the disk by the label `kwdata` and makes / an overlay of the initramfs and the disk.
 * There is no network; the guest's writes stay in memory, so every page load starts from the same machine.
 * Every terminal session is a pty spawned on it.
 *
 * Source: unkernel@0.1.0-261117-0e4b2ec `dist/web.d.mts` (`createKernel`, `checkSupport`, `CowDisk`)
 * and `kernel/guest/kw-data.sh` in its repository (the kwdata overlay root).
 */
export interface LinuxMachine {
  vm: KernelInstance
  /** Why the machine is not the published one, shown at the top of each new terminal. */
  notice?: string
}

/** What the boot needs from the network, started together so that none waits for another. */
interface Downloads {
  /** unkernel's kernel and initramfs (one wasm file), compiled while it downloads. */
  kernel: Promise<WebAssembly.Module>
  /** The preinstalled-tools disk; its boot chunks download as soon as the manifest arrives. */
  image: Promise<ImageDisk | undefined>
}

// A thread can run only one kernel, so Vite HMR must reuse the machine instead of booting another.
let booting: Promise<LinuxMachine> | undefined = import.meta.hot?.data.booting
let downloads: Downloads | undefined = import.meta.hot?.data.downloads

/**
 * Starts downloading what Linux needs (the kernel wasm, the disk manifest and the chunks the guest reads up to
 * its first prompt) without booting it. Safe in any window: it runs no kernel, so a presenter window calling it
 * only warms the HTTP cache. Call it as early as the page allows; useLinux() reuses the downloads.
 */
export function prefetchLinux(): void {
  if (downloads)
    return
  // unkernel counts the decoded bytes; the wire size of a gzip response would understate them.
  const kernelProgress = trackDownload('unkernel-alpine.wasm', __KERNEL_WASM_BYTES__)
  // Fetched here rather than by unkernel, so the download can yield to the page's own scripts and styles; unkernel
  // compiles the response while it streams. The index.html preload is low priority as well (vite.config.ts).
  const kernelResponse = fetch(new URL(kernelUrl, location.href), { priority: AHEAD_PRIORITY }).then((response) => {
    if (!response.ok)
      throw new Error(`${response.url}: HTTP ${response.status}`)
    return response
  })
  downloads = {
    kernel: kernelResponse.then(response => loadKernelModule(response, { onProgress: ({ loaded, done }) => kernelProgress(loaded, done) })),
    image: openImageDisk(manifestUrl()),
  }
  // A failed download is reported by the boot that awaits it; the progress bar stops counting it.
  downloads.kernel.catch(() => kernelProgress(0, true))
  downloads.image.catch(() => {})
  if (import.meta.hot)
    import.meta.hot.data.downloads = downloads
}

export function useLinux(): Promise<LinuxMachine> {
  booting ??= bootLinux()
  if (import.meta.hot)
    import.meta.hot.data.booting = booting
  return booting
}

async function bootLinux(): Promise<LinuxMachine> {
  // The downloads start before the support check, as the index.html preloads already do in every browser: gating
  // them here would save no bytes, only delay them by the check.
  prefetchLinux()
  const support = await checkSupport()
  if (!support.ok)
    throw new Error(`This browser cannot run the in-page Linux VM:\n${support.problems.join('\n')}`)

  const [kernel, image] = await Promise.all([downloads!.kernel, downloads!.image])
  const vm = await createKernel({ kernel, disks: image ? [image.disk] : [] })

  if (!image)
    return { vm, notice: `No preinstalled image at ${manifestUrl().pathname}: this is bare Alpine (busybox ash). Build it with \`pnpm build:image\` in present/terminal-glance.` }
  if (image.manifest.unkernel !== __UNKERNEL_VERSION__)
    return { vm, notice: `The image was built on unkernel ${image.manifest.unkernel}, the page runs ${__UNKERNEL_VERSION__}: rebuild it with \`pnpm build:image\`.` }
  return { vm }
}

function manifestUrl(): URL {
  return new URL('linux/manifest.json', new URL(import.meta.env.BASE_URL, location.href))
}
