import type { Plugin, ResolvedConfig, UserConfig } from 'vite'
import type { DiskManifest } from './runtime/disk'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { version: unkernelVersion } = require('unkernel/package.json') as { version: string }

/**
 * Starts Linux's downloads from index.html, in parallel with the app's scripts instead of after them: the disk
 * manifest, the boot bundle it names, and the kernel wasm. A `fetch()` of the same URL (runtime/kernel.ts, which
 * hands the wasm's response to unkernel's `loadKernelModule`, and runtime/disk.ts) takes over the preloaded response
 * when destination, mode and credentials match, hence `as="fetch"` and `crossorigin`; the cache mode is not
 * compared. `fetchpriority="low"` keeps them behind the scripts, styles and visible images
 * when the server honors HTTP/2 or HTTP/3 priorities. Every window preloads; another window opened meanwhile, such
 * as the presenter, shares the download through the HTTP cache.
 * Ref: HTML Standard, "preload key" (https://html.spec.whatwg.org/multipage/links.html#preload-key);
 * unkernel@0.1.0-261117-0e4b2ec `dist/_chunks/core.mjs` (`loadKernelModule` accepts a `Response`).
 */
function preloadLinux(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'terminal-glance:preload-linux',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    transformIndexHtml: {
      // After Vite's own tags, so the browser requests the app's scripts and styles first.
      order: 'post',
      handler(_, { bundle }) {
        const kernel = Object.values(bundle ?? {}).find(file => file.type === 'asset' && file.names.includes('unkernel-alpine.wasm'))
        if (!kernel)
          throw new Error('terminal-glance:preload-linux: no unkernel-alpine.wasm in the bundle')
        // Missing in a fresh checkout without `pnpm build:image`; the page then boots bare Alpine.
        const manifestFile = path.join(config.publicDir, 'linux/manifest.json')
        const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) as DiskManifest : undefined
        const files = [
          ...manifest ? ['linux/manifest.json'] : [],
          ...manifest?.bootBundle ? [`linux/${manifest.bootBundle.file}`] : [],
          kernel.fileName,
        ]
        return files.map(file => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'fetch', crossorigin: true, fetchpriority: 'low', href: config.base + file },
          injectTo: 'head',
        }))
      },
    },
  }
}

export default {
  define: {
    // The page compares it with the version the published disk image was provisioned on (runtime/kernel.ts).
    __UNKERNEL_VERSION__: JSON.stringify(unkernelVersion),
    // The kernel's progress bar total (runtime/kernel.ts); the wire size is smaller when the server gzips it.
    __KERNEL_WASM_BYTES__: JSON.stringify(statSync(require.resolve('unkernel/alpine.wasm')).size),
  },
  optimizeDeps: {
    // unkernel@0.1.0-261117-0e4b2ec `dist/web.mjs` loads its kernel as
    // `new URL('./unkernel-alpine.wasm', import.meta.url)`; pre-bundling would move the module away from that file.
    exclude: ['unkernel'],
  },
  plugins: [preloadLinux()],
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
