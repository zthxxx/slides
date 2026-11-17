# Writing demo slides

A demo slide is a `<ShellDemo>` with its terminals and an ordered list of `<ShellStep>` buttons.
Both components are auto-registered from `components/`.

```md
<ShellDemo terminals="a b">
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="echo ok > /dev/pts/{a.pts}" />
  <ShellStep to="a" keys="^C" />
  <ShellStep to="a" keys="^C" run="stty icanon" />
  <ShellStep run="secret" />
</ShellDemo>
```

## `<ShellDemo>`

| Prop | Default | Meaning |
| --- | --- | --- |
| `terminals` | `"a"` | Space-separated terminal names, stacked top to bottom. Each name is one shell on its own pty. |

The steps column appears only when the demo has steps. The demo takes the slide's remaining height, so a one-line caption above it is fine; longer text pushes the terminals smaller.

`<Terminal name="a" />` can also be used alone, without steps.

## `<ShellStep>`

A step is sent in this order: `keys`, then `type`, then `run` followed by Enter.

| Prop | Meaning |
| --- | --- |
| `to` | Target terminal name. Default: the first terminal of the demo. |
| `keys` | Space-separated keys sent as pressed, e.g. `"^C"`, `"^S l"`, `"↑ ⏎"`. Named keys are in `KEY_BYTES` (`runtime/steps.ts`); anything else is sent literally. |
| `type` | Text typed character by character, without Enter (input for a running program, or a half-typed line). |
| `run` | A command line typed character by character, then Enter. |

`{a.pts}` and `{a.pid}` in `type` / `run` become terminal `a`'s pty number and its shell's pid when the step plays. The button shows the resolved value once the terminal runs.

Steps can be clicked again and in any order. A played step shows a check mark; the mark only reflects clicks in this page load.

### Escaping in attributes

The step text is an HTML attribute inside markdown, kept as raw HTML:

- Use single quotes around the attribute when the command contains double quotes: `run='echo -e "\e[35m..."'`.
- Backslashes are literal (`\e`, `\003`, `\n` reach the shell as typed).
- `<`, `>`, `&`, `$`, `{`, `}` need no escaping.
- Keep the `<ShellDemo>` block free of blank lines: a blank line ends markdown's raw-HTML block.

## Where things run

| Window | Terminals | Steps |
| --- | --- | --- |
| Slide window (`/#/N`) | Live shells on the page's Linux VM | Typed into the shells |
| Presenter (`/#/presenter/N`) | Stand-in box | Sent to the slide window of the same browser and typed there |
| Overview, next-slide preview, export | Stand-in box | Inert |

A terminal's shell is spawned the first time its slide is shown, so pty numbers follow the order slides are visited. Returning to a slide reattaches the same shell with its history.

## Speaker notes

Each slide's notes (the last `<!-- ... -->` of the slide) hold the talk outline. A demo slide's notes also list its commands in a `sh` block marked `# A` / `# B`, so the demo can be typed by hand. Keep `$` inside code spans in notes, so KaTeX does not read `$...$` as math.

## Checking a demo

1. `pnpm dev terminal-glance` (repository root).
2. Open the slide, click every step in order, and read both terminals.
3. Click them again after visiting other slides: the shells must still answer.
4. `pnpm build` before pushing.
