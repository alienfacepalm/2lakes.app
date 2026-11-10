# CORS Gate Results

King County buoy data cannot be fetched directly from a **browser** PWA — see the [root README](../../README.md) for how the mobile app + Worker replace the AI Studio / Firestore stack.

Tested 2026-06-23.

## King County (`green2.kingcounty.gov`)

- Response: `HTTP 200`
- **No `Access-Control-Allow-Origin` header**
- Direct browser fetch from the PWA origin **will fail** (CORS blocked)
- **Capacitor native** WebViews are not subject to that browser CORS rule, so Android/iOS may call King County directly as a display-only fallback when the local replica is empty

## NOAA / NWS (`api.weather.gov`)

- Response: `HTTP 200`
- **`Access-Control-Allow-Origin: *`**
- Direct client fetch works with required `User-Agent` header

## Decision (hosting cutover)

**Source of truth:** Cloudflare Worker + D1 (`GET /v1/latest`, `/v1/history`). The UI reads IndexedDB replicas only.

| Surface | King County path |
| --- | --- |
| Local `pnpm dev` | Vite proxy `/api/kc` → King County |
| Capacitor native | Direct `GenerateMapData.aspx` (no CORS) |
| GitHub Pages PWA | **No** King County proxy — Worker + replica only |

The old Cloudflare Pages Function (`functions/api/kc.ts`) is archived under [`.archive/2026-11-10-cloudflare-pages-kc-proxy/`](../../.archive/2026-11-10-cloudflare-pages-kc-proxy/). NWS calls remain direct from the client.
