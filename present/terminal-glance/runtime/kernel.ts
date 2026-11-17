import type { KernelInstance } from 'unkernel/web'
import { checkSupport, createKernel } from 'unkernel/web'

/**
 * The page's only Linux VM: unkernel's bundled Alpine 3.24 riscv64 booted from
 * its initramfs, in RAM, with no disk and no network, so every page load starts
 * from the same clean machine. Every terminal session is a pty spawned on it.
 *
 * Source: unkernel@0.1.0-261117-0e4b2ec `dist/web.d.mts` (`createKernel`, `checkSupport`).
 */

// A thread can run only one kernel, so Vite HMR must reuse the VM instead of booting another.
let booting: Promise<KernelInstance> | undefined = import.meta.hot?.data.booting

export function useKernel(): Promise<KernelInstance> {
  booting ??= bootKernel()
  if (import.meta.hot)
    import.meta.hot.data.booting = booting
  return booting
}

async function bootKernel(): Promise<KernelInstance> {
  const support = await checkSupport()
  if (!support.ok)
    throw new Error(`This browser cannot run the in-page Linux VM:\n${support.problems.join('\n')}`)

  return createKernel({ memoryMiB: 256 })
}
