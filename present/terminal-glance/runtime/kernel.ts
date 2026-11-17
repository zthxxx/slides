import type { KernelInstance } from 'unkernel/web'
import { checkSupport, createKernel } from 'unkernel/web'
import { openImageDisk } from './disk'

/**
 * The page's only Linux VM: unkernel's bundled kernel and Alpine 3.24 riscv64 initramfs,
 * plus the preinstalled-tools disk built by `image/` (zsh + jovial, bash, node, python, git, ...).
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

// A thread can run only one kernel, so Vite HMR must reuse the machine instead of booting another.
let booting: Promise<LinuxMachine> | undefined = import.meta.hot?.data.booting

export function useLinux(): Promise<LinuxMachine> {
  booting ??= bootLinux()
  if (import.meta.hot)
    import.meta.hot.data.booting = booting
  return booting
}

async function bootLinux(): Promise<LinuxMachine> {
  const support = await checkSupport()
  if (!support.ok)
    throw new Error(`This browser cannot run the in-page Linux VM:\n${support.problems.join('\n')}`)

  const manifestUrl = new URL('linux/manifest.json', new URL(import.meta.env.BASE_URL, location.href))
  const image = await openImageDisk(manifestUrl)
  const vm = await createKernel({ disks: image ? [image.disk] : [] })

  if (!image)
    return { vm, notice: `No preinstalled image at ${manifestUrl.pathname}: this is bare Alpine (busybox ash). Build it with \`pnpm build:image\` in present/terminal-glance.` }
  if (image.manifest.unkernel !== __UNKERNEL_VERSION__)
    return { vm, notice: `The image was built on unkernel ${image.manifest.unkernel}, the page runs ${__UNKERNEL_VERSION__}: rebuild it with \`pnpm build:image\`.` }
  return { vm }
}
