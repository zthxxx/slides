This repo ships a **multi-deck Slidev site** deployed to https://slides.zthxxx.me. The same build goes to two hosts, and DNS decides which one serves the domain:
- Cloudflare Pages project `slides`, a Direct Upload from CI; response headers and caching rules in `public/_headers`.
- GitHub Pages, the `gh-pages` branch; CNAME in `public/CNAME`. It cannot send headers, so `terminal-glance` adds COOP/COEP with its own service worker.


### Layout

- `slides.md` — root landing deck; its links point to each sub-deck under `/present/<slide>/`.
  Uses `routerMode: hash` so the static host can resolve in-deck navigation without server rewrites (`public/_redirects` stays empty).
- `packages/slidev-theme-eloc/` — the shared Slidev theme (`slidev-theme-eloc`), overrides its dependency set. Owns layouts, styles, and theme-level Slidev defaults.
- `public/` — site-wide static assets copied to the root of `.site/` by Slidev, including the hosts' `_headers`, `_redirects` (Cloudflare Pages), `CNAME` and `.nojekyll` (GitHub Pages).
- `present/<slide-name>/` — one deck per directory.
  - `slides.md`: Slidev entry file for this deck
  - `pages/*.md`: optional, slide content split from `slides.md` for better organization;
    Each file may contain one or more slides and is included by the main `slides.md` file.
  - `artboard/<page-name>/*.md`: optional, used for batch-discussing different visual styles for the same page with users;
    Use this only when the user explicitly requests a batch style demonstration.
  - `public/`: optional, static assets like `images/` `sounds/` `video/`;
    - Organize assets by category instead of just laying them all out flat.
    - Binary assets like images or sounds / video should be stored in Git LFS instead of pure Git.
  - `components/`: optional, Vue components
  - `package.json`: optional, for specifying dependencies or scripts
  - `.logs`, `.playwright-cli`: optional, log files by Coding Agent; not managed in git


## Commands

Package manager is pnpm with `pnpm-workspace.yaml`, Node.js >=22, and Bun runs the scripts in `scripts/`.

- `pnpm dev` — serve the root index deck (`slides.md`) with HMR.
- `pnpm dev <slide-name>` — serve a single deck under `present/<slide-name>/slides.md`.
- `pnpm build` — build the entire site into `.site/`. Runs all decks in parallel.
- `pnpm test` — run the `test` script of every workspace package that defines one.
- `pnpm clean` — remove build artifacts.

A single deck can also be developed in isolation by `cd present/<slide-name> && pnpm dev` (needs its own deps has a local `package.json` for scripts and dependencies).


### Package scripts that the root commands pick up

The root commands do not name any deck or package; a package opts in through the scripts in its own `package.json`.

- `test`: `pnpm test` runs it; packages without one are skipped.
- `build` in a package under `packages/`: `pnpm build` runs it before any deck builds.
- `build` in a deck (`present/<slide-name>/`): `pnpm build` runs it in the deck's directory instead of the default `slidev build --base /present/<slide-name>/ slides.md`.
  It gets the base path in `SLIDES_BASE` (`/present/<slide-name>/`) and must leave the built deck in `dist/`, which `scripts/build.ts` copies to `.site/present/<slide-name>/`.
  Use it when a deck needs a step before `slidev build`, e.g. [`terminal-glance`](./present/terminal-glance/package.json) builds its guest disk image first.


## CI / Deploy

Every push and PR runs `pnpm test` and `pnpm build`. On `master`, `.site/` is uploaded to Cloudflare Pages (`wrangler pages deploy`, secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`) and published to `gh-pages`; each deploy runs even when the other fails. see `.github/workflows/build.yml`

`public/_headers` gives `/present/terminal-glance/*` the COOP/COEP headers its cross-origin isolation needs, and long-lived caching to files named by their content.
Preview a build with these rules locally: `npx wrangler pages dev .site`.


## Adding a new deck

1. Create `present/<slide-name>/` with
   - `slides.md`, with frontmatter typically containing `theme: eloc` and `routerMode: hash`; you can refer to other `slides.md` files
   - `package.json` if it needs specific dependencies, like [`pipeline-in-rxjs`](./present/pipeline-in-rxjs/package.json)

2. Based on the user's requirements / intent / discussion, use the `slidev` skill to create the slides.

3. Run `pnpm dev <slide-name>` to serve the preview; use browser to open the URL and continuously view / verify / improve it.

3.1 If users want to discuss or review batch modifications of different style versions for a single page during the review process, they should use the "artboard design" mode:
  Create different slidev files under the `artboard/` and use the `slidev` CLI to load them so users can view them all simultaneously in a single browser page.

4. Run `pnpm build` to verify the production output. After verification is complete, ask the user to review it.
  - If the user has any feedback, back to step 2.

5. After the user has reviewed it, add a link entry to the root `slides.md` index list.
