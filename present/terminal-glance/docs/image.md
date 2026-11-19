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
  build.ts            Bun. Orchestrates: input hash, skip when up to date, provision, pack, trace the boot.
  pack.ts             Bun. Raw disk → public/linux/{manifest.json, chunks/*.gz}. Exports the manifest type.
  vm/provision.ts     Node >= 24. Boots unkernel with network + a fresh data disk, runs guest/setup.sh, powers off.
  vm/trace-boot.ts    Node >= 24. Boots the published disk offline as the page does; prints what it reads up to the first prompt.
  guest/              Mounted read-only at /provision inside the build VM.
    setup.sh          Runs in the guest (busybox ash): apk, login shell, zsh plugins, checks, cleanup, zero free blocks.
    packages.txt      apk packages, one per line.
    rootfs/           Copied over / : shell/tmux config, demo commands, /root/hello.sh and the demo images.
```

Outputs, all gitignored:

| Path | Content |
| --- | --- |
| `.cache/image/kwdata.img` | The raw 4 GiB sparse ext4 disk. |
| `public/linux/manifest.json` | The published disk's index (below). |
| `public/linux/chunks/*.gz` | The published disk's data. |
| `public/linux/boot/*.gz` | The boot bundle: the blocks the guest reads up to its first prompt, in one file. |

Slidev copies `public/` into the deck's build, so the page fetches `<base>/linux/manifest.json`.

The VM driver runs on Node 24 because unkernel needs WebAssembly JSPI, which Bun does not have. `build.ts` uses `node` when it is version 24 or newer, else `npx -y node@24`.

## Building

```sh
cd present/terminal-glance
pnpm build:image            # skips when public/linux/manifest.json has the same input hash
pnpm build:image --force    # rebuild anyway, e.g. to pick up newer packages
```

About 1.5 minutes on a laptop: 50 to 80 s provisioning, 2 s packing, then about 7 s tracing the boot.
When the inputs are unchanged but the manifest has no boot trace yet, the build only traces the boot.

Most of the time is apk downloading packages, so the build first downloads the guest's package index (`v3.24/main/riscv64/APKINDEX.tar.gz`) from the official CDN and a few large mirrors at once and installs from the fastest; from some networks the official CDN delivers about 30 KB/s while a nearby mirror delivers 1 MB/s. `ALPINE_MIRROR=https://…` skips the probe. When apk fails on the chosen mirror, `setup.sh` installs again from the official repositories, which the image keeps. The build stops with an error after 5 minutes (`--timeout-min`), naming the mirror to check.

The input hash covers every file under `image/` and the installed `unkernel` version.
Packages come from the live Alpine 3.24 repositories and the zsh plugins from their default branches, so two builds with the same hash can differ; the image stamp records the plugins' commits.

The deck's `build` script runs `build:image` before `slidev build`, so the site build (`pnpm build` at the repository root, which CI runs on every push) always ships a current image.

## What `guest/setup.sh` does

1. Checks that `/` is the overlay on the kwdata disk.
2. Enables Alpine's community repository and `apk add --no-cache` everything in `packages.txt`.
3. Copies `rootfs/` over `/` and sets root's shell to `/bin/zsh`.
   Checks `bat --version`, the demo scripts' syntax, bat's ability to render the sample file, and that `base64 -w0` reads the demo images.
4. Checks tmux: the `tmux-256color` terminfo entry exists (`default-terminal` in the config) and the config loads without errors.
5. Clones jovial and fast-syntax-highlighting (`git clone --depth 1`, default branch) into `~/.local/share/zsh-plugins/`, keeping jovial's `jovial.zsh-theme`, `jovial.plugin.zsh` and `LICENSE`, and fast-syntax-highlighting without its git history, screenshots and tests. The build fails unless these two are the only plugins.
6. Compiles what zsh reads at start with `zcompile`: `.zshrc`, jovial's two files, and the files fast-syntax-highlighting sources or autoloads at load (see [Shell start time](#shell-start-time)).
7. Fails if `node`, `python3` or `zoxide` came in as a dependency of another package.
8. Takes the network down and starts `zsh -i` again, on the compiled files, loading fast-syntax-highlighting as the page does after the first prompt; any stderr output fails the build, so the page starts offline cleanly. It also fails unless fast-syntax-highlighting's `$FAST_WORK_DIR` is `~/.config/fsh` and its `secondary_theme.zsh` there loads the plugin's secondary theme (see [The secondary theme download](#the-secondary-theme-download)), and when a compiled file is older than its source, which zsh would then ignore.
9. Writes `/etc/terminal-glance-image` (input hash, unkernel version, lower image id, build time, the two plugins' commits).
10. Removes apk and shell caches, histories and temporary files.
11. `fstrim /data`: the driver turns discards into zeros, so freed blocks become zero chunks that are not published.
12. Removes the overlay's boot markers (`attempts`, `safe`), so the first boot on the page is a clean one.

## Shell and tmux configuration

| File | Source | Changed |
| --- | --- | --- |
| `rootfs/root/.zshrc` | jovial's README, [Manually Install Without oh-my-zsh](https://github.com/zthxxx/jovial#manually-install-without-oh-my-zsh) | Sources the jovial theme and `jovial.plugin.zsh` directly, with no plugin manager and no completion system, and loads fast-syntax-highlighting right after the first prompt. Sets fast-syntax-highlighting's `FAST_WORK_DIR` to `~/.config/fsh` ([Shell start time](#shell-start-time)). |
| `rootfs/root/.config/tmux/tmux.conf` | [zthxxx/tmux-config `tmux.conf`](https://github.com/zthxxx/tmux-config/blob/main/tmux.conf) | Every plugin is left out (TPM, resurrect, continuum, treemux). |

Each file's header records the upstream commit it was taken from.
The tmux prefix in this config is **Ctrl-S**; the deck's tmux step uses `Ctrl-S l` to split right. Root's `.zshrc` adds `/usr/local/bin` to `PATH` so the demo commands are available by name.

### Shell start time

Under the in-browser VM each zsh plugin adds to the time before the first prompt, so the image loads only the two the talk needs: the theme, and syntax highlighting to make typed commands readable. Packages the demos do not use (node, python, zoxide) are left out to keep the download small.

In the VM, zsh's start costs what its scripts run, not the processes they start. Measured in the guest:

| Operation | Time |
| --- | ---: |
| One zsh statement (`x=$((i*2))`) | 29 µs |
| Subshell (`x=$(:)`) | 0.27 ms |
| fork and exec of `/bin/true` | 0.72 ms |
| `zmodload zsh/zle` | 4.9 ms |

A zsh statement takes some 30 to 100 times its native time, so a few thousand statements before the prompt cost hundreds of milliseconds.

A trace of the login shell the page started with zinit (`xtrace` with a timestamp per statement) counted 2693 statements in zinit, 1526 in fast-syntax-highlighting's load and 847 in jovial. Sourcing `zinit.zsh` took 121 to 138 ms even compiled. While it loads a plugin, zinit replaces `autoload`, `zle -N`, `bindkey` and the hook functions with versions that record what the plugin defines (`:zinit-tmp-subst-*`); its `autoload` alone ran 110 statements in jovial's load and 661 in fast-syntax-highlighting's, which wraps each of zle's 386 widgets. That load took 0.3 to 0.6 s, during which typed keys did not echo. `compinit` took another 50 ms.

So `.zshrc` has no plugin manager and no completion system:

- It sources `jovial.zsh-theme` and `jovial.plugin.zsh`, as jovial's README installs it without a plugin manager.
- It loads fast-syntax-highlighting from a `zle -F` handler on `/dev/null`, which is readable at once, so zle runs it as soon as the first prompt is drawn (the technique of [zsh-defer](https://github.com/romkatv/zsh-defer)). zsh reads no key while the load runs; keys typed meanwhile are read after it, highlighted, and the handler, a widget, highlights the line typed before it ran.
- Step 6 compiles the scripts it sources: zsh reads `file.zwc` in place of a sourced script, a startup file or an autoloaded function when it is newer ([zshbuiltins(1), `zcompile`](https://zsh.sourceforge.io/Doc/Release/Shell-Builtin-Commands.html)).

A login shell on the page now, timed from the `vm.spawn` call (3 runs, the slowest functions of jovial timed by wrappers):

| Part | Time |
| --- | ---: |
| `vm.spawn` | 10 to 18 ms |
| `/etc/zsh/zshenv`, `/etc/profile` (from `/etc/zsh/zprofile`) and `/etc/zsh/zshrc` | about 13 ms |
| Sourcing jovial, theme and plugin | 33 to 35 ms |
| jovial's first precmd | 77 to 82 ms |
| · segment lengths, through a regex loop per affix (`@jov.init-affix`) | 35 to 42 ms |
| · the dev-env probe started in a zpty, a new process on every prompt (`@jov.async-dev-env-detect`) | 15 to 18 ms |
| · the terminal background reply and palette (`@jov.theme-detect`) | 9 to 16 ms |
| The prompt, `$(@jovial-prompt)` | 5 to 7 ms |
| **Prompt at the page** | **174 to 182 ms** |
| fast-syntax-highlighting loaded, keys read again | 273 to 290 ms |

With zinit and `compinit -C`, zsh had reached its prompt 390 to 405 ms after it started (500 to 600 ms before its scripts were compiled), and fast-syntax-highlighting's load ended 0.3 to 0.6 s after the prompt. The image is also 7.5 MiB smaller: zinit and the plugins' git histories and documentation took 11 MiB in the guest, the two plugins now 0.9 MiB.

Two shells starting together, as on a slide with two terminals, share the VM's one CPU, and each shows its prompt after about 0.3 s. Most of what remains is jovial's first precmd.

Highlighting one of the deck's command lines takes 8 to 32 ms per redraw, and up to 0.16 s the first time a command with its own highlighter (a chroma, such as `git`) is typed.

#### The secondary theme download

Symptom: the first keys typed after the first prompt showed nothing for about 5 s, then ran together.

Cause: fast-syntax-highlighting downloads `share/free_theme.zsh` from GitHub into `$FAST_WORK_DIR/secondary_theme.zsh` with curl (or wget) at every start while that file is missing, then touches it (`fast-syntax-highlighting.plugin.zsh` lines 366 to 377, zdharma-continuum [4672ad5](https://github.com/zdharma-continuum/fast-syntax-highlighting/blob/4672ad5/fast-syntax-highlighting.plugin.zsh#L366-L377)). The work dir defaults to `~/.cache/fast-syntax-highlighting`, or `~/.cache/fsh` when that is not writable (lines 47 to 62), and step 10 empties `~/.cache`, so every boot on the page lacked the file. The guest's `curl` is unkernel's shim over busybox wget (`/usr/local/bin/curl` in its initramfs), and on the page the guest has only a loopback interface, so wget's name lookup (musl, `nameserver 10.0.2.3`) takes 5 s to fail, where a connection by address fails at once. A trace of the plugin's load showed the `curl` command taking 5.03 s.

Change:

- `.zshrc` sets `FAST_WORK_DIR` to `~/.config/fsh` before loading the plugin, which the plugin keeps when it is writable.
- The image ships `rootfs/root/.config/fsh/secondary_theme.zsh`, which sources the plugin's own `share/free_theme.zsh` (`$FAST_BASE_DIR` is the plugin's directory): the same file the download fetches, read from the disk.
- The secondary theme styles nested code, the inside of `$(…)`, backquotes and `eval` strings: the highlighter switches to it through `FAST_HIGHLIGHT_STYLES[secondary]`, which defaults to `free`, and sources the file unless `FAST_HIGHLIGHT_STYLES[freedefault]` is set (`fast-highlight`). In `"$(base64 -w0 x)"`, `base64` is drawn in `fg=180` and `-w0` in `fg=110`, as in an online install; with an empty file they have no style.
- Step 8 fails the build unless `$FAST_WORK_DIR` is `~/.config/fsh` and sourcing its `secondary_theme.zsh` sets `freedefault`. The build clones the plugin's default branch every time, so a change upstream that would bring the download back stops the build instead of reaching the page.

Measured in the page, the first terminal of slide 5, typing `uname -a` at 40 ms per key right after the first prompt:

| Measure | Before | After |
| --- | --- | --- |
| First key → its echo | 5051 ms | 19 to 23 ms |
| First prompt → `uname -a` output | 5354 ms | 650 to 666 ms |

To see where the plugin's load spends its time, trace it in a page terminal; each line printed ran for more than 0.1 s, with that time in front:

```zsh
cat > /tmp/highlighting.zsh <<'EOF'
zmodload zsh/datetime
PS4='+$EPOCHREALTIME %N:%i> '
setopt xtrace
.terminal-glance-load-highlighting
EOF
zsh -i -c 'source /tmp/highlighting.zsh' 2>/tmp/highlighting.trace
awk '/^\+[0-9]/ { t = substr($1, 2); if (p && t - p > 0.1) printf "%.2f s  %s\n", t - p, last; p = t; last = $0 }' /tmp/highlighting.trace
```

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
  "boot": [0, 2, 1920, 34, 2048, "…"],
  "bootBundle": { "file": "boot/<first 16 hex of sha256(raw)>.gz", "blockSize": 16384, "runs": [[0, 2], ["…"]] },
  "stats": { "nonZeroChunks": 90, "uniqueChunks": 90, "rawBytes": 94371840, "compressedBytes": 28427274 }
}
```

- Chunk `i` holds bytes `[i * chunkSize, min(size, (i + 1) * chunkSize))`, gzip-compressed.
- An index missing from `chunks` is all zeros.
- Files are named by content: equal chunks are stored once, and a file's URL never changes content, so browsers and CDNs may cache it indefinitely.
- The packer writes the manifest last, by rename, and deletes chunk files no longer referenced.
- `vm/trace-boot.ts` boots the published disk once, offline, the way the page does, and records what the guest reads from power-on until zsh's first prompt and fast-syntax-highlighting's load after it. `.zshrc` marks both moments with an iTerm2 SetUserVar escape (`OSC 1337 ; SetUserVar=terminal_glance_boot=<base64>`), which terminals that do not know it ignore: `prompt` from a one-shot precmd hook, `plugins` once fast-syntax-highlighting has loaded. Without the `prompt` mark within 60 s the build fails; without the `plugins` mark the trace stops 5 s after the prompt.
- `boot` lists the chunks it read, in first-read order. `bootBundle` holds the bytes it read, rounded to 16 KiB blocks: `runs` are `[first block, block count]`, ascending, and the file is those blocks one after another, each 16 KiB (the disk's last one padded with zeros), gzip-compressed and named by content like the chunks.
- The page downloads the bundle as soon as it has the manifest, in parallel with the kernel's own download. A read the bundle covers entirely is served from it; any other read loads its chunks. The boot reads 211 blocks (3.3 MiB) from the 21 chunks it touches in the current image, so the bundle is 0.95 MiB gzip where those chunks are 4.0 MiB.
- The guest's timing varies, so two traces of one image differ by a few blocks; on the page, such a read loads its chunk.
- A manifest with `boot` but no bundle, or whose bundle fails to download, fetches those chunks 6 at a time instead; one with neither boots fully lazily. A prefetched chunk stays in memory until the guest has read it.
- When a shell first writes output (its first prompt), or 5 s after the kernel starts, whichever comes first, and once the page is idle, the page downloads every chunk not fetched yet, in disk order, two at a time (at low priority in a build), so a program's first run (htop, bat, tmux) reads from memory. Every fetched file is kept as published, gzip (`ImageFiles`), 20 MiB for the whole image; a guest read decompresses its chunk, and no file is fetched twice. The guest still has no network: these are the page's own requests for its disk.

`test/disk.test.ts` checks this contract both ways: whatever `pack.ts` publishes, `runtime/disk.ts` reads back byte for byte.

## Size

Figures from the current package list:

| Measure | Size |
| --- | --- |
| Installed by apk | 56 MiB |
| Overlay upper in the guest (the two zsh plugins 0.9 MiB of it) | 59 MiB |
| Non-zero data | 79 chunks, 79 MiB |
| Published (gzip) | **20.2 MiB** |
| Boot bundle (gzip): the 211 blocks of 16 KiB the boot reads | 0.95 MiB |

The page downloads the boot bundle at once, and the other chunks in the background after the first prompt; until then a read outside the bundle fetches its chunk at once.
GitHub refuses pushed files over 100 MB; every chunk is about 1 MiB.

## Changing the image

| Task | Change |
| --- | --- |
| Add or remove a tool | `image/guest/packages.txt`, then `pnpm build:image` |
| Change the shell or tmux configuration | `image/guest/rootfs/root/.zshrc`, `image/guest/rootfs/root/.config/tmux/tmux.conf` |
| Add files to the guest | Put them under `image/guest/rootfs/` at their guest path |
| Bump `unkernel` | Update the catalog version in `pnpm-workspace.yaml`, `pnpm install`, `pnpm build:image` |

Then check the result in the page (`pnpm dev terminal-glance`): a new terminal must show the jovial prompt with no error lines, and the tool must run.
