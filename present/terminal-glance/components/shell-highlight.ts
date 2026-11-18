import type { HighlighterCore } from 'shiki/core'

/** A highlighted piece of a step's text; its `--shiki-light` / `--shiki-dark` custom properties carry both themes' colors. */
export interface ShellToken {
  content: string
  style: Record<string, string>
}

let highlighter: Promise<HighlighterCore> | undefined

/**
 * Shiki with only what the step buttons need: the shell grammar, the deck's code themes (vitesse, as set in
 * packages/slidev-theme-eloc/setup/shiki.ts) and the JavaScript regex engine, which avoids shipping oniguruma's
 * WebAssembly. Created on first use. The build puts these modules into the `app` chunk (vite.config.ts
 * `codeSplitting`), so they load with the page rather than separately.
 * Source: shiki@4.6.0 `shiki/core`, `shiki/engine/javascript`, `shiki/langs/*`, `shiki/themes/*`.
 */
function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')])
    .then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) => createHighlighterCore({
      themes: [import('shiki/themes/vitesse-light.mjs'), import('shiki/themes/vitesse-dark.mjs')],
      langs: [import('shiki/langs/shellscript.mjs')],
      engine: createJavaScriptRegexEngine(),
    }))
  return highlighter
}

/** Shell tokens of `text`, one array per line. */
export async function highlightShell(text: string): Promise<ShellToken[][]> {
  const shiki = await loadHighlighter()
  const { tokens } = shiki.codeToTokens(text, {
    lang: 'shellscript',
    themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
    defaultColor: false,
  })
  return tokens.map(line => line.map(token => ({ content: token.content, style: token.htmlStyle ?? {} })))
}
