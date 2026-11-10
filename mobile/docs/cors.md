# CORS Gate Results

King County buoy data cannot be fetched directly from a **browser** PWA — see [root README](../../README.md#moving-off-google-ai-studio) for how the mobile app replaces the AI Studio / Firestore stack.

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

The old Cloudflare Pages Function at [`functions/api/kc.ts`](../functions/api/kc.ts) retires with the Pages host. NWS calls remain direct from the client.
