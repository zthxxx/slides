# Architecture

The deck runs a real Linux in the page: unkernel's kernel compiled to WebAssembly, with Alpine riscv64 and a preinstalled-tools disk.
Each terminal on a slide is a shell on its own pty of that one machine, drawn by ghostty-web.

## Layers

```
slides.md, pages/         content, demo steps, speaker notes
   │
components/               Vue views; know about Slidev (render context, active slide, layout)
   ShellDemo.vue          a demo: stacked terminals + numbered steps; provides the terminal names
   Terminal.vue           one terminal window; adopts its session's element when its slide is active; height drag handle
   ShellStep.vue          one step button; plays here, or relays from the presenter window; shell highlighting (shell-highlight.ts)
   WebFrame.vue           a live web page cropped to one region (e.g. a docs page without its header and sidebars)
   diagrams/              SVG diagrams for TTY, SSH, OSC and Agent gateways; DiagramFrame.vue gives each the shared light/dark styles
setup/main.ts             Slidev app setup: starts Linux's downloads in the audience window
   │
runtime/                  plain TypeScript; no templates
   session.ts             ShellSession = one pty + one emulator; registry by slide and name; step playback
   emulator.ts            the terminal emulator seam (ghostty-web); mouse reporting
   mouse.ts               pure: DEC mouse modes → protocol, pointer action → report bytes
   bell.ts                which BEL bytes ring (a parser over the output stream), and the bell sound
   graphics.ts            pure: iTerm2 / kitty image sequences out of the output stream, image header sizes, cell layout
   graphics-overlay.ts    draws those images over the canvas, anchored to their buffer rows
   terminal-height.ts     dragged terminal heights, clamped and kept in localStorage
   appearance.ts          shared dark/light terminal preference and color palettes
   palette.ts             two synchronized VT parsers, selected by the terminal preference
   program-status.ts      stream observer for root OSC 7501 reports
   kernel.ts              the page's one VM, booted once per tab
   disk.ts                the published disk image: the boot bundle up front, other chunks lazily, under an in-memory copy-on-write layer
   steps.ts               pure: step → bytes, `{a.pts}` references
   relay.ts               presenter window → slide window (BroadcastChannel)
   demo.ts                ShellDemo context and terminal accent colors
   │
unkernel (npm)            createKernel, vm.spawn() → Pty, CowDisk; unkernel-alpine.wasm = kernel + initramfs
ghostty-web (npm)         Ghostty's VT parser in WebAssembly, canvas renderer, xterm.js-shaped API
   │
public/linux/             built by image/ (gitignored): manifest.json + chunks/*.gz
image/                    the image's build: see image.md
```

Dependencies point down only. `runtime/` never imports from `components/`; `steps.ts` and `disk.ts` hold the logic worth testing and take their I/O as arguments (`ChunkLoader`).

## Lifecycle

### Boot, once per tab

1. The downloads start before any script runs: a build's `index.html` preloads the disk manifest, the boot bundle it names and the kernel wasm (see [Loading and caching](#loading-and-caching)). As soon as the app runs, `setup/main.ts` calls `prefetchLinux()` in the audience window; its fetches take over the preloaded responses, and the kernel compiles while it streams.
2. Slidev mounts every slide about 3 s after the deck opens (hidden with `v-show`). The first live `Terminal` calls `useLinux()`, so the VM boots in the background, usually before the talk reaches a demo.
3. `useLinux()` (`kernel.ts`) starts the downloads if nothing has yet, checks browser support, and calls `createKernel({ kernel, disks })` once two downloads, started together by `prefetchLinux()`, are ready: the kernel wasm, compiled while it streams, and the disk, whose boot bundle (the bytes the guest reads up to its first prompt, one file) is fetched as soon as the manifest arrives (image.md). The disk is `CowDisk(ChunkedDiskBase)`; writes stay in memory, so a reload is a fresh machine.
   `prefetchLinux()` runs no kernel. `setup/main.ts` still calls it only where `Terminal.vue` boots (the `play` route outside print mode): another window would compile a kernel it never boots.
