# Local-first architecture review (mobile/)

> Archived 2026-11-10 as a point-in-time audit. Superseded by current [SKILL.md](SKILL.md), [cors.md](../../../docs/cors.md), and root [README.md](../../../../README.md) (GitHub Pages + Worker/D1 replicas; AI Studio root archived).

Audit date: 2026-06-23. Scope: `mobile/` production PWA vs legacy repo root (now under `.archive/`).

## Verdict

**Compliant with local-first goals.** The mobile app removes Firestore, Cloud Run, Express app logic, and the developer API. User history and preferences are on-device. The only project-hosted “backend” is a **stateless CORS relay** for King County — not an application server.

## What was removed (vs AI Studio / repo root)

| Legacy (root) | Mobile replacement |
|---------------|-------------------|
| Firestore `buoy_snapshots` | IndexedDB via `history-store.ts` |
| Firestore `api_keys` + developer API | Removed |
| Express `server.ts` routes | Client `buoy-api.ts` + `/api/kc` relay |
| Cloud Run hosting cost | Cloudflare Pages static + one function |
| Anonymous Firebase auth | Not needed |
| Background server sync | Opt-in `background-history.ts` on device |

## Current data flow

```
User device (PWA or Capacitor WebView)
│
├─ Live view
│   ├─ GET /api/kc ──────────► King County (via Pages function or Vite proxy)
│   └─ GET api.weather.gov ──► NWS (direct, CORS *)
│
├─ History (opt-in: Settings → Background collection)
│   ├─ Foreground: saveSnapshot on refresh (selected buoy + NWS enrichment)
│   └─ Background: ≤1×/hour, 1 KC fetch, all buoys → IndexedDB
│
└─ Preferences: localStorage (theme, buoy, history toggle)
```

## Storage audit

| Mechanism | Purpose | Cloud? |
|-----------|---------|--------|
| IndexedDB `2lakes-history` | 30-day buoy snapshots | No |
| `localStorage` | UI prefs, background history schedule | No |
| `sessionStorage` | Per-buoy live cache for offline read | No |
| Service worker caches | App shell, `/api/kc` stale-while-revalidate | No (device) |

## Network audit

| Call | From | Backend logic? | Acceptable? |
|------|------|----------------|-------------|
| `/api/kc` | `buoy-api.ts`, `background-history.ts` | Pass-through only | Yes — CORS workaround ([cors.md](../../../docs/cors.md)) |
| NWS APIs | `buoy-api.ts` | None | Yes — public API |
| Yandex maps | `static-map.tsx` | None | Yes — static images |
| NWS radar | `app.tsx` iframe | None | Yes — embed |

## Compliance checklist

| Check | Status | Notes |
|-------|--------|-------|
| No `firebase` / `firestore` in `mobile/src` | Pass | |
| No Express / `server.ts` in `mobile/` | Pass | |
| History not sent to cloud | Pass | IndexedDB only |
| Background collection opt-in | Pass | `background-history.ts` + Settings |
| Hourly rate limit on background KC | Pass | `BACKGROUND_HISTORY_INTERVAL_MS` |
| No API keys in client | Pass | |
| Service worker does not replace IndexedDB for history | Pass | SW caches shell + KC; history in IDB |
| Deploy is static + edge relay | Pass | `wrangler pages deploy` |

## Gray areas (acceptable if unchanged)

| Item | Risk | Guidance |
|------|------|----------|
| `/api/kc` on Cloudflare | Could be abused for bandwidth | Keep stateless; optional WAF rate limits |
| Live refresh calls NWS + KC | More than 1 hit per user action | User-initiated; OK |
| App open required for hourly background | No true OS background sync | Document in Settings; avoid fake “server sync” |

## Do not reintroduce

- Free-tier Firestore writes from mobile client
- `SettingsMenu` developer API key flow from root `src/`
- Server-side history aggregation (use export + encrypted backup instead)
- `EXTERNAL_API_KEY` or runtime secrets for free tier
- Porting `performBackgroundSync()` from `server.ts`

## Planned: paid cloud backup

Optional **subscription-gated** encrypted backup of IndexedDB snapshots — recover on new device or sync across devices. Not cloud-primary; local-first at runtime. See [paid-backup-plan.md](../../../docs/paid-backup-plan.md).

## Files to treat as canonical

| Concern | File |
|---------|------|
| Live data | `src/lib/buoy-api.ts`, `src/lib/buoy-parse.ts` |
| Local history | `src/lib/history-store.ts` |
| Background collection | `src/lib/background-history.ts` |
| KC relay (prod) | `functions/api/kc.ts` |
| KC relay (dev) | `vite.config.ts` `server.proxy` |
| User disclosure | `src/components/settings-menu.tsx` |
