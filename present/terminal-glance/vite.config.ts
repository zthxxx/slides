import type { UserConfig } from 'vite'
import { createRequire } from 'node:module'

const { version: unkernelVersion } = createRequire(import.meta.url)('unkernel/package.json') as { version: string }

export default {
  define: {
    // The page compares it with the version the published disk image was provisioned on (runtime/kernel.ts).
    __UNKERNEL_VERSION__: JSON.stringify(unkernelVersion),
  },
  optimizeDeps: {
    // unkernel@0.1.0-261117-0e4b2ec `dist/web.mjs` loads its kernel as
    // `new URL('./unkernel-alpine.wasm', import.meta.url)`; pre-bundling would move the module away from that file.
    exclude: ['unkernel'],
  },
} satisfies UserConfig
