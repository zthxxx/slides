# Performance

The deck is often opened over slow or high-latency links, where a single request can stall for seconds. Its heaviest part is Linux: the kernel wasm is 4.4 MB on the wire, and the two disk images, unkernel's Alpine and the preinstalled tools, 25.4 MB. Three goals shape everything here:

- The slide renders in seconds, whatever Linux is doing.
- Linux reaches its first prompt as soon as the link can carry the kernel.
- Nothing the talk does later (a step, `htop`'s first run) waits on the network.

This document lists what the build, the page and the guest image do toward these goals and what each measured, then the costs that remain. The disk format and the image build are described in [image.md](./image.md), the boot and the steps in [architecture.md](./architecture.md); the sections below link to them.

Sizes on the wire are in MB (10^6 bytes), to compare with link rates in Mbps: 3 Mbps is 375 KB/s. Disk-layout figures (1 MiB chunks, 16 KiB blocks) stay binary.

The local measurements used a local HTTP/2 server with gzip and ETag/304, mirroring GitHub Pages, and Chrome under Playwright. CDP `Network.emulateNetworkConditions` set the per-request latency and the bandwidth, which it splits equally between requests, ignoring fetch priority. Each cold run used a fresh profile, with 2 runs per variant. The measuring scripts are not in the repository.


## What the page downloads

Sizes from the current build; "wire" is the gzip size, from a local level-6 gzip, which matched GitHub Pages' on-the-fly gzip within 0.5 % for unkernel 0.1.0's wasm.

| File | Wire | When |
| --- | ---: | --- |
| `index.html` | 0.7 KB | first |
| `assets/index-*.js`: Slidev, Vue, shiki and every slide (the `app` chunk) | 341 KB | before the first slide renders |
| `assets/terminal-*.js`: ghostty-web, with its wasm inlined, and unkernel's loader | 386 KB | before the first slide renders |
| `assets/style-*.css` | 35 KB | before the first slide renders |
| `assets/unkernel-*.wasm`: the kernel and its base initramfs | 4.4 MB | from the start, at low priority |
| `linux/manifest.json` and the two boot bundles (data disk, Alpine image) | 1.8 MB | from the start, at low priority |
| Hack Nerd Font Mono, regular and bold | 2 × 1.25 MB | before the first terminal draws |
| `linux/distro/chunks/*.gz` and `linux/chunks/*.gz`: both images, 4 and 87 chunks of 1 MiB before gzip | 25.4 MB | after the first prompt, in the background |

The kernel wasm and the two boot bundles, 6.3 MB, decide how soon Linux can start: 17 s at 3 Mbps, 2.0 s at 25 Mbps.

GitHub Pages gzips the wasm on the fly: unkernel 0.2.0's `unkernel.wasm` is 11,440,861 bytes raw and 4,419,116 gzip. It carries only the base initramfs, uncompressed; Alpine comes as its own image. GitHub never sends brotli; on unkernel 0.1.0's wasm a pre-compressed file the browser decodes with its own `DecompressionStream('gzip')` (zopfli) saved 2.7 %, so the file is served as unkernel ships it.


## Building the page

| Setting | Where | Effect |
| --- | --- | --- |
| `build.rolldownOptions.output.codeSplitting` | `vite.config.ts` | The page is two scripts plus rolldown's 0.7 KB runtime: `terminal` (ghostty-web with its inlined wasm, and unkernel's loader) and `app` (Slidev, Vue, shiki and every slide). Moving between slides loads no script. It replaces Slidev's own `manualChunks`. |
| `build.cssCodeSplit: false` | `vite.config.ts` | One stylesheet instead of one per slide; slide styles are scoped, so loading them all at once is safe. |
| `preloadImages: false` | `slides.md` headmatter | Slide pictures load with their slides, which Slidev mounts about 3 s after opening, instead of competing with the scripts. |
| Shiki core with one grammar | `components/shell-highlight.ts` | The step buttons' highlighter carries the shell grammar, the two vitesse themes and the JavaScript regex engine, without oniguruma's wasm or other grammars: about 66 KB gzip of the `app` chunk. |
| A video loads on first view | `components/WebVideo.vue` | The botmux demo video (4.4 MB) loads the first time its slide is shown, in the audience and presenter windows only. |

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

The terminal emulator is ghostty-web 0.4.0, 185 KB gzip of the `terminal` chunk. xterm.js 6, the smallest usable alternative, would save 92 KB (0.24 s at 3 Mbps). It would also cost Ghostty's parser, native kitty images and 1-em rows (its rows are about 16 % taller). The kernel wasm alone is 24 times ghostty-web's size.


