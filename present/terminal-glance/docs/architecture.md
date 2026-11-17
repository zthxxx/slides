# Architecture

The deck runs a real Linux in the page: unkernel's kernel compiled to WebAssembly, with Alpine riscv64 and a preinstalled-tools disk.
Each terminal on a slide is a shell on its own pty of that one machine, drawn by ghostty-web.

## Layers

```
slides.md                 content, demo steps, speaker notes
   │
components/               Vue views; know about Slidev (render context, active slide, layout)
   ShellDemo.vue          a demo: stacked terminals + numbered steps; provides the terminal names
   Terminal.vue           one terminal window; adopts its session's element when its slide is active
   ShellStep.vue          one step button; plays here, or relays from the presenter window
   │
runtime/                  plain TypeScript; no templates
   session.ts             ShellSession = one pty + one emulator; registry by slide and name; step playback
   emulator.ts            the terminal emulator seam (ghostty-web)
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

`ShellStep` → `playStep(page, to, step)` (`session.ts`): waits until the terminals the text refers to run, resolves `{a.pts}` / `{a.pid}`, then types into the target pty: keys at once, text one character every 24 ms, Enter last. Steps on one terminal queue behind each other.

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
| Correct link hit-testing and crisp text inside Slidev's `transform: scale()` | `emulator.ts` scales the host by the inverse of the slide scale and the font by the scale, so the emulator works at real screen size; it re-measures 150 ms after a window resize |
| Keys typed into the terminal never turn the slide | `emulator.ts` stops `keydown` propagation on the terminal's host; Slidev does not count ghostty-web's contenteditable input as typing |

The last three rows compensate for ghostty-web 0.4.0 behavior; re-check them when upgrading it.

## Keyboard and focus

- A clicked step button blurs itself: a focused button switches off Slidev's keyboard navigation.
- While a terminal has focus, every key goes to the shell. Click outside the terminal to use Slidev's keys again.

## Constraints

| Constraint | Consequence |
| --- | --- |
| unkernel needs WebAssembly JSPI | Chrome / Edge 137+, Firefox 153+, Safari 27+. Other browsers get a message in the terminal. |
| `unkernel` is pinned to a prerelease (`0.1.0-261117-0e4b2ec`) | Upgrade deliberately; rebuild the image with it (image.md). |
| One kernel per thread | Never call `createKernel` outside `kernel.ts`. |
| Guest memory: unkernel's default (512 MiB on desktops, 256 MiB on phones) | Enough for node, python and nvim; writes to the disk also live in memory. |
| No network in the guest | `apk add`, `git clone` and `npm install` fail on the page; preinstall in the image instead. |
| `vite.config.ts` excludes `unkernel` from dependency pre-bundling | The SDK loads `unkernel-alpine.wasm` relative to its own module URL. |
