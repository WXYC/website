# wxyc.org (website)

Station homepage, blog, show archives, and the public playlist/airplay surfaces for WXYC 89.3 FM. Next.js static export, content managed in TinaCMS, served from Cloudflare Workers.

`README.md` is the deep reference — it carries the per-page design notes (playlist ordering rules, Eastern-time handling, separator rows, the parity script, DNS/TLS). This file is the orientation map; when the two disagree, README wins on page behavior and this file wins on workflow.

## Commands

|                             |                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`               | TinaCMS + `next dev` together; admin at `/admin`                                        |
| `npm run build`             | `tinacms build && next build` — static export to `out/`                                 |
| `npm test`                  | vitest (jsdom), `__tests__/`                                                            |
| `npm run lint`              | `next lint`                                                                             |
| `npm run check-format`      | prettier check — **see the formatting note below**                                      |
| `npm run deploy`            | publish to `workers.dev` only (Worker `wxyc-website`, no routes, no production traffic) |
| `npm run deploy:production` | the only command that touches the apex (Worker `wxyc-website-production`)               |

## Deployment

`wxyc.org` is served by an **assets-only Cloudflare Worker** — no script, just the static export in `out/`. GitHub Pages was retired in [#262](https://github.com/WXYC/website/issues/262); nothing in this repo deploys to Pages any more.

- `wrangler.jsonc` holds the layout. Top-level config deploys to `workers.dev` only; `env.production` (`workers_dev: false`, route `wxyc.org/*`) is the sole config that can claim the apex. Wrangler appends the env name, hence `wxyc-website-production`.
- `.github/workflows/nextjs.yml` builds on every push to `main` and deploys in a separate `deploy-cloudflare` job. The job is ref-gated to `main` — `workflow_dispatch` fires from any ref, and without the gate a dispatch from a branch would publish that branch to production.
- The build hands `out/` to the deploy job as a **tar**, because `upload-artifact` rejects the `:`-and-friends punctuation in 36 `public/uploads` filenames. The tar also carries `out/.assetsignore`, which must survive or the deploy fails on the oversized file that ignore exists to exclude.
- `pr-open.yml` runs `npm run deploy:production -- --dry-run` on every PR. It needs no credentials and catches a malformed `wrangler.jsonc` before it can execute on `main`. Note it does **not** validate `public/_redirects` — wrangler's dry-run accepts nonsense there silently. Check a redirect rule by serving the build locally: `npx wrangler dev --port 8788`, then `curl -sI localhost:8788/<path>`.

### Two standing traps

**Never let this Worker claim a `/.well-known/*` wildcard.** Its `wxyc.org/*` catch-all would swallow Cloudflare's own edge-certificate validation, and that failure surfaces months later as a whole-zone outage. A dashboard route `wxyc.org/.well-known/acme-challenge/*` → **None** keeps it clear.

**Never put a splat in `public/_redirects`.** Redirect rules outrank every asset, so a greedy one shadows the entire site.

The sibling `wxyc-links-registry` Worker owns `wxyc.org/shows/*` and the Apple App Site Association path on the same zone. More specific routes win, so it needs no coordination — but do not touch those routes from here.

## TinaCMS

Content lives in `content/` (`page`, `blog`, `archive`, `category` collections; schemas in `tina/collections/`). **TinaCMS Cloud commits editor saves straight to `main` with no PR**, which is why the deploy job runs an asset-size guard before deploying — a main-branch run is the only thing standing between an oversized editor upload and a failed deploy.

Two consequences worth knowing:

- `tina/__generated__/` is gitignored and absent when `npm test` runs, so a test must never import a page that imports the generated client. Keep markup in a component and let the page be Tina wiring only (`pages/50th.jsx` + `components/FiftiethAnniversary.jsx` is the pattern).
- Changing a collection schema requires a regenerated `tina/tina-lock.json`, or the deploy fails.

## Gotchas

- **Static export**: no SSR, no `getStaticPaths` over large tables, no `redirects()`. Data-backed pages (`/playlist`, `/playlists/archive`, `/airplay-search`) fetch client-side after hydration against Backend-Service; override the origin at build time with `NEXT_PUBLIC_WXYC_API_URL`.
- **`pages/[slug].js` only builds the slugs listed in its `getStaticPaths`** — adding a `content/page/*.mdx` file does not by itself create a route.
- **Formatting**: `main` currently has files prettier would reformat, and `check-format` is not in CI. Never run `npm run format` (`prettier --write`) across the repo — it explodes unrelated diffs. Format only files you created.
- Files in `public/` ship as-is and get nothing from the build; a standalone HTML document there must inline everything (`__tests__/standaloneDocuments.test.js` enforces it).
