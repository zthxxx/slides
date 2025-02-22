import { $, cd, argv } from 'zx'

$.env.FORCE_COLOR = '1'

const [slide] = argv._

if (slide) {
  await cd(`present/${slide}`)
}

await $`slidev --log info --open slides.md`
