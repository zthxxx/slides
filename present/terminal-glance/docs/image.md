# The guest image

The deck's Linux has zsh (jovial theme), bash, tmux, htop, git, less, bat and neovim preinstalled.
They are installed when the image is built, so the page needs no network and no proxy.

## What the image is

An unkernel **data disk**: an ext4 file system labelled `kwdata`, holding only what was added on top of unkernel's own Alpine.

At boot the page loads unkernel's bundled kernel and Alpine 3.24 riscv64 initramfs unchanged, and attaches this disk as `/dev/wda`.
The initramfs `/init` runs `/etc/kw-data.sh root`, which:

1. mounts the disk labelled `kwdata` at `/data`;
2. makes `/` an overlay: lower = the initramfs, upper = `/data/overlay/upper`;
3. pivots into it and starts busybox `init`, which runs `kwtty serve`, the server behind `vm.spawn()`.

So everything installed while the image was provisioned lives in `/data/overlay/upper` and appears in `/`.
Source: unkernel repository `kernel/guest/kw-data.sh`, `kernel/guest/overlay/root.sh`, `kernel/guest/alpine.sh` (inittab, `/init`).

`kwtty` starts root's login shell from `/etc/passwd` (`kernel/guest/kwtty.c`, `getpwuid(0)`); the image sets it to `/bin/zsh`.

The overlay is tied to the initramfs it was built on: `/data/overlay/lower` records that image id (`/usr/lib/kw-image`).
A disk built on another unkernel version makes `/init` rebase it at boot or fall back to safe mode, so **the image must be rebuilt whenever `unkernel` changes**. The page warns in every terminal when the manifest's `unkernel` differs from the running package.

## Layout

```
image/
  build.ts            Bun. Orchestrates: input hash, skip when up to date, provision, pack.
  pack.ts             Bun. Raw disk → public/linux/{manifest.json, chunks/*.gz}. Exports the manifest type.
  vm/provision.ts     Node >= 24. Boots unkernel with network + a fresh data disk, runs guest/setup.sh, powers off.
  guest/              Mounted read-only at /provision inside the build VM.
    setup.sh          Runs in the guest (busybox ash): apk, login shell, checks, zinit, cleanup, zero free blocks.
    packages.txt      apk packages, one per line.
    rootfs/           Copied over / : shell/tmux config, demo commands, /root/hello.sh and the demo images.
```

Outputs, all gitignored:

| Path | Content |
| --- | --- |
| `.cache/image/kwdata.img` | The raw 4 GiB sparse ext4 disk. |
| `public/linux/manifest.json` | The published disk's index (below). |
| `public/linux/chunks/*.gz` | The published disk's data. |

Slidev copies `public/` into the deck's build, so the page fetches `<base>/linux/manifest.json`.

The VM driver runs on Node 24 because unkernel needs WebAssembly JSPI, which Bun does not have. `build.ts` uses `node` when it is version 24 or newer, else `npx -y node@24`.

## Building

```sh
cd present/terminal-glance
pnpm build:image            # skips when public/linux/manifest.json has the same input hash
pnpm build:image --force    # rebuild anyway, e.g. to pick up newer packages
```

About 1.5 minutes on a laptop: 50 to 80 s provisioning, then 2 s packing.

The input hash covers every file under `image/` and the installed `unkernel` version.
Packages come from the live Alpine 3.24 repositories and zinit clones jovial from its default branch, so two builds with the same hash can differ.

CI (`.github/workflows/build.yml`) runs `pnpm -C present/terminal-glance build:image` on every push, before `pnpm build`.

## What `guest/setup.sh` does

1. Checks that `/` is the overlay on the kwdata disk.
2. Enables Alpine's community repository and `apk add --no-cache` everything in `packages.txt`.
3. Copies `rootfs/` over `/` and sets root's shell to `/bin/zsh`.
   Checks `bat --version`, the demo scripts' syntax, bat's ability to render the sample file, and that `base64 -w0` reads the demo images.
4. Checks tmux: the `tmux-256color` terminfo entry exists (`default-terminal` in the config) and the config loads without errors.
5. Runs `zsh -i -c '@zinit-scheduler burst'`: zinit clones itself, jovial and fast-syntax-highlighting (a turbo `wait` load, which `burst` runs at once). The build fails unless zinit's plugins are exactly the ones `.zshrc` loads (`zthxxx---jovial`, `zdharma-continuum---fast-syntax-highlighting`, plus zinit's own `_local---zinit`) and no snippet file (where oh-my-zsh libs and plugins would land) exists.
6. Fails if `node`, `python3` or `zoxide` came in as a dependency of another package.
7. Takes the network down and starts `zsh -i` again; any stderr output fails the build, so the page starts offline cleanly. It also fails unless fast-syntax-highlighting's `$FAST_WORK_DIR` is `~/.config/fsh` and holds `secondary_theme.zsh` (see below).
8. Compiles the completion dump, writes `/etc/terminal-glance-image` (input hash, unkernel version, lower image id, build time).
9. Removes apk and shell caches, histories and temporary files.
10. `fstrim /data`: the driver turns discards into zeros, so freed blocks become zero chunks that are not published.
11. Removes the overlay's boot markers (`attempts`, `safe`), so the first boot on the page is a clean one.

## Shell and tmux configuration

