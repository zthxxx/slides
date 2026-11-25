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
import { $, Glob } from 'bun'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
  const svg = pruneFontFaces(await readFile(exported, 'utf8'))
  await writeFile(path.join(outDir, `${name}.svg`), svg)
  console.log(`✓ ${name} → public/images/diagrams/${name}.svg (${Math.round(svg.length / 1024)} KiB)`)
}

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

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', '\'').replaceAll('&amp;', '&')
}
