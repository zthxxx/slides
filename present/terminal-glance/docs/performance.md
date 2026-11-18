# Performance

The deck is often opened over slow or high-latency links, where a single request can stall for seconds. Its heaviest part is Linux: the kernel wasm is 7.2 MB on the wire, and the disk of preinstalled tools 28.4 MB. Three goals shape everything here:

- The slide renders in seconds, whatever Linux is doing.
- Linux reaches its first prompt as soon as the link can carry the kernel.
- Nothing the talk does later (a step, `htop`'s first run) waits on the network.

This document lists what the build, the page and the guest image do toward these goals and what each measured, then the costs that remain. The disk format and the image build are described in [image.md](./image.md), the boot and the steps in [architecture.md](./architecture.md); the sections below link to them.

Sizes on the wire are in MB (10^6 bytes), to compare with link rates in Mbps: 3 Mbps is 375 KB/s. Disk-layout figures (1 MiB chunks, 16 KiB blocks) stay binary.

The local measurements used a local HTTP/2 server with gzip and ETag/304, mirroring GitHub Pages, and Chrome under Playwright. CDP `Network.emulateNetworkConditions` set the per-request latency and the bandwidth, which it splits equally between requests, ignoring fetch priority. Each cold run used a fresh profile, with 2 runs per variant. The measuring scripts are not in the repository.


## What the page downloads

Sizes from the current build; "wire" is what GitHub Pages sends (gzip).

| File | Wire | When |
| --- | ---: | --- |
| `index.html` | 0.7 KB | first |
| `assets/index-*.js`: Slidev, Vue, shiki and every slide (the `app` chunk) | 336 KB | before the first slide renders |
| `assets/terminal-*.js`: ghostty-web, with its wasm inlined, and unkernel's loader | 322 KB | before the first slide renders |
| `assets/style-*.css` | 35 KB | before the first slide renders |
| `assets/unkernel-alpine-*.wasm`: the kernel and its initramfs | 7.2 MB | from the start, at low priority |
| `linux/manifest.json` and the boot bundle | 1.1 MB | from the start, at low priority |
| Hack Nerd Font Mono, regular and bold | 2 × 1.25 MB | before the first terminal draws |
| `linux/chunks/*.gz`: the whole disk, 90 chunks of 1 MiB before gzip | 28.4 MB | after the first prompt, in the background |

The kernel wasm decides how soon Linux can start: 19 s at 3 Mbps, 2.3 s at 25 Mbps.

GitHub Pages gzips the wasm on the fly: 7,244,870 bytes against 12,769,684 raw. 4.0 MB of it is the initramfs, already gzip inside the wasm. GitHub never sends brotli; a pre-compressed file the browser can decode with its own `DecompressionStream('gzip')` (zopfli) would save 2.7 %, so the file is served as unkernel ships it.


## Building the page

| Setting | Where | Effect |
| --- | --- | --- |
| `build.rolldownOptions.output.codeSplitting` | `vite.config.ts` | The page is two scripts plus rolldown's 0.7 KB runtime: `terminal` (ghostty-web with its inlined wasm, and unkernel's loader) and `app` (Slidev, Vue, shiki and every slide). Moving between slides loads no script. It replaces Slidev's own `manualChunks`. |
| `build.cssCodeSplit: false` | `vite.config.ts` | One stylesheet instead of one per slide; slide styles are scoped, so loading them all at once is safe. |
| `preloadImages: false` | `slides.md` headmatter | Slide pictures load with their slides, which Slidev mounts about 3 s after opening, instead of competing with the scripts. |
| Shiki core with one grammar | `components/shell-highlight.ts` | The step buttons' highlighter carries the shell grammar, the two vitesse themes and the JavaScript regex engine, without oniguruma's wasm or other grammars: about 66 KB gzip of the `app` chunk. |
| An iframe loads on first view | `components/WebFrame.vue` | The embedded botmux page loads the first time its slide is shown, in the audience and presenter windows only. |

