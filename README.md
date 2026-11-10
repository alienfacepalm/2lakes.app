# 2lakes.app

Live buoy monitoring for Lake Washington and Lake Sammamish — temperature, wind, and conditions from King County lake buoys plus NOAA/NWS context.

> **Migrated from Google AI Studio.** This repository (`alienfacepalm/2lakes.app`) is the new home of the project, which began as a [Google AI Studio](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16) hosted applet. Because AI Studio hosting ended, the code lives here with a **fresh git history** (earlier history is in [`seattle-two-lakes-monitor`](https://github.com/alienfacepalm/seattle-two-lakes-monitor)). Hosting is **$0**: GitHub Pages for the static PWA, Cloudflare Worker + D1 as the buoy **source of truth**, and browser IndexedDB **replicas**.

The AI Studio / Express / Firestore applet formerly at the repo root is archived under [`.archive/2026-11-10-ai-studio-root/`](.archive/2026-11-10-ai-studio-root/).

## Packages

| Path | Role | Status |
|------|------|--------|
| **[`mobile/`](mobile/)** | Production PWA (UI reads IndexedDB replicas only) | **Active** |
| **[`worker/`](worker/)** | Cloudflare Worker + D1 API (`/v1/latest`, `/v1/history`, `/v1/status`) | **Active** — [worker/API.md](worker/API.md) |
| [`.archive/`](.archive/) | Retired AI Studio root + Cloudflare Pages KC proxy | Read-only history |

## Prerequisites

1. **Node.js 22+** (`engine-strict` in `.npmrc`)
2. **pnpm 11.5.0** via Corepack:

   ```bash
   corepack enable
   corepack prepare pnpm@11.5.0 --activate
   ```

3. **Git** — clone this repository.

No Firebase or Cloudflare account is required to develop the PWA locally. Worker local dev uses `wrangler` + SQLite (see `worker/`).

## Quick start — mobile PWA

```bash
cd mobile
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5173**

- Vite proxies `/api/kc` to King County for local display fallback only.
- Production web syncs from the Worker into IndexedDB; the UI does not write buoy readings to D1.
- Capacitor native may call King County directly (display-only) when the replica is empty.

### Production build

```bash
cd mobile
pnpm build      # → mobile/dist/
pnpm test:pr    # unit + scripts + build + lint
```

Deploy is **GitHub Pages** via [`.github/workflows/deploy-mobile.yml`](.github/workflows/deploy-mobile.yml) on push to `main` (not Cloudflare Pages).

## Worker API

Public base: `https://2lakes-api.brandon-pliska-86a.workers.dev`

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /v1/latest` | none | Latest reading per lake |
| `GET /v1/history?afterSeq=` | none | Incremental history for replicas |
| `GET /v1/status` | none | Health / sync cursor |
| `POST /ingest` | Bearer `INGEST_TOKEN` | Collector only |

Details: [worker/API.md](worker/API.md). D1 is the **source of truth**; browsers keep **replicas** (photocopies). Clients never write buoy readings to D1.

## Hosting

| Piece | Where | Cost |
|-------|-------|------|
| Static PWA | GitHub Pages (`2lakes.app` custom domain) | $0 |
| Buoy API + cron | Cloudflare Worker `2lakes-api` + D1 `2lakes-buoys` | Free tier |
| Monthly D1 SQL dump | GitHub Release (Actions) | $0 |
| On-device history | IndexedDB replica | $0 |

DNS for `2lakes.app` is at Hover (apex → GitHub Pages). Keep the existing `google-site-verification` TXT. `.app` is HSTS-preloaded — HTTPS only.

## Docs

- [mobile/README.md](mobile/README.md) — app commands, Capacitor, tests
- [mobile/docs/cors.md](mobile/docs/cors.md) — why the web PWA cannot call King County directly
- [mobile/docs/zero-cost-policy.md](mobile/docs/zero-cost-policy.md) — $0 / no-ads policy
- [worker/API.md](worker/API.md) — public API contract
- [`.archive/README.md`](.archive/README.md) — retired code index
