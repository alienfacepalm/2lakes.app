# CORS Gate Results

King County buoy data cannot be fetched directly from a browser PWA — see [root README](../../README.md#moving-off-google-ai-studio) for how the mobile app replaces the AI Studio / Firestore stack.

Tested 2026-06-23.

## King County (`green2.kingcounty.gov`)

- Response: `HTTP 200`
- **No `Access-Control-Allow-Origin` header**
- Direct browser fetch from the PWA origin **will fail** (CORS blocked)

## NOAA / NWS (`api.weather.gov`)

- Response: `HTTP 200`
- **`Access-Control-Allow-Origin: *`**
- Direct client fetch works with required `User-Agent` header

## Decision

**Option A approved:** Cloudflare Pages edge proxy at `/api/kc`

- Implemented in [`functions/api/kc.ts`](../functions/api/kc.ts)
- Vite dev proxy in [`vite.config.ts`](../vite.config.ts) for local development
- Client calls `/api/kc` via [`src/lib/buoy-api.ts`](../src/lib/buoy-api.ts)
- NWS calls remain direct from the client (no proxy needed)

No Express, Firestore, or Cloud Run required.