Measured locally at 400 ms latency and 3 Mbps. Before is `7d99b43`, with Slidev's default chunks.

| Measure | Before | After |
| --- | ---: | ---: |
| Scripts and stylesheets needed to render slide 5 | 28 | 4 |
| Slide 5, cold: rendered | 5.02 s | 2.86 s |
| Slide 1, cold: rendered | 4.02 s | 2.78 s |
| Requests until 1.5 s after the title shows `/dev/pts/0`, slide 5, cold | 139 | 43 |
| Reload after the cache expired: conditional requests | 147 | 51 |
| Reload after the cache expired: slide 5 rendered | 2.20 s | 0.96 s |

Without the boot bundle, which came later, most of the 43 requests were disk chunks.

The terminal emulator is ghostty-web 0.4.0, 185 KB gzip of the `terminal` chunk. xterm.js 6, the smallest usable alternative, would save 92 KB (0.24 s at 3 Mbps). It would also cost Ghostty's parser, native kitty images and 1-em rows (its rows are about 16 % taller). The kernel wasm alone is 39 times ghostty-web's size.


## Starting Linux's downloads early

| Mechanism | Where | Effect |
| --- | --- | --- |
| `preloadLinux()` | `vite.config.ts` | `index.html` preloads `linux/manifest.json`, the boot bundle and `unkernel-alpine.wasm` (`as="fetch"`, `crossorigin`, `fetchpriority="low"`), so they start before any script runs. |
| `prefetchLinux()` from the app setup | `setup/main.ts` | In the audience window, the app takes over the downloads and starts compiling the kernel as soon as it runs. Without this call, a deck opened on a slide with no terminal would start them only when Slidev pre-mounts the first terminal, about 3 s after the deck renders. In dev, where there are no preloads, this call starts the downloads. |
| Low fetch priority, in a build | `runtime/downloads.ts` (`AHEAD_PRIORITY`) | The kernel, the manifest and the boot data are `priority: 'low'` fetches, behind the deck's scripts and styles where the server honors priorities. A dev server serves about 700 modules over HTTP/1.1, where Chrome holds low-priority requests back until those finish, so dev keeps the default. |
| Streaming compile | `runtime/kernel.ts` | `loadKernelModule` compiles the wasm while it streams in. |

