#!/usr/bin/env bun
/**
 * Renders the archify sources in this directory (`<name>.<type>.json`) into the light-theme SVGs that the slides load
 * from `public/images/diagrams/<name>.svg`.
 *
 *   bun diagrams/render.ts              every source
 *   bun diagrams/render.ts ssh-layers   only the named ones
 *
 * Each source first passes archify's `finalize` (schema, layout and browser checks); its HTML viewer and receipts
 * stay in `.logs/diagrams/<name>/` for inspection. The SVG then comes from archify's static `export-svg`.
 * Ref: .agents/skills/archify (archify 3.3.2) `SKILL.md`, `references/delivery-contract.md`.
 */
import type { Browser } from 'playwright-chromium'
import { $, Glob } from 'bun'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-chromium'

const deckDir = path.resolve(import.meta.dir, '..')
const archify = path.resolve(deckDir, '../../.agents/skills/archify/bin/archify.mjs')
const logDir = path.join(deckDir, '.logs/diagrams')
const outDir = path.join(deckDir, 'public/images/diagrams')

const sources = [...new Glob('*.*.json').scanSync(import.meta.dir)].sort()
const wanted = process.argv.slice(2)
const selected = wanted.length ? sources.filter(file => wanted.includes(file.split('.')[0])) : sources
const unknown = wanted.filter(name => !sources.some(file => file.split('.')[0] === name))
if (unknown.length)
  throw new Error(`No diagram source named: ${unknown.join(', ')}`)

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })

let failed = 0
for (const file of selected) {
  const [name, type] = file.split('.')
  const source = path.join(import.meta.dir, file)
  const { meta } = JSON.parse(await readFile(source, 'utf8'))
  const quality = meta.quality_profile ?? 'showcase'

  // A directory per diagram: browser-check refuses to overwrite evidence of an earlier version of the source, export-svg
  // refuses to replace a file, and archify locks the output directory while it delivers.
  const runDir = path.join(logDir, name)
  await rm(runDir, { recursive: true, force: true })
  await mkdir(runDir, { recursive: true })

  const finalize = await $`node ${archify} finalize ${type} ${source} ${path.join(runDir, `${name}.html`)} --quality ${quality} --no-update-notice --json`
    .nothrow().quiet()
  await writeFile(path.join(runDir, 'finalize.log'), finalize.stdout)
  if (finalize.exitCode !== 0) {
    failed++
    console.error(`✗ ${name}: finalize failed, see .logs/diagrams/${name}/finalize.log`)
    console.error(summarize(finalize.stdout.toString() || finalize.stderr.toString()))
    continue
  }

  const exported = path.join(runDir, `${name}.svg`)
  await $`node ${archify} export-svg ${type} ${source} ${exported} --theme light --quality ${quality} --json`.quiet()
  const svg = await cropToContent(browser, haloLabels(pruneFontFaces(await readFile(exported, 'utf8'))))
  await writeFile(path.join(outDir, `${name}.svg`), svg)
  console.log(`✓ ${name} → public/images/diagrams/${name}.svg (${Math.round(svg.length / 1024)} KiB)`)
}

await browser.close()
if (failed)
  process.exit(1)

function summarize(stdout: string): string {
  try {
    const receipt = JSON.parse(stdout)
    const diagnostics = (receipt.diagnostics ?? []) as { code: string, subject?: string, message?: string }[]
    return [`  gates: ${JSON.stringify(receipt.gates)}`, ...diagnostics.map(d => `  ${d.code} ${d.subject ?? ''} ${d.message ?? ''}`)].join('\n')
  }
  catch {
    return stdout.slice(0, 2000)
  }
}

/**
 * archify embeds every JetBrains Mono subset (Latin, Latin Extended, Cyrillic, Greek, Vietnamese) as base64 WOFF2.
 * Drops the `@font-face` rules whose `unicode-range` covers no character the diagram draws; CJK text uses the system
 * fallback font either way.
 */
function pruneFontFaces(svg: string): string {
  const drawn = new Set<number>()
  const text = svg.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
  for (const char of decodeEntities(text))
    drawn.add(char.codePointAt(0)!)

  return svg.replace(/@font-face\s*\{[^}]*\}/g, (rule) => {
    const range = /unicode-range:\s*([^;}]+)/.exec(rule)?.[1]
    if (!range)
      return rule
    const spans = range.split(',').map((part) => {
      const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-')
      return [Number.parseInt(from.replaceAll('?', '0'), 16), Number.parseInt(to.replaceAll('?', 'F'), 16)]
    })
    return [...drawn].some(code => spans.some(([from, to]) => code >= from && code <= to)) ? rule : ''
  })
}

/**
 * archify puts each edge, frame and segment label on a rounded chip (`rect.c-mask`) and sets the text on a baseline,
 * so the text does not sit centred in its chip. A halo in the canvas colour keeps the label readable over lines and
 * frames without a chip to align.
 */
function haloLabels(svg: string): string {
  const style = `<style>
.c-mask { display: none !important; }
.c-mask + text { paint-order: stroke fill; stroke: var(--bg, #f4f5f7); stroke-width: 6px; stroke-linejoin: round; }
</style>`
  return svg.replace(/<\/svg>\s*$/, `${style}</svg>\n`)
}

/**
 * archify sizes the canvas from fixed bands rather than from what it draws: a sequence always starts its participants at
 * y 72 (`renderers/sequence/render-sequence.mjs` `layout.topY`), and an architecture keeps 30 above its first frame.
 * Measures the drawn content in Chrome and fits the canvas to it with an even margin, so a diagram spends its slide
 * height on content.
 */
async function cropToContent(browser: Browser, svg: string): Promise<string> {
  const margin = 20
  const page = await browser.newPage()
  await page.setContent(svg)
  const box = await page.evaluate(async () => {
    await document.fonts.ready
    const root = document.querySelector('svg')!
    const toUser = root.getScreenCTM()!.inverse()
    const edges = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    for (const element of root.children) {
      if (element.matches('defs, style, title, desc, metadata, .archify-bake-background, [fill="url(#grid)"]'))
        continue
      const rect = element.getBoundingClientRect()
      if (!rect.width && !rect.height)
        continue
      const from = new DOMPoint(rect.left, rect.top).matrixTransform(toUser)
      const to = new DOMPoint(rect.right, rect.bottom).matrixTransform(toUser)
      edges.left = Math.min(edges.left, from.x)
      edges.top = Math.min(edges.top, from.y)
      edges.right = Math.max(edges.right, to.x)
      edges.bottom = Math.max(edges.bottom, to.y)
    }
    return edges
  })
  await page.close()

  const x = Math.floor(box.left) - margin
  const y = Math.floor(box.top) - margin
  const width = Math.ceil(box.right) + margin - x
  const height = Math.ceil(box.bottom) + margin - y
  const canvas = `x="${x}" y="${y}" width="${width}" height="${height}"`
  return svg
    .replace(/(<svg\b[^>]*?)\sviewBox="[^"]*"/, `$1 viewBox="${x} ${y} ${width} ${height}"`)
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `$1 width="${width}" height="${height}"`)
    .replace(/<rect class="archify-bake-background" [^>]*?fill=/, `<rect class="archify-bake-background" ${canvas} fill=`)
    .replace(/<rect width="100%" height="100%" fill="url\(#grid\)"/, `<rect ${canvas} fill="url(#grid)"`)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', '\'').replaceAll('&amp;', '&')
}
