---
name: mobile-local-first
description: >-
  Enforces 2lakes mobile PWA architecture — free tier is device-local (IndexedDB);
  optional paid cloud backup is the only planned user-data backend. Use when
  designing mobile/ features, reviewing data flow, or adding sync/backup/billing.
---

# Mobile local-first architecture

The **`mobile/`** app exists to **eliminate backend services** that powered the legacy AI Studio / Firestore / Cloud Run stack. Logic runs in the browser or Capacitor WebView; **history and preferences stay on the user's device** on the **free tier**.

**Planned monetization:** optional **paid encrypted cloud backup/sync** — see [paid-backup-plan.md](../../../docs/paid-backup-plan.md). That is the **only** approved place for user history in the cloud.

Read [architecture-review.md](architecture-review.md) for the current compliance audit.

## North star

| Principle | Meaning |
|-----------|---------|
| **Make life easier** | Faster lake checks, less noise — see [product-ethos.md](../../../docs/product-ethos.md) |
| **Free = no app backend** | No Express, Cloud Run, Firestore, or cloud history without a subscription |
| **D1 = source of truth** | Worker D1 holds canonical buoy rows; browsers keep IndexedDB **replicas** |
| **UI reads replicas only** | Never write buoy readings from the browser to D1 |
| **Paid = backup copy only** | Encrypted blob upload; local-first on read; not cloud-primary DB |
| **Opt-in background sync** | Hourly Worker→replica sync when enabled (not direct KC from web) |
| **Public data in, local out** | Worker collects KC; free tier persists replicas on-device |
| **Static deploy** | Ship `dist/` to GitHub Pages — **$0** target |
| **No ads** | Never add ad SDKs; never force users to view ads; never ad-gate features — [zero-cost-policy.md](../../../docs/zero-cost-policy.md) |
| **Donations** | Settings-only external link via `VITE_DONATE_URL`; optional; must not block or nag |

## Allowed network (not “our backend”)

| Endpoint | Role | Stores data? |
|----------|------|--------------|
| Worker `/v1/*` | Public read API for replicas (`sync.ts`) | **No** on client — D1 is Worker-side |
| `/api/kc` | Vite **dev** proxy to King County only | **No** — local relay |
| Capacitor → King County | Native display-only fallback | **No** app backend |
| `api.weather.gov` | Forecasts/alerts (direct from client) | **No** |
| `static-maps.yandex.ru` | Map thumbnails | **No** |
| `radar.weather.gov` | Radar iframe | **No** |

The web PWA does **not** host a King County CORS function on GitHub Pages. See [docs/cors.md](../../../docs/cors.md).

## On-device storage map

| Data | Store | Module |
|------|-------|--------|
| Buoy history (30 days) | IndexedDB `2lakes-history` | `src/lib/history-store.ts` |
| Background history toggle + last run | `localStorage` | `src/lib/background-history.ts` |
| Theme, selected buoy | `localStorage` | `src/app.tsx` |
| Last live reading (offline fallback) | `sessionStorage` | `src/lib/buoy-api.ts` |
| App shell + KC response cache | Cache API (service worker) | `public/sw.js` |

Native shell (`src/lib/native-shell.ts`): service worker **off** in Capacitor; bundled assets + live reload instead.

## Feature design checklist

Before adding or changing behavior in `mobile/`:

- [ ] **No new server** — no API routes, Lambdas, or Firestore writes for app state
- [ ] **Persist locally** — new user data → IndexedDB or `localStorage`; document retention
- [ ] **Opt-in if background** — periodic fetches need a Settings toggle + clear copy (cost, frequency, local-only)
- [ ] **Minimize fetches** — prefer one King County read shared across buoys (`background-history.ts` pattern)
- [ ] **No secrets in client** — no API keys, Firebase config, or Gemini keys
- [ ] **No port from archive** — do not revive archived AI Studio `server.ts`, developer API, or Firestore sync
- [ ] **Tests** — Vitest for storage/parsing/sync rules; mock Worker `/v1/*` and NWS in tests

## Red flags (reject or escalate)

| Proposal | Why |
|----------|-----|
| Free-tier Firestore / cloud sync | Reintroduces unpaid hosting cost |
| Firebase history like AI Studio root | Deprecated model |
| Developer REST API in mobile | Root app only |
| Server-side history aggregation | Device export + encrypted blob instead |
| Unbounded background polling | Violates hourly collection model |
| Cloud-primary DB (read path hits server first) | Breaks offline/local-first |

**Allowed when building paid backup** (subscription-gated, **optional**): auth, Stripe/IAP, R2/S3 encrypted blobs, `PUT/GET /api/backup` Worker. Not required for $0 ops — prefer file export/import per [zero-cost-policy.md](../../../docs/zero-cost-policy.md).

If the user requests cloud features without billing design, state tradeoffs and point to the backup plan.

## Implementation patterns

**Save a buoy snapshot (after live fetch or KC parse):**

```typescript
import { saveSnapshot } from "@/lib/history-store";
await saveSnapshot(buoyId, buoyData);
```

**Hourly background capture (one KC hit, all buoys):**

```typescript
import { runBackgroundHistoryCapture } from "@/lib/background-history";
await runBackgroundHistoryCapture();
```

**Fetch live buoy (client-side KC + NWS):**

```typescript
import { getBuoyData } from "@/lib/buoy-api";
const data = await getBuoyData("Lake Sammamish");
```

Do **not** add Express middleware, `firebase` imports, or `fetch("/api/buoy-data")` to `mobile/`.

## Review workflow

When reviewing `mobile/` changes:

1. Grep for `firebase`, `firestore`, `express`, `addDoc`, `getFirestore`, `/api/buoy`
2. Confirm new persistence uses `history-store` or documented `localStorage` keys
3. Confirm background work respects `BACKGROUND_HISTORY_INTERVAL_MS` (1 hour)
4. Confirm Settings explains local-only + fetch frequency for any new collection
5. Run `cd mobile && pnpm test:pr`

Report violations as:

- **Blocker** — cloud backend, cloud history, or secrets in client
- **Major** — unbounded polling, missing opt-in, server-side state
- **Minor** — unclear Settings copy, cache without IndexedDB for history

## Related docs

- [docs/product-ethos.md](../../../docs/product-ethos.md) — make life easier, not harder
- [docs/cors.md](../../../docs/cors.md) — why `/api/kc` exists
- [docs/zero-cost-policy.md](../../../docs/zero-cost-policy.md) — $0 hosting, no ads
- [docs/paid-backup-plan.md](../../../docs/paid-backup-plan.md) — **paid** encrypted backup/sync (next phase)
- Skill **`mobile-full-review`** — ship checklist includes local-first row
- Rule **`mobile-local-first.mdc`** — always-on summary in `.cursor/rules/`