The `fetch()` calls in `kernel.ts` (the wasm, whose `Response` it hands to unkernel's `loadKernelModule`) and `disk.ts` (the manifest and the bundle) take over the preloaded responses. `as="fetch"` and `crossorigin` match a plain `fetch()`; with another `as`, or without `crossorigin`, each would make a second request, answered from the HTTP cache at best.

Every window preloads, the presenter's included, but only the audience window compiles and boots. Chrome serves a second window's request for a file still downloading from that one download, so an audience and a presenter window opened together fetch each file once. A presenter, overview or notes window opened alone downloads the 8 MB it never uses and logs "preloaded but not used" warnings; they are harmless.

Measured locally at 400 ms latency and 3 Mbps unless a row says otherwise. Before is `cf170ab`; after adds the preloads and the app-setup call, before the low priority. Scenario: open slide 1, go to slide 5 at 10 s.

| Measure | Before | After |
| --- | ---: | ---: |
| Kernel wasm request starts | 5.75 s | 0.41 s |
| Going to slide 5 → first prompt | 27.0 s | 23.5 s |
| The same at 2000 ms latency | 31.8 s | 26.6 s |
| First slide rendered | 2.8 s | 4.6 s |
| The same at 2000 ms latency | 6.4 s | 7.8 s |
| Warm reload of slide 5, a separate run → first prompt | 1.6 s | 1.0 s |

The first slide renders later because the emulated link shares its bandwidth equally, so the wasm slows the scripts; see [Remaining costs](#remaining-costs).


## Booting to the first prompt

### The boot bundle

At build time `image/vm/trace-boot.ts` boots the disk offline and records what the guest reads until zsh's first prompt and its plugin load, marked by `.zshrc` with `OSC 1337 SetUserVar` escapes. The boot reads 245 blocks of 16 KiB (3.8 MiB). They go into one gzip file of 1.1 MB, against 5.1 MB for the 23 chunks they come from in the current image. The page downloads it alongside the kernel, so the guest reads its boot from memory instead of waiting one round trip per chunk ([image.md](./image.md#the-published-format)).

Measured locally at 400 ms latency and 3 Mbps, cold load of slide 5. Before is `7d99b43`; times run from the manifest request, since that baseline also lacked the merged scripts.

| Measure | Before | After |
| --- | ---: | ---: |
| Manifest request → first prompt | 59.4 s | 31.8 s |
| Disk requests before the prompt | 37 chunks, 10.2 MB | 1 bundle, 1.1 MB |

The prompt appears 0.8 to 0.9 s after the kernel wasm finishes downloading, so the boot waits on the wasm alone.

Two rules keep a failed or long boot from costing extra downloads:
- When the bundle fails to download, the boot chunks are fetched 6 at a time.
- Every fetched file is kept as published (`ImageFiles` in `runtime/disk.ts`), so none is downloaded twice; a prefetched chunk also stays decompressed until the guest has read it.

`test/disk.test.ts` covers both with property tests.

### The shell's start

The image loads two zsh plugins: the jovial theme, and fast-syntax-highlighting in zinit's turbo mode, after the first prompt, which appears 0.6 to 0.9 s after zsh starts. node, python3 and zoxide are left out, and the build fails if they come back as a dependency: without them the published image is 22.7 MiB gzip instead of 58.5 MiB (at `ce872b1`).

The image ships fast-syntax-highlighting's secondary theme in `~/.config/fsh`. Without the file, the plugin tries to download it at every start, and with no network that holds typed keys for 5 s. The first typed key echoes after 19 to 23 ms; without the file it took 5051 ms ([image.md](./image.md#shell-start-time)).

### The boot screen

Until its shell's first output, a terminal shows the boot stages:
- download kernel and download disk, with their bytes;
- boot Linux, with its time;
- start shell.

The screen uses the system's monospace font. The terminal font is `font-display: block`, so text set in it would stay invisible until its 1.25 MB file arrives.


## After the first prompt

### The whole disk in the background

When a shell first writes output (its first prompt), or 5 s after the kernel starts, whichever comes first, and once the page is idle, every chunk not fetched yet downloads in disk order. In a build it runs at low priority, two at a time, and it stays out of the terminals' progress bar. Fetched files are kept as published, gzip, 28.4 MB for the whole image; a read decompresses its chunk. A program's first run then reads from memory.

Until the background download has a chunk, a guest read of it fetches it at once at normal priority, with the next two chunks. A chunk the background download is already fetching is not requested again; the read waits for that fetch.

Measured locally at 200 ms latency and 1.5 MB/s (12 Mbps), cold load of slide 5:

| Measure | Before | After |
| --- | ---: | ---: |
| First prompt | 13.7 s | 13.95 s |
| Whole disk downloaded | never; each chunk on its first read | 38.7 s |
| `htop`'s first run after the download: requests | one per chunk it reads | 0 |

### Steps

zsh with syntax highlighting redraws its line once per read, so the number of writes decides when the echo ends. A step types its text within a 600 ms schedule in at most about 24 writes; the longest steps (90 to 270 characters) are typed and echoed, Enter included, 540 to 660 ms after the click ([architecture.md](./architecture.md#steps)).

The emulator parses each write synchronously, and the pty's output is written into it one chunk at a time, each after the last has been parsed. A flood such as `yes` is therefore paced by the pty's flow control instead of piling up in the page.


## Caching and hosting

Script, stylesheet and wasm names carry a content hash, and disk chunks and the boot bundle are named by content. `index.html` and `linux/manifest.json` keep their names, so a new deploy is picked up. GitHub Pages serves every file with `cache-control: max-age=600`: a reload within 10 minutes makes no request for them, and a later one revalidates each with one conditional request.

The site is served by GitHub Pages directly: Cloudflare resolves `slides.zthxxx.me` as DNS only, and GitHub Pages provides the HTTPS certificate. Proxied through Cloudflare, the author's network reached it through Los Angeles, where requests stalled for seconds and the deck did not render within 180 s.


## Building the image

Most of an image build is apk downloading packages. `image/build.ts` first downloads the guest's package index (`v3.24/main/riscv64/APKINDEX.tar.gz`) from the official CDN and four mirrors (Aliyun, TUNA, USTC, SJTU) at once and installs from the fastest; `ALPINE_MIRROR=<url>` skips the probe. From the author's network the official CDN delivered about 30 KB/s, and a build took over 7 minutes. With the probe, provisioning takes 50 to 80 s and the whole build about 1.5 minutes. When apk fails on the chosen mirror, `setup.sh` installs again from the official repositories. A build that runs past 5 minutes (`--timeout-min`) stops with an error ([image.md](./image.md#building)).

`pnpm build:image` skips when the input hash matches, and reruns only the trace when the manifest lacks one. CI runs it on every push without a cache, so CI always pays the full build.


## Live site

Measured on the live site, Chrome with an empty cache, slide 5. `7d99b43` predates the chunk settings, the preloads and the boot bundle; its link speed was not recorded. On `575af3b` the 7.2 MB kernel arrived within about 3 s. On `fc871bf`, curl measured the wasm at 275 KB/s (2.2 Mbps).

| Measure | `7d99b43` | `575af3b` | `fc871bf`, 2.2 Mbps |
| --- | ---: | ---: | ---: |
| Slide rendered | 2.3 s | 1.2 to 1.7 s | 8.4 to 12.5 s |
| Title shows `/dev/pts/0` | 8.8 s | 3.1 to 3.4 s | not measured |
| Requests until `/dev/pts/0` | 134 | 14 | not measured |
| First prompt | not measured | not measured | 17 and 24 s; a third run had none within 120 s |
| Requests until the first prompt | not measured | not measured | 19 |

With the cache warm, `fc871bf` rendered the slide in 0.08 to 0.24 s and drew the first prompt in 0.72 to 0.79 s; `575af3b` rendered the slide in 0.09 to 0.14 s and spawned the shell in 0.3 s.


## Remaining costs

- **The kernel preload shares a slow link with the scripts.** At 2.2 Mbps the page's 700 KB of scripts and styles need about 2.5 s, yet the slide rendered after 8.4 to 12.5 s. The timings suggest the path does not honor `fetchpriority="low"`, so the scripts share the bandwidth with the 7.2 MB wasm and the boot bundle; the cause was not isolated. The Google Fonts stylesheet, which `index.html` places before the module script, also blocks it. Dropping the wasm's preload tag, while keeping the manifest's and the bundle's, would let the scripts go first; `setup/main.ts` would still start the wasm once the app runs.
- **The terminal font.** Hack Nerd Font Mono's regular and bold files are 1.25 MB each, and the first terminal waits for both.
- **Fira Code** comes from Google Fonts through a stylesheet that blocks rendering (the theme's `fonts.mono`), one more host to reach before the first slide.
- **Slide 1 loads the `terminal` chunk** (322 KB, 0.86 s at 3 Mbps) because the slides import the terminal components statically. Importing `ghostty-web` and `unkernel/web` dynamically would take it off slide 1's path.
- **The whole disk downloads on every cold visit:** 28.4 MB after the first prompt, about 100 s at 2.2 Mbps, kept in page memory for the session with up to 32 decompressed 1 MiB chunks.
- **The wasm relies on GitHub Pages' gzip,** which GitHub does not document. Served uncompressed, it would grow by 5.5 MB, about 15 s at 3 Mbps; a zopfli `.wasm.gz` decoded with `DecompressionStream('gzip')` would remove that dependence.
- **After 10 minutes** every file is revalidated with one round trip.
