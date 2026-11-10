# Archived 2026-11-10 — Cloudflare Pages King County proxy

> Archived 2026-11-10. Superseded by GitHub Pages static hosting + Worker/D1 replicas. Capacitor native may still call King County directly (display-only).

## What it was

Cloudflare Pages project leftovers under `mobile/`:

- `mobile/functions/api/kc.ts` — edge CORS relay to King County `GenerateMapData.aspx`
- `mobile/public/_redirects` — SPA rewrite for Pages
- `mobile/wrangler.toml` — Pages project config (`pages_build_output_dir`)

## Why it was retired

Hosting moved from Cloudflare Pages to **GitHub Pages** (Actions deploy). The public PWA no longer proxies King County (no CORS on KC from the browser). Clients sync from the Worker API into IndexedDB; Capacitor native can call KC directly when the replica is empty.

## What replaced it

| Old | New |
|-----|-----|
| Pages Function `/api/kc` | Worker `GET /v1/*` + IDB replicas (web); direct KC (Capacitor only) |
| Pages `_redirects` | `404.html` copy of `index.html` in the Pages artifact |
| `wrangler pages deploy` | `.github/workflows/deploy-mobile.yml` |

## Last live commit

`ffa00af` (merge of GitHub Pages hosting PR #3 onto `main`).

## How to restore

```bash
git mv .archive/2026-11-10-cloudflare-pages-kc-proxy/mobile/functions mobile/functions
git mv .archive/2026-11-10-cloudflare-pages-kc-proxy/mobile/public/_redirects mobile/public/_redirects
git mv .archive/2026-11-10-cloudflare-pages-kc-proxy/mobile/wrangler.toml mobile/wrangler.toml
```

Only useful if re-hosting on Cloudflare Pages. Prefer keeping GitHub Pages + Worker.
