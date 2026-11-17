#!/usr/bin/env bun
import { $ } from 'bun'
import { parseArgs } from 'node:util'

$.env({ ...process.env, FORCE_COLOR: '1' })

const { positionals: [slide] } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
})

if (slide) {
  $.cwd(`present/${slide}`)
}

await $`slidev --log info --open slides.md`