4. The initramfs `/init` mounts the disk labelled `kwdata` and makes `/` an overlay of the initramfs and the disk (image.md). busybox `init` starts `kwtty serve`.

`useLinux()` is memoized and kept across Vite HMR (`import.meta.hot.data`): a thread can run only one kernel.

When the manifest is missing (a fresh checkout without `pnpm build:image`), the page boots bare Alpine (busybox ash) and every new terminal prints a yellow notice saying so. It prints the same kind of notice when the image was built on another unkernel version.

### A terminal, once per slide

- A session is keyed by `<slide number>/<terminal name>` (`sessionKey`). The registry is kept across HMR.
- Until its shell's first output, a terminal's screen shows Linux's boot stages (`LinuxBoot.vue`): download kernel, download disk, boot Linux, start shell, each waiting, running or done (a download with its size, the boot with its time), and the downloads' progress bar. `kernel.ts` records the stages in `linuxBoot`; the boot stage ends when the first pty spawns, because `vm.spawn` waits for the guest's kwtty and unkernel 0.1.0 reports no other readiness. The screen uses the system's monospace font, which needs no download, and fades in after 0.2 s, so a shell that starts at once shows none of it. Downloads after the boot (a disk chunk the guest reads) show in the title bar instead.
- When the slide becomes active, `Terminal.vue` calls `session.show(element)`: the session's host element moves into the window, the emulator opens (first time) and fits, and the shell is spawned (first time): `vm.spawn()` → `kwtty` → root's login shell, zsh with jovial.
- pty output → `emulator.write()`; emulator input and its replies to terminal queries → `pty.write()`; emulator resize → `pty.resize()` (SIGWINCH).
- Leaving the slide blurs the terminal; the shell keeps running. Returning shows the same shell.
- A shell that exits (`exit`, `^D` at the prompt) is replaced by a new one in the same window, with a dim note. If the whole machine stops (`poweroff`), the terminal says to reload.

### Steps

`ShellStep` → `playStep(page, to, step)` (`session.ts`): waits until the terminals the text refers to run, resolves `{a.pts}` / `{a.pid}`, then types into the target pty on the schedule `typingPlan` (`steps.ts`) computes: keys at once with a pause of up to 40 ms before the next input, text at up to 6 ms per character, a line break as Enter, Enter last. The input schedule spans at most 600 ms: longer text is typed faster. Characters due in the same write interval go out in one write: 16 ms, or longer for long text, so typed text takes at most about 24 writes. zsh redraws its line (with syntax highlighting) once per read, so the number of writes decides when the echo is done; measured in the page, the longest steps (90 to 270 characters) are typed and echoed, Enter included, 540 to 660 ms after the click. Steps on one terminal queue behind each other; shell execution time is outside this typing budget.

In the presenter window the button posts `{ page, to, step }` on a `BroadcastChannel`; the slide window, which runs Linux, plays it.

The button shows the step text highlighted as shell by shiki (`components/shell-highlight.ts`): the `shellscript` grammar, the deck's vitesse light and dark themes, and shiki's JavaScript regex engine, created on first use; until then the text shows plain. Slidev's build puts all shiki modules into its shared, preloaded `modules/shiki` chunk, which these make about 66 KB (gzip) larger.

## Maximized terminal

The maximize button in a terminal's title bar lays the window over its whole slide, 20 px from the slide's edges, over a dimmed backdrop; it is not the browser's fullscreen. The window becomes `position: fixed`, which resolves against Slidev's scaled slide container because that container is transformed, so the window keeps the slide's scale. The screen refits, so the shell gets the new size (SIGWINCH); a placeholder keeps the window's place, so other terminals on the slide keep theirs. Esc stays with the shell; the button, a click on the backdrop or leaving the slide restores the window. Only the live `slide` render context shows the button.

## Where Linux runs

