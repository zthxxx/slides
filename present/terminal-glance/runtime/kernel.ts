import type { ImageDisks } from './disk'
import type { ImageSource } from './image-source'
import type { LinuxVm } from './kernel-worker-host'
import kernelUrl from 'unkernel/unkernel.wasm?url'
import { checkSupport, createKernel, isMobile, loadKernelModule, webCpuBlocker } from 'unkernel/web'
import { shallowReactive } from 'vue'
import { openImageDisks } from './disk'
import { AHEAD_PRIORITY, summarizeDownloads, trackDownload } from './downloads'
import { openImageSource } from './image-source'
import { KernelWorkerHost } from './kernel-worker-host'

/**
 * The page's only Linux VM: unkernel's bundled kernel with its base initramfs, booting unkernel's Alpine 3.24
 * aarch64 image, plus the preinstalled-tools disk built by `image/` (zsh + jovial, bash, tmux, htop, git, less,
 * neovim). The base's /init mounts the Alpine image (labelled `kwroot`) read-only and the disk labelled `kwdata` at
 * /data, and makes / an overlay of the image under `/data/distros/alpine/upper`.
 * There is no network; the guest's writes stay in memory, so every page load starts from the same machine.
 * Every terminal session is a pty spawned on it.
 *
 * Where the page is cross-origin isolated (Chromium, through `public/coi-sw.js`), the kernel runs in a worker on
 * several CPUs (`kernel-worker.ts`); elsewhere on this thread, on one.
 *
 * Source: unkernel@0.2.0-261124-c08e977 `dist/web.d.mts` (`createKernel` with `distro`, `checkSupport`, `CowDisk`,
 * `BaseDisk`) and `guest/base/initramfs/init` in its repository (the overlay root).
 */
export interface LinuxMachine {
  vm: LinuxVm
  /** Why the machine is not the published one, shown at the top of each new terminal. */
  notice?: string
}

/** What the boot needs from the network, started together so that none waits for another. */
interface Downloads {
  /** The CPUs the guest will get: 1 runs the kernel on this thread. */
  cpus: number
  /** unkernel's kernel and its base initramfs (one wasm file), compiled while it downloads. */
  kernel: Promise<WebAssembly.Module>
  /** The images' files: the manifest, then both boot bundles at once; undefined without a built image. */
  source: Promise<ImageSource | undefined>
  /** The disks, on this thread (one CPU) or in the kernel's worker (several). */
  disks: Promise<ImageDisks | KernelWorkerHost | undefined>
}

// A thread can run only one kernel, so Vite HMR must reuse the machine instead of booting another.
let booting: Promise<LinuxMachine> | undefined = import.meta.hot?.data.booting
let downloads: Downloads | undefined = import.meta.hot?.data.downloads

/**
 * The guest's memory: what the talk's htop step shows (pages/keystroke.md), and plenty for its demos. unkernel's
 * default on desktops is 2 GiB (`autoMemoryMiB`), which boots no faster.
 */
const GUEST_MEMORY_MIB = 512

/**
 * The CPUs the guest gets where it can have several: unkernel's own page suggests half the device's threads, up to 4
 * on desktops and 2 on phones (unkernel README, `?cpus=`).
 */
const SMP_CPUS = 4
const SMP_CPUS_MOBILE = 2

/**
 * Several CPUs need shared memory, so a cross-origin isolated page (`public/coi-sw.js`), and a thread that may block,
 * so a worker (unkernel@0.2.0-261124-c08e977 `webCpuBlocker`). Elsewhere the kernel runs on this thread, on one.
 */
function guestCpus(): number {
  if (!globalThis.crossOriginIsolated || webCpuBlocker({ worker: true }) !== undefined)
    return 1
  return isMobile() ? SMP_CPUS_MOBILE : SMP_CPUS
}

/** The download progress entry of the kernel wasm; every other entry during the boot is the disk's. */
export const KERNEL_DOWNLOAD = 'unkernel.wasm'

/**
 * The machine's boot, in stages, for the terminals' boot screen: the two downloads run together, then the kernel
 * boots until the guest's kwtty accepts the first pty (`vm.spawn` waits for it; `createKernel` resolves at kernel
 * entry, before the guest's init).
 */
export interface BootStage {
  state: 'waiting' | 'active' | 'done' | 'failed'
  /** The boot stage: the CPUs the guest got. */
  cpus?: number
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
  const cpus = guestCpus()
  const source = openImageSource(manifestUrl())
  downloads = {
    cpus,
    // unkernel.wasm holds the single-CPU kernel and, in a custom section, the patch that makes it SMP: `smp` applies
    // it to the downloaded bytes, so that kernel compiles once the download ends instead of while it streams
    // (unkernel@0.2.0-261124-c08e977 `LoadOptions.smp`).
    kernel: kernelResponse.then(response => loadKernelModule(response, { smp: cpus > 1, onProgress: ({ loaded, done }) => kernelProgress(loaded, done) })),
    source,
    // The worker starts now, so the boot's disk reads load while the kernel still downloads.
    disks: source.then(images => images && (cpus > 1 ? new KernelWorkerHost(images) : openImageDisks(images.manifest, images.files.load))),
  }
  // A failed download is reported by the boot that awaits it; the progress bar stops counting it.
  downloads.kernel.then(
    () => setStage('kernel', { state: 'done', bytes: __KERNEL_WASM_BYTES__ }),
    () => {
      kernelProgress(0, true)
      setStage('kernel', { state: 'failed' })
    },
  )
  downloads.disks.then(disks => disks?.bootData).then(
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
 * Downloads the rest of both images (25 MB gzip in all, the Alpine image first) while the page is idle, so a
 * program's first run (htop, bat, tmux) reads it from memory instead of waiting for its chunks. Called when a shell has drawn its first prompt, or a while
 * after the boot when no terminal is shown: the page, the boot and the first prompt have all they need by then, and
 * the download is low priority, two files at a time.
 */
export function downloadRestOfDisk(): void {
  if (restStarted || !downloads)
    return
  restStarted = true
  void downloads.source.then(images => images && whenIdle().then(images.downloadRest)).catch(() => {})
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

  const [kernel, source, disks] = await Promise.all([downloads!.kernel, downloads!.source, downloads!.disks])
  setStage('boot', { state: 'active', startedAt: performance.now() })
  let vm: LinuxVm
  try {
    if (disks instanceof KernelWorkerHost) {
      setStage('boot', { cpus: await disks.boot(kernel, GUEST_MEMORY_MIB, downloads!.cpus) })
      vm = disks.vm
    }
    else {
      vm = await createKernel({ kernel, distro: disks?.distro, disks: disks ? [disks.disk] : [], memoryMiB: GUEST_MEMORY_MIB })
      setStage('boot', { cpus: 1 })
    }
  }
  catch (error) {
    setStage('boot', { state: 'failed' })
    throw error
  }
  setTimeout(downloadRestOfDisk, REST_AFTER_BOOT_MS)

  if (!source)
    return { vm, notice: `No preinstalled image at ${manifestUrl().pathname}: this is unkernel's base shell (busybox ash), without Alpine. Build it with \`pnpm build:image\` in present/terminal-glance.` }
  if (source.manifest.unkernel !== __UNKERNEL_VERSION__)
    return { vm, notice: `The image was built on unkernel ${source.manifest.unkernel}, the page runs ${__UNKERNEL_VERSION__}: rebuild it with \`pnpm build:image\`.` }
  return { vm }
}

function manifestUrl(): URL {
  return new URL('linux/manifest.json', new URL(import.meta.env.BASE_URL, location.href))
}
