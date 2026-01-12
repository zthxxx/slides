> Note: `CLAUDE.md` is a symlink to `AGENTS.md` — edit `AGENTS.md`.

## Commands

Package manager is **pnpm** (v9.6.0 in CI), Node **>=20** (CI uses 22.x).

- `pnpm dev` — serve the root index deck (`slides.md`) with HMR.
- `pnpm dev <slide-name>` — serve a single deck under `present/<slide-name>/slides.md`. The positional arg is parsed by `zx` in `scripts/dev.mjs` and `cd`s into that directory before invoking `slidev`.
- `pnpm build` — build the entire site into `.site/` (see Architecture). Runs all decks in parallel via an `rxjs` pipeline.
- `pnpm clean` — remove `index.html`, `.site/`, and every `present/*/index.html` and `present/*/dist` produced by Slidev.

A single deck can also be developed in isolation by `cd present/<slide-name> && pnpm dev` (each present directory that needs its own deps has a local `package.json`, e.g. `pipeline-in-rxjs`).

## Architecture

This repo ships a **multi-deck Slidev site** deployed to https://slides.zthxxx.me (GitHub Pages, CNAME in `public/CNAME`).

### Layout

- `slides.md` — root landing deck; its links point to each sub-deck under `/present/<slide>/`. Uses `routerMode: hash` so the static GH Pages host can resolve in-deck navigation without server rewrites.
- `present/<slide-name>/slides.md` — one deck per directory. Local `public/`, `components/`, and (optionally) `package.json` live alongside the markdown.
- `packages/slidev-theme-eloc/` — the shared Slidev theme (`slidev-theme-eloc`), referenced as `workspace:*` from the root and from any deck that overrides its dependency set. Owns layouts, styles, and theme-level Slidev defaults (e.g. `canvasWidth: 1580`, `routerMode: history`).
- `public/` — site-wide static assets copied to the root of `.site/` by Slidev.

### pnpm workspace

`pnpm-workspace.yaml` includes `packages/**` plus `present/pipeline-in-rxjs` (the only present-directory currently needing its own dependency graph, because it pulls in `rxjs@8.0.0-alpha.14`). When adding a new deck that needs deck-specific deps, add its directory to `pnpm-workspace.yaml` and create a local `package.json` mirroring `present/pipeline-in-rxjs/package.json`.

### Build pipeline (`scripts/build.mjs`)

1. Glob `present/*` directories.
2. In parallel (via `rxjs` `merge` + `mergeMap`):
   - Build the root deck: `slidev build --out .site slides.md`.
   - Build each sub-deck: `slidev build --base /present/<slide>/ present/<slide>/slides.md` (output goes to `present/<slide>/dist`).
3. Copy each `present/<slide>/dist` into `.site/present/<slide>/`.

The `--base` flag is critical — it rewrites asset URLs so each sub-deck loads correctly when served under its sub-path on GitHub Pages.

### CI / Deploy (`.github/workflows/build.yml`)

Every push and PR runs `pnpm build`. On `master`, `.site/` is published to the `gh-pages` branch via `peaceiris/actions-gh-pages@v4`. Playwright browser downloads are skipped in CI (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`); any deck-time export step requiring Chromium must run locally.

## Adding a new deck

1. Create `present/<slide-name>/slides.md` (frontmatter typically `theme: eloc` and `routerMode: hash` if linked from the root index).
2. If it needs deck-specific deps, add `present/<slide-name>` to `pnpm-workspace.yaml` and a local `package.json` with `slidev-theme-eloc: "workspace:*"`.
3. Add a link entry in the root `slides.md` index list.
4. `pnpm dev <slide-name>` to preview, `pnpm build` to verify the production output.
