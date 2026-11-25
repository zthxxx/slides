# Cross-origin isolation and the guest's CPUs

The deck runs its Linux on 4 CPUs (2 on phones) in Chrome, Firefox and Safari, wherever the page is cross-origin isolated, and on 1 CPU elsewhere. This document describes how the page gets isolated, what runs where, the rules this sets for the slides' content, and the problems met on the way, each with its symptom.

What 4 CPUs change, measured in [performance.md](./performance.md#four-cpus): a slide with two terminals shows both prompts in half the time, parallel work runs 3.5 times as fast, a single program runs as fast as on one CPU, and the boot takes about 0.25 s longer.

## Why isolation

unkernel 0.2.0 runs the guest on several CPUs, each in a thread of its own on one shared memory (`createKernel({ cpus })`). That needs two things of the page (unkernel@0.2.0-261124-c08e977 `webCpuBlocker`):

- **A `SharedArrayBuffer`,** which a browser gives only to a cross-origin isolated page: one whose document is served with `Cross-Origin-Opener-Policy: same-origin` and a `Cross-Origin-Embedder-Policy`.
- **A thread that may block.** An SMP Linux's CPUs wait on one another, for example for a lock another CPU holds or for another CPU to finish work it was asked to do. In unkernel such a wait blocks the waiting CPU's thread (`memory.atomic.wait32`, wasm's `Atomics.wait`) until the other CPU wakes it. A page's main thread may not block, so with several CPUs the kernel runs in a worker. CPU 0's idle wait for the other CPUs is the exception: it does not block, it uses `Atomics.waitAsync`, which `webCpuBlocker` also checks for. With one CPU there is no other CPU to wait for, so the kernel can run on the page's thread.

`runtime/kernel.ts` (`guestCpus`) asks for 4 CPUs (2 on phones, as unkernel's own page suggests) when the page is isolated and `webCpuBlocker({ worker: true })` finds nothing missing, and runs the kernel on the page's thread on 1 CPU otherwise. The boot screen's "Boot Linux" row shows the count when it is more than one.

## How the page gets isolated

The deck sends the headers unkernel.dev sends from its server: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

| Where | Who sends the headers | First load |
| --- | --- | --- |
| unkernel.dev, for comparison | its server (Vercel) | 4 CPUs |
| The dev server | Vite, `server.headers` in `vite.config.ts` | 4 CPUs |
| A build, on GitHub Pages | the service worker `public/coi-sw.js` | reloads once, then 4 CPUs |

GitHub Pages cannot send headers, so in a build:

- **`public/coi-sw.js`** adds the two headers to the deck's documents (`navigate` requests) and worker scripts (destination `worker`). The page's other requests (`cors`, `no-cors`: fetches, scripts, styles, images, fonts) go to the network without waking it, through ServiceWorker static routing (Chrome 123+); elsewhere its fetch handler passes them through.
- **`runtime/isolate-page.js`**, which `vite.config.ts` (`isolatePage`) inlines at the top of the build's `index.html` so that it runs before the app's scripts, registers the worker with the deck's base as its scope. A load the worker did not serve, such as the first visit, is not isolated, so once the worker is active the script reloads the page, at most once per tab session (sessionStorage). A load that stays unisolated after that reload runs on 1 CPU instead of reloading again; without sessionStorage there is no reload.
- **Updates replace the old worker.** The browser fetches the worker's script past the HTTP cache (`updateViaCache: 'none'`), and a changed script takes over at once (`skipWaiting`, `clients.claim`), so no page keeps an old version. `isolate-page.js` also unregisters every other registration under the deck's scope, such as one an older script URL or scope left.
- **The dev server needs no worker.** The dev page unregisters a `coi-sw.js` that an earlier version of the deck registered on its origin (`setup/main.ts`).

`require-corp` is the embedder policy Chrome, Firefox and Safari all support; `credentialless` is not in Safari, and the iframe variant it pairs with (`<iframe credentialless>`) is only in Chromium.

## What runs where

| Part | 1 CPU | 4 CPUs |
| --- | --- | --- |
| The kernel | the page's thread | `runtime/kernel-worker.ts`, a Web Worker; unkernel starts one more worker per extra CPU |
| The disks (`disk.ts`) | the page's thread | the kernel's worker |
| Fetching the images' files (`image-source.ts`) | the page's thread | the page's thread |
| The kernel's load | compiled while it streams | patched for SMP, then compiled |

- **The kernel's worker is the deck's own.** unkernel's worker mode (`worker: true`) takes disks only as specs it builds itself (a file, an HTTP image read by range, its IndexedDB data disk), not the deck's chunked images with their boot bundles. `kernel-worker.ts` runs unkernel inline in a worker instead, with the same disks as the 1-CPU path.
- **Files are fetched on the page's thread** whichever thread runs the kernel: the page owns index.html's preloads and the terminals' progress bar. The worker asks for a file by name (`load`), and a copy of its bytes as published crosses back (`file`). The messages are in `kernel-worker-protocol.ts`, the page's side in `kernel-worker-host.ts`.
- **A pty's output crosses one chunk per `pull`.** The page's stream asks for the next chunk once the terminal has taken the last, so the guest still waits while the terminal is behind, as with an inline pty.
- **The SMP kernel is patched from the bundle.** `unkernel.wasm` holds the single-CPU kernel and, in a custom section (`unkernel.kernel.smp.kwpatch`), the patch that makes it SMP. `loadKernelModule(response, { smp: true })` reads the whole download, applies the patch (about 90 ms) and compiles the result; the 1-CPU path compiles while the download streams.

## Rules for the slides' content

Under `require-corp`, a resource from another site loads only if its response has `Cross-Origin-Resource-Policy: cross-origin`, or if it is requested with CORS and the response has `Access-Control-Allow-Origin` ([authoring.md](./authoring.md#resources-from-other-sites)).

| Resource | Why it loads |
| --- | --- |
| Google Fonts stylesheet and font files, the jsdelivr favicon, GitHub avatars | they send `Cross-Origin-Resource-Policy: cross-origin` |
| The botmux demo video (`WebVideo.vue`) | `<video crossorigin="anonymous">`; GitHub Pages sends `Access-Control-Allow-Origin: *` |
| The closing slide's badgen badge | `<img crossorigin="anonymous">`; badgen sends CORS headers but no CORP |

- No iframe of another site: it loads only if that site opts in to the embedder policy, which a GitHub Pages site cannot.
- A Markdown image (`![](…)`) is not a CORS request: an image from a site without CORP needs the HTML tag with `crossorigin`.
- Check a new external resource with `curl -sI <url>` for either header before using it.

## Problems met, and what the deck does

| Symptom | Cause | What the deck does |
| --- | --- | --- |
| The console logs `[host] this kernel is not SMP: 4 CPUs asked, it runs on one`; `nproc` prints 1 | The kernel was handed over as an already compiled module, which unkernel uses as it is: the SMP patch is applied to the bytes | `loadKernelModule(…, { smp: true })` on the 4-CPU path |
| The kernel's worker never starts; its script fails with `net::ERR_BLOCKED_BY_RESPONSE` | An isolated page starts a worker only if the worker script's response has an embedder policy too | The service worker adds the headers to worker scripts, and static routing leaves `same-origin` requests (module worker scripts) to it |
| A plain iframe of the botmux page fails with `ERR_BLOCKED_BY_RESPONSE` (Chrome) | A cross-origin iframe loads under COEP only if its site opts in; only Chromium's `<iframe credentialless>` gets around that, and Firefox and Safari have no such iframe | The deck embeds no iframe: the slide plays the page's video with a link to the page |
| An image fails with `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep` | It came from a site without CORP, as a Markdown image (`no-cors`) | `<img crossorigin="anonymous">` from a site with CORS headers |
| htop shows one CPU and 494 MiB on the first visit | The first navigation was not served by the service worker, so the page was not isolated | `isolate-page.js` reloads the first visit once the worker is active |
| A head script added with `transformIndexHtml` is missing in dev | Slidev's dev server answers `/index.html` from its own middleware, without Vite's HTML transforms (@slidev/cli@53.1.0 `dist/serve-*.mjs`); a deck-root `index.html` is ignored by the repository's `.gitignore` and deleted by `pnpm clean` | The dev server sends the headers itself; the script is inlined in builds only |
| A service worker that an earlier version registered stays on the dev origin (`localhost:3034`, scope `/`) | It outlives the deck, and would add COOP and COEP to any other site served later on that port | The dev page unregisters `coi-sw.js` |
| A hard reload (Shift) runs on 1 CPU | It bypasses service workers; in Chrome 157 the page's own reload after it was not isolated either | The one reload per tab session stops there instead of looping; a normal reload is isolated again |
| A pty bridge that transfers the output stream would fail in Safari | Safari cannot transfer a `ReadableStream` to another thread, as unkernel.dev's own service worker notes (`vm-sw.js`) | Output crosses as messages, one chunk per `pull` |
| With `COEP: credentialless`, the app started about 0.85 s later than without isolation | Cross-origin `no-cors` requests are made without credentials on connections of their own, so the render-blocking Google Fonts stylesheet needed a new one | `require-corp`: the stylesheet sends CORP and keeps the shared connection |

## Checking it

- In a terminal, `nproc` prints `4`, and htop shows CPUs 0 to 3 with about 470 MiB; with 1 CPU, 494 MiB.
- In the console, `crossOriginIsolated` is `true`.
- Dev: `curl -sI http://localhost:3034/` shows both headers.
- A build: DevTools > Application > Service workers shows one worker, `coi-sw.js`, for the deck's scope; `(await navigator.serviceWorker.getRegistrations()).length` is 1.
- A first visit needs a browser profile that has never opened the origin. `playwright-cli` keeps one Chrome profile across its sessions, so a service worker from an earlier run carries over: give such a run its own `--profile` directory.
