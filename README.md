# 2lakes.app

Live buoy monitoring for Lake Washington and Lake Sammamish — temperature, wind, and conditions from King County lake buoys plus NOAA/NWS context.

> **Migrated from Google AI Studio.** This repository (`alienfacepalm/2lakes.app`) is the new home of the project, which began as a [Google AI Studio](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16) hosted applet. Because AI Studio hosting is going away, the code was moved here with a **fresh git history** (the earlier history lives in the archived [`seattle-two-lakes-monitor`](https://github.com/alienfacepalm/seattle-two-lakes-monitor) repo). The target is **$0 operator hosting**: GitHub Pages for the static app, plus a free Cloudflare Worker and D1 for shared buoy data, with the browser staying local-first.

> **Use `mobile/` — not the repo root.**  
> The **real app** is the PWA in **[`mobile/`](mobile/)**. Clone the repo, `cd mobile`, then `pnpm install` and `pnpm dev`.  
> Everything at the **top level** (`src/`, `server.ts`, `firebase-applet-config.json`, …) is the **original [Google AI Studio](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16) export** — the same UI ported out of the hosted applet. That stack (Firebase Firestore, Express, Cloud Run) is **~$50/month** today and **will be shut down**. Do not build new features or deploy from the root; use **`mobile/`** only.

## Moving off Google AI Studio

This project started as a **Google AI Studio** hosted applet. We exported it to this repo, then rebuilt the production experience under **`mobile/`** as a zero-backend PWA.

| | AI Studio + repo root (shutting down) | **`mobile/`** (use this) |
|---|--------------------------------------|--------------------------|
| **Directory** | `/` — `src/`, `server.ts`, Firebase config | **`mobile/`** — `mobile/src/`, PWA manifest, service worker |
| **Where it runs** | [ai.studio/apps/93efb958-…](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16), Cloud Run (legacy) | Your machine, [Cloudflare Pages](https://pages.cloudflare.com/), app stores |
| **Why retire root** | Firestore + Cloud Run **~$50/mo** (current AI Studio hosting) | Free-tier Pages + IndexedDB on device |
| **History** | Firestore (`ai-studio-*` database in `firebase-applet-config.json`) | **IndexedDB** on the device (30-day retention) |
| **Backend** | Firebase + Express/Cloud Run | **No server** — Cloudflare edge proxy for King County CORS only |
| **API keys** | AI Studio boilerplate mentioned Gemini; buoy data does not use Gemini | **No keys required** |
| **Package manager** | npm (AI Studio export default) | **pnpm@11.5.0** only |

**Goal:** ship the lake-monitoring experience as a **self-hosted Progressive Web App (PWA)** — installable, **no ads**, **$0** operator hosting on Cloudflare Pages, history on-device.

**Where to work:** all features, fixes, and deploys go in **`mobile/`**. The repo root is the AI Studio port kept temporarily for reference; **do not depend on it long term**.

## Packages

| Path | Role | Status |
|------|------|--------|
| **[`mobile/`](mobile/)** | **Production PWA** — the app users install and developers ship | **Active** — [mobile/README.md](mobile/README.md) |
| **`/`** (repo root) | AI Studio export: Express + Firestore + legacy React SPA | **Deprecated** — shut down when migration is complete (hosted cost) |

Deep dive: [mobile/README.md](mobile/README.md) · CORS decision: [mobile/docs/cors.md](mobile/docs/cors.md) · Store wrappers: [mobile/store/packaging.md](mobile/store/packaging.md)

---

## Prerequisites

Install before building or running either package:

1. **Node.js 22+** — `node -v` should report `v22` or higher (`engine-strict=true` in `.npmrc`).
2. **pnpm 11.5.0** — enable via Corepack (bundled with Node):

   ```bash
   corepack enable
   corepack prepare pnpm@11.5.0 --activate
   pnpm -v   # should print 11.5.0
   ```

3. **Git** — clone this repository.

No API keys, Firebase setup, or Cloudflare account are required for **local development** of the mobile PWA.

---

## Quick start — mobile PWA (**this is the app**)

**You must be in `mobile/`** — not the repo root. Root and `mobile/` are **separate pnpm projects** (each has its own `pnpm-lock.yaml`).

```bash
cd mobile    # ← required; the app is not at repo root
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5173**

- Vite serves the React app on a **fixed port** (5173). If the port is busy, `pnpm dev` kills the stale listener first.
- `/api/kc` is proxied to King County during dev ([`mobile/vite.config.ts`](mobile/vite.config.ts)).
- NOAA/NWS calls go direct from the browser (CORS allowed).
- Buoy history is stored in **IndexedDB** on your device — not Firestore.

### Production build and local preview

```bash
cd mobile
pnpm build      # typecheck + bundle → mobile/dist/
pnpm preview    # serve dist/ at http://127.0.0.1:5173
```

Icons are regenerated automatically before build (`prebuild` → `scripts/generate-icons.mjs`).

### Tests (mobile)

```bash
cd mobile
pnpm test:pr    # unit tests + script tests + build + lint (CI gate)
pnpm test:e2e   # Playwright route tests (optional; installs Chromium)
```

### Install as a PWA (web and phone)

After `pnpm dev` or deploying to HTTPS:

| Platform | How to install |
|----------|----------------|
| **Desktop (Chrome, Edge)** | Address bar → **Install** / **Install app** |
| **Android (Chrome)** | Menu → **Add to Home screen** or **Install app** |
| **iOS (Safari)** | Share → **Add to Home Screen** |

The app uses [`mobile/public/manifest.json`](mobile/public/manifest.json) (`display: standalone`) and [`mobile/public/sw.js`](mobile/public/sw.js) for offline shell caching. Last buoy readings remain visible offline via IndexedDB + service worker caches.

For **Google Play / App Store** native packages, deploy to HTTPS first, then follow [mobile/store/packaging.md](mobile/store/packaging.md) (PWABuilder / TWA / iOS wrapper).

### Deploy to Cloudflare Pages

```bash
cd mobile
pnpm deploy     # build + wrangler pages deploy
```

Prerequisites for deploy:

- Cloudflare account with Pages enabled
- `wrangler login` (one-time CLI auth), **or** CI secrets below

GitHub Actions (push to `main` / `master` when `mobile/**` changes):

- [`.github/workflows/mobile-ci.yml`](.github/workflows/mobile-ci.yml) — `pnpm test:pr` + Playwright on PRs
- [`.github/workflows/deploy-mobile.yml`](.github/workflows/deploy-mobile.yml) — test then deploy

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Project name: `2lakes-mobile` ([`mobile/wrangler.toml`](mobile/wrangler.toml)).

### Mobile environment variables

| Variable | When needed |
|----------|-------------|
| `VITE_KC_PROXY_URL` | Override King County proxy URL (default: `/api/kc`) |

No `.env` file is required for normal local dev or deploy.

---

## Quick start — root app (AI Studio export, **deprecated**)

> **Do not use for new work.** The root package is the ported AI Studio app (Firebase + Express). Keeping it hosted on Cloud Run / Firestore **costs too much**; it will be **shut down**. Use [`mobile/`](mobile/) instead.

Only open this if you need the old **developer REST API** or **Firestore-backed history** while the migration finishes. Otherwise use [`mobile/`](mobile/).

```bash
# From repo root — NOT where the production PWA lives
pnpm install
pnpm dev
```

Open **http://localhost:3000** — Express serves Vite dev middleware and API routes ([`server.ts`](server.ts)).

### Root environment

Copy [`.env.example`](.env.example) → `.env.local` if you need a static developer API key:

```bash
EXTERNAL_API_KEY=your-key-here
```

Firebase/Firestore config is read from [`firebase-applet-config.json`](firebase-applet-config.json) (the AI Studio project export). **No Gemini or other AI keys** are used by this app.

### Root build

```bash
pnpm build      # production bundle → dist/
pnpm lint       # tsc --noEmit
```

---

## Commands reference

### Mobile (`cd mobile`)

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server at **127.0.0.1:5173** (strict port, auto-reclaim) |
| `pnpm build` | Typecheck + production bundle → `dist/` |
| `pnpm preview` | Serve production build locally |
| `pnpm test` / `pnpm test:pr` | Vitest; `test:pr` is the CI gate |
| `pnpm test:e2e` | Playwright route tests |
| `pnpm deploy` | Build + Cloudflare Pages deploy |
| `pnpm dev:port:free` | Kill processes on port 5173 |

### Root (`/`)

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server on port **3000** (auto-reclaims stale listeners) |
| `pnpm build` | Production bundle → `dist/` |
| `pnpm lint` | `tsc --noEmit` |
| `pnpm dev:port:free` | Kill processes on port 3000 |

---

## Architecture

```
/
├── server.ts                      AI Studio export — Express + Vite (deprecated)
├── src/                           AI Studio export — legacy React SPA (deprecated)
├── firebase-applet-config.json    AI Studio Firebase project (shutting down)
├── firebase-blueprint.json        Firestore schema (deprecated)
└── mobile/                        ★ THE APP — production PWA (work here)
    ├── src/app.tsx                App shell + routes
    ├── src/lib/buoy-api.ts        King County + NWS client
    ├── src/lib/history-store.ts   IndexedDB snapshots (30-day retention)
    ├── functions/api/kc.ts        Cloudflare edge CORS proxy
    ├── public/manifest.json       PWA manifest
    ├── public/sw.js               Service worker (offline shell)
    └── store/packaging.md         Play Store / App Store steps
```

**Data flow (mobile):**

```
Browser PWA
  ├─ /api/kc ──► Cloudflare Pages function (prod) or Vite proxy (dev) ──► King County
  ├─ api.weather.gov ──► direct (CORS OK)
  └─ IndexedDB ──► local 30-day buoy history
```

---

## Conventions

- **pnpm@11.5.0** only — never npm or yarn ([`.cursor/rules/pnpm.mdc`](.cursor/rules/pnpm.mdc))
- Node **>= 22**
- **kebab-case** file paths under `src/` and `mobile/src/` ([`filenames.mdc`](.cursor/rules/filenames.mdc))
- Mobile CI gate before merge: `cd mobile && pnpm test:pr`

---

## Documentation index

| Doc | Contents |
|-----|----------|
| [mobile/README.md](mobile/README.md) | Mobile-specific commands, deploy, and root comparison |
| [mobile/docs/cors.md](mobile/docs/cors.md) | Why King County needs an edge proxy |
| [mobile/store/packaging.md](mobile/store/packaging.md) | PWABuilder, Android TWA, iOS wrapper |
| [mobile/.cursor/README.md](mobile/.cursor/README.md) | Cursor agent rules (contributors using Cursor) |