## Starting Linux's downloads early

| Mechanism | Where | Effect |
| --- | --- | --- |
| `preloadLinux()` | `vite.config.ts` | `index.html` preloads `linux/manifest.json`, the two boot bundles and `unkernel.wasm` (`as="fetch"`, `crossorigin`, `fetchpriority="low"`), so they start before any script runs. |
| `prefetchLinux()` from the app setup | `setup/main.ts` | In the audience window, the app takes over the downloads and starts compiling the kernel as soon as it runs. Without this call, a deck opened on a slide with no terminal would start them only when Slidev pre-mounts the first terminal, about 3 s after the deck renders. In dev, where there are no preloads, this call starts the downloads. |
| Low fetch priority, in a build | `runtime/downloads.ts` (`AHEAD_PRIORITY`) | The kernel, the manifest and the boot data are `priority: 'low'` fetches, behind the deck's scripts and styles where the server honors priorities. A dev server serves about 700 modules over HTTP/1.1, where Chrome holds low-priority requests back until those finish, so dev keeps the default. |
| Streaming compile | `runtime/kernel.ts` | `loadKernelModule` compiles the wasm while it streams in. |

The `fetch()` calls in `kernel.ts` (the wasm, whose `Response` it hands to unkernel's `loadKernelModule`) and `disk.ts` (the manifest and the bundles) take over the preloaded responses. `as="fetch"` and `crossorigin` match a plain `fetch()`; with another `as`, or without `crossorigin`, each would make a second request, answered from the HTTP cache at best.

Every window preloads, the presenter's included, but only the audience window compiles and boots. Chrome serves a second window's request for a file still downloading from that one download, so an audience and a presenter window opened together fetch each file once. A presenter, overview or notes window opened alone downloads the 6.3 MB it never uses and logs "preloaded but not used" warnings; they are harmless.

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

At build time `image/vm/trace-boot.ts` boots both images offline and records what the guest reads from each until zsh's first prompt and its plugin load, marked by `.zshrc` with `OSC 1337 SetUserVar` escapes. From the data disk the boot reads 243 blocks of 16 KiB (3.8 MiB); they go into one gzip file of 0.95 MB, against 3.0 MB for the 21 chunks they come from. From the Alpine image it reads the first 58 blocks, a 0.89 MB file. The page downloads both alongside the kernel, so the guest reads its boot from memory instead of waiting one round trip per chunk ([image.md](./image.md#the-published-format)).

Measured locally at 400 ms latency and 3 Mbps, cold load of slide 5. Before is `7d99b43`; times run from the manifest request, since that baseline also lacked the merged scripts.

| Measure | Before | After |
| --- | ---: | ---: |
| Manifest request → first prompt | 59.4 s | 31.8 s |
| Disk requests before the prompt | 37 chunks, 10.2 MB | 1 bundle, 1.1 MB |

The prompt appears about 0.3 s after the kernel wasm finishes downloading ([unkernel 0.2.0](#unkernel-020)), so the boot waits on the wasm alone.

Two rules keep a failed or long boot from costing extra downloads:
- When the bundle fails to download, the boot chunks are fetched 6 at a time.
- Every fetched file is kept as published (`ImageFiles` in `runtime/disk.ts`), so none is downloaded twice; a prefetched chunk also stays decompressed until the guest has read it.

`test/disk.test.ts` covers both with property tests.

### unkernel 0.2.0

unkernel 0.2.0 replaced its riscv64 CPU with an aarch64 one and split the guest: `unkernel.wasm` holds the kernel and a base initramfs, and each distro is a separate erofs image in the release. The deck publishes the Alpine image as chunks with its own boot bundle ([image.md](./image.md#what-the-image-is)), so the boot downloads the kernel and two bundles.

Measured locally with Chrome 157, cold load of slide 5, 2 runs each at 400 ms latency and 3 Mbps. Before is `17348f7` on unkernel 0.1.0-261117-0e4b2ec, after the same deck on 0.2.0-261124-c08e977; the runs of each varied by under 20 ms.

| Measure | 0.1.0 | 0.2.0 |
| --- | ---: | ---: |
| Linux downloads before the first prompt | 3 requests, 8.19 MB | 4 requests, 6.26 MB |
| Kernel wasm on the wire | 7.21 MB | 4.42 MB |
| Navigation → first prompt | 33.2 s | 28.2 s |
| Kernel downloaded → first prompt | 0.32 to 0.34 s | 0.30 to 0.31 s |

Without throttling, 3 runs each, the downloads end within 40 ms of navigation, and the time to the prompt is the page's own start-up and the boot:

| Measure | 0.1.0 | 0.2.0 |
| --- | ---: | ---: |
| Kernel compile (streaming, from the preload) | 23 to 26 ms | 23 to 24 ms |
| Compiled → the shell's first output (boot, kwtty, spawn) | 229 to 232 ms | 208 to 214 ms |
| The shell's first output → prompt (9 runs) | 85 to 110 ms | 79 to 89 ms |
| JIT modules compiled before the prompt | 141 to 168, 6 to 8 ms | 62 to 68, 3 to 4 ms |
| First key → its echo (11 runs) | 13 to 25 ms | 13 to 26 ms |

The kernel compile starts once Slidev's app has run, 0.54 to 1.03 s after navigation in both builds, and that is where the time to the first prompt varied: 0.85 to 1.37 s on 0.1.0 and 0.81 to 2.07 s on 0.2.0 over 17 runs each.

The guest has 512 MiB (`kernel.ts`), as with 0.1.0's default. unkernel 0.2.0's default on desktops, 2 GiB, booted no faster: on Node the prompt came 272 to 274 ms after `createKernel` with 512 MiB and 279 to 287 ms with 2 GiB.

### Four CPUs

The guest runs on 4 CPUs from the deck's second load on, in a worker of a cross-origin isolated page ([architecture.md](./architecture.md#cpus)); the first load runs it on 1.

Measured locally with Chrome 157 on the production build, each run in a fresh browser session with the HTTP cache cleared and disabled, the service worker unregistered for 1 CPU and registered for 4; 3 runs each, 2 for the throttled rows:

| Measure | 1 CPU | 4 CPUs |
| --- | ---: | ---: |
| The app requests the kernel → first prompt | 315 to 353 ms | 582 to 589 ms |
| Of which applying the SMP patch to the kernel | | 88 to 91 ms |
| Slides 18 and 21 (two terminals): slide change → both prompts | 276 to 377 ms | 128 to 162 ms |
| First key → its echo | 14 to 26 ms | 9 to 20 ms |
| 400 ms latency, 3 Mbps, cold: navigation → first prompt | 28.2 s | 27.7 to 27.9 s |
| The same: kernel downloaded → first prompt | 0.28 to 0.29 s | 0.41 to 0.42 s |

On Node, with the same images, 4 CPUs ran four `seq 200000 | sort -r` at once in 2.7 s instead of 9.3 to 9.4 s, and one alone in 2.0 s instead of 2.2 s.

So 4 CPUs boot about 0.25 s later, half of it the SMP patch, and start the shells of a two-terminal slide in half the time; a single program runs as fast as on one.

### The shell's start

The image loads two zsh plugins: the jovial theme, and fast-syntax-highlighting right after the first prompt. node, python3 and zoxide are left out, and the build fails if they come back as a dependency: without them the published image is 22.7 MiB gzip instead of 58.5 MiB (at `ce872b1`).

In the VM a zsh statement takes about 30 µs, while a fork costs under 1 ms, so a shell's start costs what its scripts run. A trace of the login shell found most of it in zinit: sourcing it took 121 to 138 ms even compiled, and the wrappers it puts around each `autoload`, `zle -N` and hook while a plugin loads stretched fast-syntax-highlighting's load to 0.3 to 0.6 s, during which typed keys did not echo; `compinit` took 50 ms more. `.zshrc` now sources jovial directly, as jovial's README installs it without a plugin manager, has no completion system, and loads fast-syntax-highlighting from a `zle -F` handler that zle runs as soon as the first prompt is drawn; text typed before or during that load is highlighted once it ends ([image.md](./image.md#shell-start-time) has the breakdown).

Measured on the dev server, from the slide becoming active; plugins loaded is when typed keys echo at once:

| Measure | Before | After |
| --- | ---: | ---: |
| One terminal (slides 14, 31): prompt | 880 ms | 160 to 172 ms |
| One terminal: plugins loaded | 867 ms | 258 to 273 ms |
| Two terminals (slides 18, 21, 25, 28): prompt | 1290 to 1380 ms | 294 to 335 ms |
| Two terminals: plugins loaded | 1890 to 1970 ms | 500 to 540 ms |

Two terminals' shells start together; on 1 CPU they share it ([Four CPUs](#four-cpus)). Before the prompt, each spends 77 to 82 ms in jovial's first precmd, most of it computing segment lengths and starting its dev-env probe in a new process.

The image ships fast-syntax-highlighting's secondary theme in `~/.config/fsh`. Without the file, the plugin tries to download it at every start, and with no network that holds typed keys for 5 s. The first typed key echoes after 19 to 23 ms; without the file it took 5051 ms ([image.md](./image.md#shell-start-time)).

### The boot screen

A terminal shown before Linux is up shows the boot stages until its shell's first output:
- download kernel and download disk, with their bytes;
- boot Linux, with its time;
- start shell.

The screen uses the system's monospace font. The terminal font is `font-display: block`, so text set in it would stay invisible until its 1.25 MB file arrives.

A terminal shown once Linux is up shows no boot screen: its prompt comes 0.16 to 0.34 s after its slide opens ([The shell's start](#the-shells-start)).


## After the first prompt

### The whole disk in the background

When a shell first writes output (its first prompt), or 5 s after the kernel starts, whichever comes first, and once the page is idle, every chunk not fetched yet downloads in disk order. In a build it runs at low priority, two at a time, and it stays out of the terminals' progress bar. Fetched files are kept as published, gzip, 25.4 MB for both images; a read decompresses its chunk. The Alpine image's 4 chunks go first. A program's first run then reads from memory.

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

Most of an image build is apk downloading packages. `image/build.ts` first downloads the guest's package index (`v3.24/main/aarch64/APKINDEX.tar.gz`) from the official CDN and four mirrors (Aliyun, TUNA, USTC, SJTU) at once and installs from the fastest; `ALPINE_MIRROR=<url>` skips the probe. From the author's network the official CDN delivered about 30 KB/s, and a build took over 7 minutes. With the probe, provisioning takes 30 to 40 s on unkernel 0.2.0 (92 s on 0.1.0, in a build from the same network the same hour) and the whole build under a minute; the first build of an unkernel version also downloads its 4 MB Alpine image. When apk fails on the chosen mirror, `setup.sh` installs again from the official repositories. A build that runs past 5 minutes (`--timeout-min`) stops with an error ([image.md](./image.md#building)).

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

- **The kernel preload shares a slow link with the scripts.** At 2.2 Mbps the page's 700 KB of scripts and styles need about 2.5 s, yet the slide rendered after 8.4 to 12.5 s. The timings suggest the path does not honor `fetchpriority="low"`, so the scripts share the bandwidth with the wasm (7.2 MB then, 4.4 MB now) and the boot bundle; the cause was not isolated. The Google Fonts stylesheet, which `index.html` places before the module script, also blocks it. Dropping the wasm's preload tag, while keeping the manifest's and the bundle's, would let the scripts go first; `setup/main.ts` would still start the wasm once the app runs.
- **The terminal font.** Hack Nerd Font Mono's regular and bold files are 1.25 MB each, and the first terminal waits for both.
- **Fira Code** comes from Google Fonts through a stylesheet that blocks rendering (the theme's `fonts.mono`), one more host to reach before the first slide.
- **Slide 1 loads the `terminal` chunk** (386 KB, 1.0 s at 3 Mbps) because the slides import the terminal components statically. Importing `ghostty-web` and `unkernel/web` dynamically would take it off slide 1's path. unkernel 0.2.0's web entry added 64 KB gzip to it, most of it the script of its Web Worker mode, which it carries inline and the deck does not use.
- **Both images download on every cold visit:** 25.4 MB after the first prompt, about 92 s at 2.2 Mbps, kept in page memory for the session with up to 32 decompressed 1 MiB chunks per image.
- **The boot bundles' bytes download twice:** the background download also fetches the chunks they came from, 1.8 MB more per cold visit.
- **The wasm relies on GitHub Pages' gzip,** which GitHub does not document. Served uncompressed, it would grow by 7.0 MB, about 19 s at 3 Mbps; a zopfli `.wasm.gz` decoded with `DecompressionStream('gzip')` would remove that dependence.
- **After 10 minutes** every file is revalidated with one round trip.
- **4 CPUs start the boot later:** the SMP kernel compiles only after the download ends and the patch (about 90 ms) is applied, and the first load boots on 1 CPU, because it only registers the service worker that isolates the next one.
- **jovial's first precmd** takes 77 to 82 ms of every shell's start: 35 to 42 ms computing its segments' lengths through a regex loop per affix (`@jov.init-affix`), and 15 to 18 ms starting its dev-env probe in a zpty, a new process on every prompt. On a slide with two terminals, both shells start together and show their prompts after about 0.3 s on 1 CPU, 0.13 to 0.16 s on 4.
