import type { UserConfig } from 'vite'

export default {
  optimizeDeps: {
    // unkernel@0.1.0-261117-0e4b2ec `dist/web.mjs` loads its kernel as
    // `new URL('./unkernel-alpine.wasm', import.meta.url)`; pre-bundling would move the module away from that file.
    exclude: ['unkernel'],
  },
} satisfies UserConfig
