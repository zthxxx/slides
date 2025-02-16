import { $, cd, fs, glob, within, echo, chalk } from 'zx'
import {
  tap,
  from,
  merge,
  lastValueFrom,
  mergeMap,
} from 'rxjs'

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

await lastValueFrom(
  merge(
    $`slidev build --out .site slides.md`,

    from(slideDirs).pipe(
      mergeMap(dir => {
        const slide = dir.replace('present/', '')
        echo``
        echo`[build] ${green(`Building slide ${yellow(slide)}`)}`

        return $`slidev build --base /${dir}/ ${dir}/slides.md`
      }),
    )
  ).pipe(
    tap(processOutput => console.log(processOutput.toString())),
  )
)


echo``
echo`[build] ${green(`Composing slides pages`)}`

for (let dir of slideDirs) {
  await fs.copy(`${dir}/dist`, `.site/${dir}/`)
}

echo``
echo`[build] Build completed`
