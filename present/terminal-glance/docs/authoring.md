# Writing demo slides

A demo slide is a `<ShellDemo>` with its terminals and an ordered list of `<ShellStep>` buttons.
Both components are auto-registered from `components/`.

```md
<ShellDemo terminals="a b">
  <ShellStep to="a" run="tty" />
  <ShellStep to="b" run="printf ok > /dev/pts/{a.pts}" />
  <ShellStep to="a" keys="⏎" />
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
| `type` | Text typed as a person would, without a final Enter (input for a running program, or a half-typed line). |
| `run` | A command typed as a person would, then Enter. A line break in the text is typed as Enter; the guest's empty `PS2`/`RPS2` keeps multiline input free of continuation prefixes while preserving its indentation. `run=""` presses Enter only. |

The typing schedule spans at most 1.2 s: up to 12 ms per character for short text, faster for long text, and up to 80 ms after each pressed key before the next input. Shell execution time is outside this budget.

The terminal-name badge on a step (`A`, `B`) and the name in a terminal's title bar appear only when the demo has more than one terminal.

Each terminal title bar has a shared dark/light toggle. The preference persists across reloads, separately from Slidev's page theme; see [architecture](./architecture.md#shared-terminal-appearance). For the color-query demo, run `terminal-colors`, switch theme and run it again. Run bat again to demonstrate application-selected syntax colors; reinitialize jovial with `exec zsh` when testing its startup detection.

`agent-status-demo` emits root OSC 7501 reports and waits for Enter at `blocked`. The title bar shows the latest report. Mark this as a simulated Agent: the script demonstrates protocol bytes and terminal behavior without a model service.

A multi-line command is written with real line breaks inside the attribute; the indentation is typed as written:

```md
  <ShellStep to="a" run="for i in {1..10}; do
  echo $i
  sleep 1
done" />
```

`{a.pts}` and `{a.pid}` in `type` / `run` become terminal `a`'s pty number and its shell's pid when the step plays. The button shows the resolved value once the terminal runs.

Steps can be clicked again and in any order. A played step shows a check mark; the mark only reflects clicks in this page load.

### Escaping in attributes

The step text is an HTML attribute inside markdown, kept as raw HTML:

- Use single quotes around the attribute when the command contains double quotes: `run='echo "you typed: $input"'`.
- When the command contains both kinds, write each single quote as `&#39;` inside a single-quoted attribute; Vue decodes HTML entities in attribute values, so the shell receives `'`.
- Backslashes are literal (`\x1b`, `\003`, `\n` reach the shell as typed).
- `<`, `>`, `$`, `{`, `}` need no escaping, and neither does `&` unless it starts an entity such as `&#39;`.
- Keep the `<ShellDemo>` block free of blank lines: a blank line ends markdown's raw-HTML block.

### Escape sequences in steps

On each terminal of a slide, the first step that prints an escape sequence declares the names on its first line and uses them on the next, so the audience reads `${CSI}`, `${OSC}` instead of raw `\e[`:

```md
  <ShellStep run='ESC=$&#39;\x1b&#39;; CSI="${ESC}["; OSC="${ESC}]"; ST="${ESC}\\"
printf "${OSC}7501;state=clear${ST}"' />
  <ShellStep run='printf "${OSC}7501;state=done${ST}"' />
```

Later steps on the same terminal reuse the variables; the names live in that terminal's shell only. Slides with only cursor and color steps declare `ESC` and `CSI`; OSC slides declare all four. The vocabulary slide in `pages/ansi-stty.md` introduces the names.

## Where things run

| Window | Terminals | Steps |
| --- | --- | --- |
| Slide window (`/#/N`) | Live shells on the page's Linux VM | Typed into the shells |
| Presenter (`/#/presenter/N`) | Stand-in box | Sent to the slide window of the same browser and typed there |
| Overview, next-slide preview, export | Stand-in box | Inert |

A terminal's shell is spawned the first time its slide is shown, so pty numbers follow the order slides are visited. Returning to a slide reattaches the same shell with its history.

## Speaker notes

Each slide's notes (the last `<!-- ... -->` of the slide) hold the talk outline. A demo slide's notes explain its steps in order, by number; the commands themselves live only in the `<ShellStep>`s, which the presenter view shows as buttons. Keep `$` inside code spans in notes, so KaTeX does not read `$...$` as math.

## Checking a demo

1. `pnpm dev terminal-glance` (repository root).
2. Open the slide, click every step in order, and read both terminals.
3. Click them again after visiting other slides: the shells must still answer.
4. `pnpm build` before pushing.