Only Slidev's `slide` render context outside print mode runs Linux. The presenter, its next-slide preview, the overview and export render a stand-in box, so a presenter window never boots a second machine.

## The terminal emulator

`emulator.ts` exposes the small interface `ShellSession` needs (`open`, `write`, `onData`, `onResize`, `fit`, `focus`, `blur`, `cols`, `rows`, `cellHeight`) over ghostty-web 0.4.0. What the deck relies on:

| Behavior | Provided by |
| --- | --- |
| Releasing a mouse drag copies the selection; double-click copies a word | ghostty-web, while no program asks for mouse reports; with Shift held otherwise |
| Mouse reports for programs that enable them (tmux with `mouse on`, htop, nvim, less): presses, releases, drag motion (1002), any motion (1003), wheel as buttons 64/65, Shift/Alt/Ctrl bits, X10 (9) presses; SGR (1006) or default encoding | `emulator.ts` (`#reportMouse`) with the encoder in `mouse.ts`; ghostty-web 0.4.0 tracks these modes but never sends a report, see below |
| URLs in the text underline on hover; Cmd-click / Ctrl-click opens them in a new tab (a plain click opens nothing, as in Ghostty). OSC 8 hyperlinks do not open: ghostty-web 0.4.0's `getHyperlinkUri()` always returns null | ghostty-web |
| Option(Alt)-click moves the shell's cursor to the clicked cell (arrow keys along the wrapped line, `ESC O` under DECCKM), on the normal screen at the bottom of the scrollback | `emulator.ts` with `cursorMoveKeys` in `mouse.ts` |
| A bar cursor | `cursorStyle: 'bar'` in `emulator.ts` |
| The grid fills the window's width, and ghostty-web's scrollbar, drawn at the canvas's right edge, sits at the window's edge | `emulator.ts` fits whole cells to the full width (ghostty-web's FitAddon kept 15 px free for a scrollbar it draws inside the canvas anyway) and right-aligns the canvas; the remainder, under one cell, goes to the left margin |
| A user's paste wrapped in bracketed-paste markers while the program asks for them (`CSI ? 2004 h`), so zle takes a multi-line paste as one edit instead of running it line by line | `emulator.ts`; ghostty-web 0.4.0's own paste sends no markers |
| Cursor position reports (`ESC [ 6 n`) | ghostty-web |
| Background / foreground color queries (OSC 10/11) and primary device attributes (`ESC [ c`) | `QueryResponder` in `emulator.ts`; jovial asks both when zsh starts and would otherwise wait out a timeout |
| Hack Nerd Font Mono, line height 1 | Local WOFF2 faces declared in `Terminal.vue`, loaded before the renderer measures the font; `emulator.ts` replaces `CanvasRenderer.measureFont()` to use a row height of one font size, rounded to whole screen CSS pixels |
| Correct link hit-testing and crisp text inside Slidev's `transform: scale()` | `emulator.ts` cancels the slide scale on the host, fits whole-pixel cell widths and aligns the canvas origin to device pixels; it re-fits 150 ms after a window resize and re-aligns after transitions |
| Canvas resolution follows display changes and browser zoom | `emulator.ts` watches the resolution media query, updates the renderer's device-pixel ratio and fits again; ghostty-web resizes its backing store on the next render |
| Inline images: iTerm2 `OSC 1337 ; File=` and the kitty graphics protocol (`APC G`) | `graphics.ts` takes the sequences out of the output before ghostty-web parses it; `graphics-overlay.ts` draws them, see below |
| Keys typed into the terminal never turn the slide | `emulator.ts` stops `keydown` propagation on the terminal's host; Slidev does not count ghostty-web's contenteditable input as typing |

The terminal's font starts at 18 slide pixels and adjusts with the slide scale so character widths are whole screen CSS pixels. Counter-scaling puts pointer coordinates and renderer cells in the same coordinate space. A final scale correction limits residual scaling from rounded CSS transform values, and an offset places the canvas origin on a whole device pixel. The canvas uses `image-rendering: pixelated` so the compositor preserves its already-antialiased device pixels through Slidev’s transform chain.

Hack's ascent and descent together exceed one em. The custom baseline keeps box-drawing strokes connected at line height 1; letter descenders may extend by about one pixel into the next row. Font files, upstream version and metrics are recorded in [the font README](../public/fonts/hack-nerd-font-mono/README.md).

The renderer adaptations depend on ghostty-web **0.4.0**: [`dist/index.d.ts`](../node_modules/ghostty-web/dist/index.d.ts) declares `CanvasRenderer` and its private DPR field; [`dist/ghostty-web.js`](../node_modules/ghostty-web/dist/ghostty-web.js) implements `measureFont`, `renderLine`, canvas resizing and DPR use. Re-check these methods and the query/keyboard behavior above when upgrading the package.

### Mouse reporting

ghostty-web 0.4.0 parses the mouse-tracking modes (`Terminal.getMode()`, `hasMouseTracking()`) but has no code that writes a mouse report to the program. A press on the canvas starts its own selection (`SelectionManager.attachEventListeners`), and the wheel scrolls its scrollback, or sends ↑ / ↓ on the alternate screen (`Terminal.handleWheel`); both are in [`dist/ghostty-web.js`](../node_modules/ghostty-web/dist/ghostty-web.js).

While a program has a tracking mode set, `emulator.ts` takes the pointer first: capture listeners on the host stop ghostty-web's selection, word copy and context menu, and `attachCustomWheelEventHandler` replaces its wheel handling. `mouse.ts` encodes each action as [XTerm Control Sequences, "Mouse Tracking"](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking) defines it; the report goes to the pty like typed input. The cell is read from the canvas's on-screen rectangle divided by the grid, so it does not depend on the slide's scale. A drag that leaves the terminal keeps reporting at the edge cell until the button is released. Each 33 px of pixel wheel delta is one report, at most five per event, as in ghostty-web's own alternate-screen scrolling.

Holding Shift keeps ghostty-web's local selection and scrolling, as in other terminals. The default encoding carries cells up to 223 (one byte each); beyond that only SGR reports. The UTF-8 (1005) and urxvt (1015) encodings are not implemented: tmux, ncurses programs and nvim choose SGR.

### Inline images

ghostty-web 0.4.0 parses OSC 1337 and APC strings and discards them; its canvas renderer draws only cells. Every write therefore goes through `GraphicsOverlay.write()`:

1. `GraphicsStream` (`graphics.ts`) splits the output into text and image commands across arbitrary chunk boundaries. Text, including every other escape sequence, reaches ghostty-web unchanged. A tail that may still become an image sequence is held until the next chunk; the VT parser could not act on those bytes earlier either.
2. An image is placed at the cursor. Its size in cells comes from the request (`width` / `height`, kitty `c` / `r`) and the pixel size read from the file header (PNG, JPEG, GIF, WebP), one image pixel per device pixel when no size is given, scaled down to fit right of the cursor and above the last row. The overlay then writes line feeds and `CSI n C` to ghostty-web, so the cursor ends right of the image's last row, as kitty specifies; the rows are reserved by the text grid itself.
3. The image is an element in a layer over the canvas, positioned from the renderer's cell metrics; it follows the canvas's device-pixel alignment. It is anchored to its buffer row (scrollback length + cursor row when placed), so it scrolls with the output and the wheel. An erase that covers it (`CSI J`, `CSI 2 J`, `CSI 3 J`, `ESC c`) removes it; images placed on the alternate screen disappear when the program leaves it.

Supported: iTerm2 `File=` with `inline=1`, `width` / `height` in cells, `px`, `%` or `auto`, and `preserveAspectRatio`, in any format the browser decodes; kitty direct transmission of PNG (`f=100`) and raw RGB / RGBA (`f=24` / `f=32`), chunked with `m`, actions `T`, `t` + `p` (by image id), `d` (all, or by id) and `q`, with `c`, `r`, `C` and `q`. Replies (`ESC _ G i=<id>;OK ESC \`) are sent only to commands that carry an id, as kitty does.

Not supported: kitty compression (`o=z`), file and shared-memory transmission, source rectangles and pixel offsets, z-index below text, animation, Unicode placeholders; iTerm2 multipart transfers. Images do not follow text reflow when the terminal is resized, nor scrolling inside a scroll region; once the scrollback holds its 5000 lines, older images drift. Re-check this layer when upgrading ghostty-web: a version that draws images itself makes it redundant.

### Terminal height

The handle on a terminal window's bottom edge drags its height; the width follows the slide's layout. A drag is clamped to about ten rows at least and, at most, to the room left in the terminals' column (another terminal in the column keeps its own dragged height, or ten rows if it has none). The emulator refits through the window's `ResizeObserver`, so the shell gets SIGWINCH while dragging. A double-click on the handle returns the terminal to the layout's height.

`terminal-height.ts` keeps the heights in slide pixels, independent of the window size, under `terminal-glance:terminal-heights` in `localStorage`, keyed by session key (`<slide number>/<terminal name>`); the presenter window follows through storage events. Slide numbers shift when slides are inserted before a demo, so a stored height then applies to whichever terminal now has that key; a stored height that no longer fits shrinks with the column instead of overflowing.

### Shared terminal appearance

Every terminal title bar toggles the same dark/light preference, independent of Slidev's page theme. `appearance.ts` stores `terminal-glance:appearance` in origin-local `localStorage`, falls back to dark when storage is unavailable, and accepts changes from other tabs. Reloading preserves this preference; the VM and its disk writes still reset.

ghostty-web 0.4.0 resolves default and indexed colors inside its WASM parser when cells are written. Its `options.theme` setter only warns, while `CanvasRenderer.setTheme()` updates renderer colors without changing those cells. `palette.ts` therefore feeds two real parsers with identical output and resize events, using dark and light palettes. The emulator selects the current parser and redraws through the same renderer; explicit truecolor remains application-owned. Only the active parser's terminal replies reach the PTY, and the inactive parser's replies are drained.

This keeps the same shell, screen and alternate-screen state when switching, with bounded scrollback (5,000 lines per parser). VT parsing and parser/scrollback storage are approximately doubled; there is no retained unbounded output transcript. The adapter depends on ghostty-web 0.4.0's `Ghostty.createTerminal`, `GhosttyTerminal` methods and `CanvasRenderer.render`; sources are the declaration and bundle linked above.

OSC 10/11 replies use the currently selected palette. Applications decide when to query: bat queries when invoked, while jovial chooses its prompt palette during initialization. A title-bar toggle does not restart the shell or send a color-change notification to applications.

### Bell

A BEL (0x07) in a terminal's output rings: the title bar shows a bell next to the terminal's name for 2.6 s (a new bell starts it over), and the page plays a short chime through WebAudio. `bell.ts` decides which BEL bytes ring with a small VT parser that keeps its state across writes: a BEL that ends an OSC string (`ESC ] … BEL`, as window titles and color replies use) or sits inside a DCS / APC / PM / SOS string does not ring. ghostty-web 0.4.0 has an `onBell` event, but its `Terminal.write` fires it for any 0x07 in a write, OSC terminators included, so the deck does not use it.

Browsers keep audio muted until the page has seen a user gesture, and a bell comes some time after the click that caused it. The first click or key press on the page therefore creates the `AudioContext`; bells closer than 120 ms make one sound.

### Program status reports

`program-status.ts` observes OSC 7501 in the output stream, including frames split across writes and tmux passthrough wrappers. It answers probes, updates a root program-status record for valid reports, and clears it on `state=clear` or a terminal reset. Child records are ignored; this is a root-status demonstration rather than a full hierarchical protocol implementation. The display stream still reaches the VT parser.

`session.ts` exposes the latest record to the title bar, where `Terminal.vue` lays it over the bar's right side as a stamp: a translucent background, turned 5° counter-clockwise and overlapping the screen's top edge; every change of its text replays a short jelly bounce, kept under `prefers-reduced-motion` because it is the only sign of the change. It is a program report, not a liveness or success check. Wire framing follows [Program Status Protocol rev 0.4](https://www.superlogical.com/rex/docs/build/program-status) and [botmux cb8ff44b2's parser](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-parser.ts#L14-L120); the observer's inline references identify the derived behavior.

## Loading and caching

The deck is often opened over slow links where any single request may stall for seconds, so the build keeps the number of requests small:

| Setting | Where | Effect |
| --- | --- | --- |
| `build.rolldownOptions.output.codeSplitting` | `vite.config.ts` | The page is two scripts plus rolldown's tiny runtime: `terminal` (ghostty-web with its inlined wasm, and unkernel's loader) and `app` (Slidev, Vue, shiki and every slide). Moving between slides loads nothing. It replaces Slidev's own `manualChunks`. |
| `build.cssCodeSplit: false` | `vite.config.ts` | One stylesheet instead of one per slide; slide styles are scoped, so loading them all at once is safe. |
| `preloadImages: false` | `slides.md` headmatter | Slide pictures load with their slides, which Slidev mounts about 3 s after opening, instead of competing with the scripts. |
| `preloadLinux()` | `vite.config.ts` | `index.html` preloads `linux/manifest.json`, the boot bundle and `unkernel-alpine.wasm` (`as="fetch"`, `crossorigin`, `fetchpriority="low"`), so they download alongside the scripts instead of after them. The plain `fetch()` calls in `disk.ts` and unkernel's `loadKernelModule` take over these responses; with another `as` or without `crossorigin`, each would be a second request that only the HTTP cache can answer. Low priority lets an HTTP/2 or HTTP/3 server send the scripts, styles and visible images first. |

Linux's boot downloads are `unkernel-alpine.wasm` (12.5 MB, about 7 MB gzipped) and the disk's boot bundle (about 1 MB); the disk image's other 1 MiB chunks load as the guest reads them (image.md). Every window preloads, the presenter's included, but only the audience window compiles and boots. Chrome serves a second window's request for a file that is still downloading from that one download, so an audience and a presenter window opened together fetch each file once, and a presenter window opened first leaves the files in the HTTP cache for the audience window.

All of it is cached by the browser's HTTP cache. Script, stylesheet and wasm names carry a content hash, and disk chunks and the boot bundle are named by content, so they can be cached for as long as the host allows; `index.html` and `linux/manifest.json` keep a short lifetime so a new deploy is picked up. Once the long-lived files are cached, a reload over a link with 400 ms of latency renders the slide in under 0.5 s and Linux spawns its first shell in 1 to 2 s.

## Keyboard and focus

- A clicked step button blurs itself: a focused button switches off Slidev's keyboard navigation.
- While a terminal has focus, every key goes to the shell. Click outside the terminal to use Slidev's keys again.

## Constraints

| Constraint | Consequence |
| --- | --- |
| unkernel needs WebAssembly JSPI | Chrome / Edge 137+, Firefox 153+, Safari 27+. Other browsers get a message in the terminal. |
| `unkernel` is pinned to a prerelease (`0.1.0-261117-0e4b2ec`) | Upgrade deliberately; rebuild the image with it (image.md). |
| One kernel per thread | Never call `createKernel` outside `kernel.ts`. |
| Guest memory: unkernel's default (512 MiB on desktops, 256 MiB on phones) | Enough for the deck's tools; writes to the disk also live in memory. |
| No network in the guest | `apk add` and `git clone` fail on the page; preinstall in the image instead. |
| `vite.config.ts` excludes `unkernel` from dependency pre-bundling | The SDK loads `unkernel-alpine.wasm` relative to its own module URL. |
