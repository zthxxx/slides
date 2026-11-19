#!/usr/bin/env bun
/**
 * Builds the whole site into `.site/`: the root index deck at `/`, each `present/<deck>/` at `/present/<deck>/`.
 *
 * 1. Workspace packages under `packages/` that define a `build` script build first, as decks may depend on them.
 * 2. The root deck and every deck build in parallel. A deck whose package.json defines a `build` script runs it in
 *    its own directory with `SLIDES_BASE=/present/<deck>/` in the environment, and leaves the result in `dist/`;
 *    any other deck gets the default `slidev build --base /present/<deck>/`.
 * 3. Each deck's `dist/` is copied to `.site/present/<deck>/`.
 */
import { $, Glob } from 'bun'
import { cp, readFile, rm } from 'node:fs/promises'
import { styleText } from 'node:util'
import {
  from,
  merge,
  lastValueFrom,
  mergeMap,
} from 'rxjs'

const yellow = (text: string) => styleText('yellowBright', text)
const green = (text: string) => styleText('greenBright', text)

$.env({ ...process.env, FORCE_COLOR: '1' })

const slideDirs = [...new Glob('present/*/').scanSync({
  onlyFiles: false,
  followSymlinks: true,
})]

console.log(`\n[slides] ${green('Clear last building files')}`)
await Promise.all(
  ['.site', ...slideDirs.map(dir => `${dir}/dist`)].map(dir => rm(dir, { recursive: true, force: true })),
)

console.log(`\n[build] ${green('Building packages that define a build script')}`)
await $`pnpm --filter "./packages/**" --if-present run build`

console.log(`\n[build] ${green('found slides')} ${yellow(`[\n  ${slideDirs.join(',\n  ')}\n]`)}`)

await lastValueFrom(
  merge(
    $`slidev build --out .site slides.md`,

    from(slideDirs).pipe(
      mergeMap(async (dir) => {
        const slide = dir.replace('present/', '')
        const base = `/${dir}/`

        if (await hasBuildScript(dir)) {
          console.log(`\n[build] ${green(`Building slide ${yellow(slide)} with its own build script`)}`)
          return $`pnpm run build`.cwd(dir).env({ ...process.env, FORCE_COLOR: '1', SLIDES_BASE: base })
        }

        console.log(`\n[build] ${green(`Building slide ${yellow(slide)}`)}`)
        return $`slidev build --base ${base} ${dir}/slides.md`
      }),
    ),
  ),
)

console.log(`\n[build] ${green('Composing slides pages')}`)

for (const dir of slideDirs) {
  await cp(`${dir}/dist`, `.site/${dir}/`, { recursive: true })
}

console.log('\n[build] Build completed')

async function hasBuildScript(dir: string): Promise<boolean> {
  const manifest = await readFile(`${dir}/package.json`, 'utf8').catch(() => undefined)
  return manifest !== undefined && typeof JSON.parse(manifest).scripts?.build === 'string'
}
