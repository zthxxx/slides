# terminal-glance

"CLI 概览 (其一)": a talk on terminals, TTY, PTY, shells and ANSI, whose demos run on a real Linux inside the page.
The demos need no server and no network: the Linux is unkernel (the Linux kernel compiled to WebAssembly) with a prebuilt disk of tools.

## Common tasks

Run from the repository root unless noted.

| Task | Command |
| --- | --- |
| Preview the deck | `pnpm dev terminal-glance` |
| Build the guest image (first checkout, or after changing `image/`) | `pnpm -C present/terminal-glance build:image` |
| Rebuild the image regardless of its inputs | `pnpm -C present/terminal-glance build:image --force` |
| Run the tests | `pnpm -C present/terminal-glance test` |
| Build the whole site | `pnpm build` |

Without a built image the page still runs, on bare Alpine (busybox ash), and says so in every terminal.

## Directory map

```
present/terminal-glance/
  slides.md          the deck: slides, demo steps, speaker notes
  components/        ShellDemo, Terminal, ShellStep (auto-registered by Slidev)
  runtime/           the VM, sessions, emulator, disk, steps, presenter relay
  image/             the guest image build (IaC)
  test/              tests of the build ↔ runtime contract
  public/images/     slide pictures
  public/linux/      built guest image (gitignored)
  .cache/            raw build disk (gitignored)
  docs/              this documentation
```

## Documents

- [architecture.md](./architecture.md): layers, boot and session lifecycle, the terminal emulator, constraints.
- [image.md](./image.md): what the guest image is, how it is built and published, its size, how to change it.
- [authoring.md](./authoring.md): writing demo slides with `<ShellDemo>` and `<ShellStep>`, speaker notes.

## Presenting

- Open the deck, then the presenter view from it (same browser). Steps clicked in the presenter view type into the slide window's terminals.
- Click into a terminal to type by hand; click outside it before using the keyboard to change slides.
- Selecting text in a terminal copies it. Cmd-click (Ctrl-click) opens a URL.
- Inside tmux the prefix is Ctrl-S (zthxxx/tmux-config).
