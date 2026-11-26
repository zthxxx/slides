/// <reference types="@slidev/types" />
import type { Plugin, ResolvedConfig, UserConfig } from 'vite'
import type { DiskManifest } from './runtime/disk'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { crossOriginMedia } from './vite/cross-origin-media'

const require = createRequire(import.meta.url)
const { version: unkernelVersion } = require('unkernel/package.json') as { version: string }

/**
 * Starts Linux's downloads from index.html, in parallel with the app's scripts instead of after them: the disk
 * manifest, the boot bundles it names (the data disk's and the distro image's), and the kernel wasm. A `fetch()` of the same URL (runtime/kernel.ts, which
 * hands the wasm's response to unkernel's `loadKernelModule`, and runtime/disk.ts) takes over the preloaded response
 * when destination, mode and credentials match, hence `as="fetch"` and `crossorigin`; the cache mode is not
 * compared. `fetchpriority="low"` keeps them behind the scripts, styles and visible images
 * when the server honors HTTP/2 or HTTP/3 priorities. Every window preloads; another window opened meanwhile, such
 * as the presenter, shares the download through the HTTP cache.
 * Ref: HTML Standard, "preload key" (https://html.spec.whatwg.org/multipage/links.html#preload-key);
 * unkernel@0.2.0-261124-c08e977 `dist/web.d.mts` (`loadKernelModule` accepts a `Response`).
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
        const kernel = Object.values(bundle ?? {}).find(file => file.type === 'asset' && file.names.includes('unkernel.wasm'))
        if (!kernel)
          throw new Error('terminal-glance:preload-linux: no unkernel.wasm in the bundle')
        // Missing in a fresh checkout without `pnpm build:image`; the page then boots unkernel's base shell.
        const manifestFile = path.join(config.publicDir, 'linux/manifest.json')
        const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) as DiskManifest : undefined
        const files = [
          ...manifest ? ['linux/manifest.json'] : [],
          ...manifest?.bootBundle ? [`linux/${manifest.bootBundle.file}`] : [],
          ...manifest?.distro?.bootBundle ? [`linux/${manifest.distro.bootBundle.file}`] : [],
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
    __KERNEL_WASM_BYTES__: JSON.stringify(statSync(require.resolve('unkernel/unkernel.wasm')).size),
  },
  optimizeDeps: {
    // unkernel@0.2.0-261124-c08e977 `dist/web.mjs` finds its kernel as `new URL('./unkernel.wasm', import.meta.url)`
    // (`bundledKernelUrl`); pre-bundling would move the module away from that file.
    exclude: ['unkernel'],
  },
  plugins: [preloadLinux()],
  slidev: {
    // Slidev passes these to its @vitejs/plugin-vue, which compiles the slides' Markdown and the components
    // (@slidev/cli@53.1.0 `dist/serve-*.mjs`, `createVuePlugin`).
    vue: { template: { compilerOptions: { nodeTransforms: [crossOriginMedia] } } },
  },
  server: {
    // Cross-origin isolation for Linux's 4 CPUs (runtime/kernel.ts), sent by the dev server itself, as unkernel.dev's
    // server does; Slidev's own index.html middleware applies these too (@slidev/cli@53.1.0 `dist/serve-*.mjs`).
    // On the site, Cloudflare Pages sends the same two from the repository root's `public/_headers`.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // runtime/kernel-worker.ts imports unkernel, whose web entry loads its GL renderer with a dynamic import: an IIFE
  // worker (Vite's default) cannot split it off.
  worker: { format: 'es' },
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
