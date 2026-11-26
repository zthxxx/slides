# Hack Nerd Font Mono

The terminal font of the deck's in-page Linux (`runtime/emulator.ts`, `@font-face` in `components/Terminal.vue`).

| | |
| --- | --- |
| Source | Nerd Fonts [v3.5.1](https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.5.1), `Hack.zip` (sha256 `fa24da7de7cefe7766614d27762570b20453c852fc1d5b657111666df9a5e449`) |
| Files taken | `HackNerdFontMono-{Regular,Bold,Italic,BoldItalic}.ttf` (the *Mono* variant: every glyph one cell wide) |
| Upstream font | [Hack](https://github.com/source-foundry/Hack) 3.003 |
| Conversion | TTF → WOFF2 with fontTools 4.68.0 + brotli, glyphs and tables unchanged |
| License | `LICENSE.md` from the same archive: Hack MIT, Bitstream Vera License, DejaVu public domain; the Nerd Fonts patcher and icon sets are listed in the archive's README (mostly MIT, some CC BY 4.0 / OFL 1.1) |

Metrics (all four faces): 2048 units per em, ascent 1901, descent 483, line gap 0, advance 1233.

To update: download a newer `Hack.zip` from the Nerd Fonts releases, convert the same four files, and update this table.
