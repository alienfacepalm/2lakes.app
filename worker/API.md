# 2lakes public API (v1)

D1 is the source of truth for all 2lakes buoy readings. This API is its public, read-only
front door. The 2lakes PWA and other consumers (for example the Tabocalypse extension) read
it. Reads need no key and no account, and every response sends `Access-Control-Allow-Origin: *`.

Base URL: `https://2lakes-api.brandon-pliska-86a.workers.dev` (the Worker's `*.workers.dev`
address; it does not depend on the `2lakes.app` domain). Live since 2026-11-09. The `workers.dev`
host sends no `cf-cache-status` header, so responses are not edge-cached; clients should cache.

Routes are versioned under `/v1`. After `/v1` ships, changes are additive only: new fields and
new routes, never renamed or removed fields.

## Reading

Every reading has:

| Field | Type | Notes |
| --- | --- | --- |
| `seq` | integer | Rising ingest number. Changes whenever the row is inserted or updated. |
| `buoyId` | string | `Lake Washington`, `Lake Sammamish`. |
| `timestamp` | string | Canonical UTC reading time, ISO 8601 with milliseconds. |
| `recordedAt` | string | When D1 first stored the reading (UTC ISO). |
| `tempC`, `tempF` | number or null | Water temperature. |
| `airTempC`, `airTempF` | number or null | |
| `windSpeed` | number or null | |
| `precipitation` | number or null | |
| `humidity`, `dewpoint` | number or null | |
| `precipitationProbability` | number or null | 0 to 100, from NWS, first value seen. Null if NWS was unavailable. |
| `lat`, `lon` | number or null | |
| `updatedAt` | string | Last time D1 changed the row (UTC ISO). |

`timestamp` is already converted to UTC. King County's own clock is a fixed UTC-8 with no
daylight saving, and the Worker adds 8 hours (see `src/time.ts`). Note that King County's
water temperature can be hours older than the air and wind values in the same reading.

## Routes

### `GET /v1/latest`
The newest reading for each buoy. `{ "rows": [Reading, ...] }`

### `GET /v1/history?buoy=&afterSeq=&limit=`
Readings with `seq > afterSeq`, oldest first.

- `afterSeq` default `0`.
- `limit` default `500`, maximum `1000`.
- `buoy` optional, exact `buoyId`.

Response: `{ "rows": [Reading, ...], "nextSeq": 123, "hasMore": true }`.
To sync, keep calling with `afterSeq = nextSeq` until `hasMore` is `false`. A row that is
corrected later gets a new `seq`, so a client that upserts by `(buoyId, timestamp)` always
converges on the server's copy.

### `GET /v1/status`
`{ serverTime, maxSeq, rowCount, sources: [...], buoys: [...] }`

`sources` has one entry per data source (`kingcounty`, `nws`, `ingest`) with
`lastAttemptAt`, `lastSuccessAt`, `lastError`, `lastTimestamp` and `lastChanged`. For
`kingcounty` and `ingest`, `lastChanged` is the number of rows inserted or updated. For `nws`
it is the number of successful lookups. Use `lastSuccessAt` to show "last updated".

### `POST /ingest`
Not public. Requires `Authorization: Bearer <INGEST_TOKEN>`. Body:
`{ "feed": "<raw King County GenerateMapData text>" }`. Used by the GitHub Action fallback
collector if King County blocks Cloudflare's IP addresses.

## Errors
JSON `{ "error": "..." }` with status 400, 401, 404, 413, 422, 500 or 503.

## Caching
Responses carry `Cache-Control` headers for browsers (`/v1/latest` 60 seconds, `/v1/history`
and `/v1/status` 30 seconds). Do not assume any Cloudflare edge caching on `*.workers.dev`
(not yet verified), so budget for repeated requests reaching the Worker and D1.