| File | Source | Changed |
| --- | --- | --- |
| `rootfs/root/.zshrc` | jovial [`examples/zinit.zshrc`](https://github.com/zthxxx/jovial/blob/master/examples/zinit.zshrc) | Loads the jovial theme and fast-syntax-highlighting through zinit; every other plugin and ohmyzsh lib is left out. Sets fast-syntax-highlighting's `FAST_WORK_DIR` to `~/.config/fsh`. |
| `rootfs/root/.config/tmux/tmux.conf` | [zthxxx/tmux-config `tmux.conf`](https://github.com/zthxxx/tmux-config/blob/main/tmux.conf) | Every plugin is left out (TPM, resurrect, continuum, treemux). |

Each file's header records the upstream commit it was taken from.
Under the in-browser VM each zsh plugin adds to the time before the first prompt, so the image loads only the two the talk needs: the theme, and syntax highlighting to make typed commands readable. fast-syntax-highlighting loads in zinit's turbo mode, after the first prompt, which appears in 0.6 to 0.9 s. Packages the demos do not use (node, python, zoxide) are left out to keep the download small.
While `$FAST_WORK_DIR/secondary_theme.zsh` is missing, fast-syntax-highlighting downloads it from GitHub at every start; offline, the resolver timeout holds zsh about 5 s after the first prompt and typed keys stay unechoed. Its default work dir is under `~/.cache`, which step 9 empties, so `.zshrc` sets `FAST_WORK_DIR` to `~/.config/fsh`, where the image ships that file (`rootfs/root/.config/fsh/`). The built-in theme sets no `secondary` style, so the file is never read.
The tmux prefix in this config is **Ctrl-S**; the deck's tmux step uses `Ctrl-S l` to split right. Root's `.zshrc` adds `/usr/local/bin` to `PATH` so the demo commands are available by name.

## Terminal protocol demos

`terminal-colors` (`rootfs/usr/local/bin/terminal-colors`) queries the terminal with OSC 11 and prints the reply as both escaped bytes and an RGB value. It opens `/dev/tty`, saves the terminal settings, disables echo and canonical input while consuming the reply, and restores the saved settings on exit or interruption. It accepts BEL and ST terminators and gives up after two seconds.

`bat /root/hello.sh` detects the terminal's current colors each time it runs: its `--theme` defaults to `auto`. Alpine 3.24 installs **bat 0.26.1**; its [`src/theme.rs`](https://github.com/sharkdp/bat/blob/v0.26.1/src/theme.rs) uses terminal-colorsaurus 1.0.1 to send OSC 10/11 queries and a DA1 sentinel. The [`--theme` help](https://github.com/sharkdp/bat/blob/v0.26.1/src/bin/bat/clap_app.rs) distinguishes `auto` (query when stdout is a terminal), `auto:always` (also query when redirected), and `auto:system` (macOS system preference). Use `auto` for this guest.

`/root/chinatsu-bot-avatar.jpeg` (1080 × 1080, 67 KiB) and `/root/chinatsu-bot-avatar.png` (the same picture at 256 × 256, 76 KiB, made with `sips -s format png -Z 256`) are the image demo's files (`pages/terminal-images.md`): the JPEG goes through the iTerm2 protocol, the PNG through the kitty protocol, which takes PNG (`f=100`) but not JPEG. Both are Git LFS files, as `.gitattributes` tracks `*.jpeg` and `*.png`.

`agent-status-demo` (`rootfs/usr/local/bin/agent-status-demo`) sends OSC 7501 reports for `working`, `blocked` and `done`, as `app=ClaudeCode`. Press Enter at `blocked` to continue; the final `done` state remains visible. It is a protocol demo, with no Coding Agent or network service. The sequence format follows botmux `cb8ff44b2`, `src/utils/program-status-parser.ts`.

## The published format

`public/linux/manifest.json`, read by `runtime/disk.ts` (type `DiskManifest` in `image/pack.ts`):

```json
{
  "format": "terminal-glance/disk@1",
  "label": "kwdata",
  "unkernel": "0.1.0-261117-0e4b2ec",
  "inputHash": "<sha256 of image/ and the unkernel version>",
  "size": 4294967296,
  "chunkSize": 1048576,
  "encoding": "gzip",
  "chunks": { "<index>": "chunks/<first 16 hex of sha256(raw chunk)>.gz" },
  "stats": { "nonZeroChunks": 95, "uniqueChunks": 95, "rawBytes": 99614720, "compressedBytes": 28892482 }
}
```

- Chunk `i` holds bytes `[i * chunkSize, min(size, (i + 1) * chunkSize))`, gzip-compressed.
- An index missing from `chunks` is all zeros.
- Files are named by content: equal chunks are stored once, and a file's URL never changes content, so browsers and CDNs may cache it indefinitely.
- The packer writes the manifest last, by rename, and deletes chunk files no longer referenced.

`test/disk.test.ts` checks this contract both ways: whatever `pack.ts` publishes, `runtime/disk.ts` reads back byte for byte.

## Size

Figures from the current package list:

| Measure | Size |
| --- | --- |
| Installed by apk | 56 MiB |
| Overlay upper in the guest (zinit and its two plugins 10 MiB of it) | 68 MiB |
| Non-zero data | 95 chunks, 95 MiB |
| Published (gzip) | **27.6 MiB** |

The page downloads chunks only when the guest reads inside them: a viewer who never runs `nvim` never downloads neovim.
GitHub refuses pushed files over 100 MB; every chunk is about 1 MiB.

## Changing the image

| Task | Change |
| --- | --- |
| Add or remove a tool | `image/guest/packages.txt`, then `pnpm build:image` |
| Change the shell or tmux configuration | `image/guest/rootfs/root/.zshrc`, `image/guest/rootfs/root/.config/tmux/tmux.conf` |
| Add files to the guest | Put them under `image/guest/rootfs/` at their guest path |
| Bump `unkernel` | Update the catalog version in `pnpm-workspace.yaml`, `pnpm install`, `pnpm build:image` |

Then check the result in the page (`pnpm dev terminal-glance`): a new terminal must show the jovial prompt with no error lines, and the tool must run.
