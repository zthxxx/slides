#!/usr/bin/env bun
import { $, Glob } from 'bun'
import { cp, rm } from 'node:fs/promises'
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

console.log(`\n[build] ${green('found slides')} ${yellow(`[\n  ${slideDirs.join(',\n  ')}\n]`)}`)

await lastValueFrom(
  merge(
    $`slidev build --out .site slides.md`,

    from(slideDirs).pipe(
      mergeMap(dir => {
        const slide = dir.replace('present/', '')
        console.log(`\n[build] ${green(`Building slide ${yellow(slide)}`)}`)

        return $`slidev build --base /${dir}/ ${dir}/slides.md`
      }),
    ),
  ),
)

console.log(`\n[build] ${green('Composing slides pages')}`)

for (const dir of slideDirs) {
  await cp(`${dir}/dist`, `.site/${dir}/`, { recursive: true })
}

console.log('\n[build] Build completed')
