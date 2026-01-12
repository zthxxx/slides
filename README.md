# SLIDES BY ZTHXXX

https://slides.zthxxx.me

> Powered by [Slidev](https://sli.dev) ❤️ [slidev-theme-eloc](https://www.npmjs.com/package/slidev-theme-eloc)

## Local Development

Requires **Node >= 20** and **pnpm** (CI pins `pnpm@9.6.0`).

```bash
pnpm install           # install workspace deps
pnpm dev               # serve the root index deck (slides.md)
pnpm dev <slide-name>  # serve a single deck, e.g. `pnpm dev pipeline-in-rxjs`
pnpm build             # build the full site into ./.site
pnpm clean             # remove built artifacts
```

`<slide-name>` is any directory under `present/`. Each deck is a standalone Slidev project; the root `slides.md` is the landing index that links into them.
