import type { KernelInstance } from 'unkernel/web'
import type { ImageDisk } from './disk'
import kernelUrl from 'unkernel/unkernel.wasm?url'
import { checkSupport, createKernel, loadKernelModule } from 'unkernel/web'
import { shallowReactive } from 'vue'
import { openImageDisk } from './disk'
import { AHEAD_PRIORITY, summarizeDownloads, trackDownload } from './downloads'

/**
 * The page's only Linux VM: unkernel's bundled kernel with its base initramfs, booting unkernel's Alpine 3.24
 * aarch64 image, plus the preinstalled-tools disk built by `image/` (zsh + jovial, bash, tmux, htop, git, less,
 * neovim). The base's /init mounts the Alpine image (labelled `kwroot`) read-only and the disk labelled `kwdata` at
 * /data, and makes / an overlay of the image under `/data/distros/alpine/upper`.
 * There is no network; the guest's writes stay in memory, so every page load starts from the same machine.
 * Every terminal session is a pty spawned on it.
 *
 * Source: unkernel@0.2.0-261124-c08e977 `dist/web.d.mts` (`createKernel` with `distro`, `checkSupport`, `CowDisk`,
 * `BaseDisk`) and `guest/base/initramfs/init` in its repository (the overlay root).
 */
export interface LinuxMachine {
  vm: KernelInstance
  /** Why the machine is not the published one, shown at the top of each new terminal. */
  notice?: string
}

/** What the boot needs from the network, started together so that none waits for another. */
interface Downloads {
  /** unkernel's kernel and its base initramfs (one wasm file), compiled while it downloads. */
  kernel: Promise<WebAssembly.Module>
  /** The distro image and the preinstalled-tools disk; their boot data downloads as soon as the manifest arrives. */
  image: Promise<ImageDisk | undefined>
}

// A thread can run only one kernel, so Vite HMR must reuse the machine instead of booting another.
let booting: Promise<LinuxMachine> | undefined = import.meta.hot?.data.booting
let downloads: Downloads | undefined = import.meta.hot?.data.downloads

/**
 * The guest's memory: what the talk's htop step shows (pages/keystroke.md), and plenty for its demos. unkernel's
 * default on desktops is 2 GiB (`autoMemoryMiB`), which boots no faster.
 */
const GUEST_MEMORY_MIB = 512

/** The download progress entry of the kernel wasm; every other entry during the boot is the disk's. */
export const KERNEL_DOWNLOAD = 'unkernel.wasm'

/**
 * The machine's boot, in stages, for the terminals' boot screen: the two downloads run together, then the kernel
 * boots until the guest's kwtty accepts the first pty (`vm.spawn` waits for it; `createKernel` resolves at kernel
 * entry, before the guest's init).
 */
export interface BootStage {
  state: 'waiting' | 'active' | 'done' | 'failed'
  /** `performance.now()` at the boot stage's start and end. */
  startedAt?: number
  endedAt?: number
  /** Bytes the stage downloaded, once done. */
  bytes?: number
}

export interface LinuxBoot {
  kernel: BootStage
  disk: BootStage
  boot: BootStage
}

export const linuxBoot: LinuxBoot = import.meta.hot?.data.linuxBoot ?? shallowReactive<LinuxBoot>({
  kernel: { state: 'waiting' },
  disk: { state: 'waiting' },
  boot: { state: 'waiting' },
})
if (import.meta.hot)
  import.meta.hot.data.linuxBoot = linuxBoot

function setStage(name: keyof LinuxBoot, change: Partial<BootStage>): void {
  linuxBoot[name] = { ...linuxBoot[name], ...change }
}

/** Ends the boot stage: called when a pty has spawned, which needs the guest's kwtty up. */
export function markLinuxUp(): void {
  if (linuxBoot.boot.state === 'active')
    setStage('boot', { state: 'done', endedAt: performance.now() })
}

/**
 * Starts downloading what Linux needs (the kernel wasm, the disk manifest and what the guest reads from both images
 * up to its first prompt) without booting it. Safe in any window: it runs no kernel, so a presenter window calling it
 * only warms the HTTP cache. Call it as early as the page allows; useLinux() reuses the downloads.
 */
export function prefetchLinux(): void {
  if (downloads)
    return
  // unkernel counts the decoded bytes; the wire size of a gzip response would understate them.
  const kernelProgress = trackDownload(KERNEL_DOWNLOAD, __KERNEL_WASM_BYTES__)
  setStage('kernel', { state: 'active' })
  setStage('disk', { state: 'active' })
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
  downloads.kernel.then(
    () => setStage('kernel', { state: 'done', bytes: __KERNEL_WASM_BYTES__ }),
    () => {
      kernelProgress(0, true)
      setStage('kernel', { state: 'failed' })
    },
  )
  downloads.image.then(image => image?.bootData).then(
    () => setStage('disk', { state: 'done', bytes: summarizeDownloads(name => name !== KERNEL_DOWNLOAD).loaded }),
    () => setStage('disk', { state: 'failed' }),
  )
  if (import.meta.hot)
    import.meta.hot.data.downloads = downloads
}

/** After the boot, how long the rest of the disk waits for a shell's first prompt before it downloads anyway. */
const REST_AFTER_BOOT_MS = 5000
let restStarted = false

/**
 * Downloads the rest of both images (25 MB gzip in all, the Alpine image first) while the page is idle, so a program's first run (htop, bat, tmux)
 * reads it from memory instead of waiting for its chunks. Called when a shell has drawn its first prompt, or a while
 * after the boot when no terminal is shown: the page, the boot and the first prompt have all they need by then, and
 * the download is low priority, two files at a time.
 */
export function downloadRestOfDisk(): void {
  if (restStarted || !downloads)
    return
  restStarted = true
  void downloads.image.then(image => image && whenIdle().then(image.downloadRest)).catch(() => {})
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 2000 })
    else
      setTimeout(resolve, 200)
  })
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
  setStage('boot', { state: 'active', startedAt: performance.now() })
  let vm: KernelInstance
  try {
    vm = await createKernel({ kernel, distro: image?.distro, disks: image ? [image.disk] : [], memoryMiB: GUEST_MEMORY_MIB })
  }
  catch (error) {
    setStage('boot', { state: 'failed' })
    throw error
  }
  setTimeout(downloadRestOfDisk, REST_AFTER_BOOT_MS)

  if (!image)
    return { vm, notice: `No preinstalled image at ${manifestUrl().pathname}: this is unkernel's base shell (busybox ash), without Alpine. Build it with \`pnpm build:image\` in present/terminal-glance.` }
  if (image.manifest.unkernel !== __UNKERNEL_VERSION__)
    return { vm, notice: `The image was built on unkernel ${image.manifest.unkernel}, the page runs ${__UNKERNEL_VERSION__}: rebuild it with \`pnpm build:image\`.` }
  return { vm }
}

function manifestUrl(): URL {
  return new URL('linux/manifest.json', new URL(import.meta.env.BASE_URL, location.href))
}
