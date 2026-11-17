# Architecture

The deck runs a real Linux in the page: unkernel's kernel compiled to WebAssembly, with Alpine riscv64 and a preinstalled-tools disk.
Each terminal on a slide is a shell on its own pty of that one machine, drawn by ghostty-web.

## Layers

```
slides.md, pages/         content, demo steps, speaker notes
   │
components/               Vue views; know about Slidev (render context, active slide, layout)
   ShellDemo.vue          a demo: stacked terminals + numbered steps; provides the terminal names
   Terminal.vue           one terminal window; adopts its session's element when its slide is active
   ShellStep.vue          one step button; plays here, or relays from the presenter window
   diagrams/              SVG diagrams for TTY, SSH, OSC and Agent gateways; shared light/dark styles
   │
runtime/                  plain TypeScript; no templates
   session.ts             ShellSession = one pty + one emulator; registry by slide and name; step playback
   emulator.ts            the terminal emulator seam (ghostty-web)
   appearance.ts          shared dark/light terminal preference and color palettes
   palette.ts             two synchronized VT parsers, selected by the terminal preference
   program-status.ts      stream observer for root OSC 7501 reports
   kernel.ts              the page's one VM, booted once per tab
   disk.ts                the published disk image, fetched lazily, under an in-memory copy-on-write layer
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

1. Slidev mounts every slide about 3 s after the deck opens (hidden with `v-show`). The first live `Terminal` calls `useLinux()`, so the VM boots in the background, usually before the talk reaches a demo.
2. `useLinux()` (`kernel.ts`) checks browser support, fetches `<base>/linux/manifest.json`, wraps the chunks in `CowDisk(ChunkedDiskBase)` and calls `createKernel({ disks })`. Writes stay in memory: a reload is a fresh machine.
3. The initramfs `/init` mounts the disk labelled `kwdata` and makes `/` an overlay of the initramfs and the disk (image.md). busybox `init` starts `kwtty serve`.

`useLinux()` is memoized and kept across Vite HMR (`import.meta.hot.data`): a thread can run only one kernel.

When the manifest is missing (a fresh checkout without `pnpm build:image`), the page boots bare Alpine (busybox ash) and every new terminal prints a yellow notice saying so. It prints the same kind of notice when the image was built on another unkernel version.

### A terminal, once per slide

- A session is keyed by `<slide number>/<terminal name>` (`sessionKey`). The registry is kept across HMR.
- When the slide becomes active, `Terminal.vue` calls `session.show(element)`: the session's host element moves into the window, the emulator opens (first time) and fits, and the shell is spawned (first time): `vm.spawn()` → `kwtty` → root's login shell, zsh with jovial.
- pty output → `emulator.write()`; emulator input and its replies to terminal queries → `pty.write()`; emulator resize → `pty.resize()` (SIGWINCH).
- Leaving the slide blurs the terminal; the shell keeps running. Returning shows the same shell.
- A shell that exits (`exit`, `^D` at the prompt) is replaced by a new one in the same window, with a dim note. If the whole machine stops (`poweroff`), the terminal says to reload.

### Steps

`ShellStep` → `playStep(page, to, step)` (`session.ts`): waits until the terminals the text refers to run, resolves `{a.pts}` / `{a.pid}`, then types into the target pty on the schedule `typingPlan` (`steps.ts`) computes: keys at once with a pause of up to 80 ms before the next input, text at up to 12 ms per character, a line break as Enter, Enter last. The input schedule spans at most 1.2 s: longer text is typed faster, and characters due in the same 16 ms frame go out in one write. Steps on one terminal queue behind each other; shell execution time is outside this typing budget.

In the presenter window the button posts `{ page, to, step }` on a `BroadcastChannel`; the slide window, which runs Linux, plays it.

## Where Linux runs

Only Slidev's `slide` render context outside print mode runs Linux. The presenter, its next-slide preview, the overview and export render a stand-in box, so a presenter window never boots a second machine.

## The terminal emulator

`emulator.ts` exposes the small interface `ShellSession` needs (`open`, `write`, `onData`, `onResize`, `fit`, `focus`, `blur`, `cols`, `rows`) over ghostty-web 0.4.0. What the deck relies on:

| Behavior | Provided by |
| --- | --- |
| Releasing a mouse drag copies the selection; double-click copies a word | ghostty-web |
| URLs and OSC 8 links underline on hover; Cmd-click / Ctrl-click opens them in a new tab (a plain click opens nothing, as in Ghostty) | ghostty-web |
| Cursor position reports (`ESC [ 6 n`) | ghostty-web |
| Background / foreground color queries (OSC 10/11) and primary device attributes (`ESC [ c`) | `QueryResponder` in `emulator.ts`; jovial asks both when zsh starts and would otherwise wait out a timeout |
| Hack Nerd Font Mono, line height 1 | Local WOFF2 faces declared in `Terminal.vue`, loaded before the renderer measures the font; `emulator.ts` replaces `CanvasRenderer.measureFont()` to use a row height of one font size, rounded to whole screen CSS pixels |
| Correct link hit-testing and crisp text inside Slidev's `transform: scale()` | `emulator.ts` cancels the slide scale on the host, fits whole-pixel cell widths and aligns the canvas origin to device pixels; it re-fits 150 ms after a window resize and re-aligns after transitions |
| Canvas resolution follows display changes and browser zoom | `emulator.ts` watches the resolution media query, updates the renderer's device-pixel ratio and fits again; ghostty-web resizes its backing store on the next render |
| Keys typed into the terminal never turn the slide | `emulator.ts` stops `keydown` propagation on the terminal's host; Slidev does not count ghostty-web's contenteditable input as typing |

The terminal's font starts at 18 slide pixels and adjusts with the slide scale so character widths are whole screen CSS pixels. Counter-scaling puts pointer coordinates and renderer cells in the same coordinate space. A final scale correction limits residual scaling from rounded CSS transform values, and an offset places the canvas origin on a whole device pixel. The canvas uses `image-rendering: pixelated` so the compositor preserves its already-antialiased device pixels through Slidev’s transform chain.

Hack's ascent and descent together exceed one em. The custom baseline keeps box-drawing strokes connected at line height 1; letter descenders may extend by about one pixel into the next row. Font files, upstream version and metrics are recorded in [the font README](../public/fonts/hack-nerd-font-mono/README.md).

The renderer adaptations depend on ghostty-web **0.4.0**: [`dist/index.d.ts`](../node_modules/ghostty-web/dist/index.d.ts) declares `CanvasRenderer` and its private DPR field; [`dist/ghostty-web.js`](../node_modules/ghostty-web/dist/ghostty-web.js) implements `measureFont`, `renderLine`, canvas resizing and DPR use. Re-check these methods and the query/keyboard behavior above when upgrading the package.

### Shared terminal appearance

Every terminal title bar toggles the same dark/light preference, independent of Slidev's page theme. `appearance.ts` stores `terminal-glance:appearance` in origin-local `localStorage`, falls back to dark when storage is unavailable, and accepts changes from other tabs. Reloading preserves this preference; the VM and its disk writes still reset.

ghostty-web 0.4.0 resolves default and indexed colors inside its WASM parser when cells are written. Its `options.theme` setter only warns, while `CanvasRenderer.setTheme()` updates renderer colors without changing those cells. `palette.ts` therefore feeds two real parsers with identical output and resize events, using dark and light palettes. The emulator selects the current parser and redraws through the same renderer; explicit truecolor remains application-owned. Only the active parser's terminal replies reach the PTY, and the inactive parser's replies are drained.

This keeps the same shell, screen and alternate-screen state when switching, with bounded scrollback (5,000 lines per parser). VT parsing and parser/scrollback storage are approximately doubled; there is no retained unbounded output transcript. The adapter depends on ghostty-web 0.4.0's `Ghostty.createTerminal`, `GhosttyTerminal` methods and `CanvasRenderer.render`; sources are the declaration and bundle linked above.

OSC 10/11 replies use the currently selected palette. Applications decide when to query: bat queries when invoked, while jovial chooses its prompt palette during initialization. A title-bar toggle does not restart the shell or send a color-change notification to applications.

### Program status reports

`program-status.ts` observes OSC 7501 in the output stream, including frames split across writes and tmux passthrough wrappers. It answers probes, updates a root program-status record for valid reports, and clears it on `state=clear` or a terminal reset. Child records are ignored; this is a root-status demonstration rather than a full hierarchical protocol implementation. The display stream still reaches the VT parser.

`session.ts` exposes the latest record to the title bar. It is a program report, not a liveness or success check. Wire framing follows [Program Status Protocol rev 0.4](https://www.superlogical.com/rex/docs/build/program-status) and [botmux cb8ff44b2's parser](https://github.com/deepcoldy/botmux/blob/cb8ff44b2d9e0d250040f3228feb11e9225d6514/src/utils/program-status-parser.ts#L14-L120); the observer's inline references identify the derived behavior.

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
