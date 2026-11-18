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
  build: {
    // One stylesheet instead of one per slide: the slides' own styles are scoped, so loading them all up front is safe.
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        // The deck is read over links where each request may stall for seconds, so the page loads as two scripts
        // instead of about 80 (Slidev's per-slide and per-route chunks). `terminal` holds ghostty-web (its wasm is
        // inlined) and unkernel's loader; `app` holds everything else, including every slide, so moving between
        // slides needs no request. `codeSplitting` replaces the `manualChunks` Slidev sets, whose groups
        // (shiki, vue, icons) end up in `app`.
        // Ref: @slidev/cli@53.1.0 `dist/serve-*.mjs` (manualChunks), rolldown@1.2.19 `output.codeSplitting`.
        codeSplitting: {
          groups: [
            { name: 'terminal', test: /[\\/]node_modules[\\/](?:ghostty-web|unkernel)[\\/]/, priority: 2 },
            { name: 'app', test: () => true, priority: 1 },
          ],
        },
      },
    },
  },
} satisfies UserConfig
