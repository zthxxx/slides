import { $, cd, fs, glob, within, echo, chalk } from 'zx'

const {
  yellowBright: yellow,
  greenBright: green,
} = chalk

$.env.FORCE_COLOR = '1'

const slideDirs = await glob('present/*', {
  onlyDirectories: true,
})


echo``
echo`[slides] ${green(`Clear last building files`)}`
await $`rm -rf .site present/*/dist`


echo``
echo`[build] ${green(`found slides`)} ${yellow(`[
  ${slideDirs.join(',\n  ')}
]`)}`


echo``
echo`[build] ${green(`Building index`)}`
await $`slidev build --out .site slides.md`


for (let dir of slideDirs) {
  const slide = dir.replace('present/', '')

  echo``
  echo`[build] ${green(`Building slide ${yellow(slide)}`)}`

  await within(async () => {
    // https://sli.dev/guide/hosting#base
    await $`slidev build --base /${dir}/ ${dir}/slides.md`
  })
}


echo``
echo`[build] ${green(`Composing slides pages`)}`

for (let dir of slideDirs) {
  await fs.copy(`${dir}/dist`, `.site/${dir}/`)
}

echo``
echo`[build] Build completed`
