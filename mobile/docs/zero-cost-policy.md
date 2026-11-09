# Zero-cost, no-ads policy

**Operator hosting target: $0/month.**

**User promise: free forever, no ads, nothing forced** — [product-ethos.md](product-ethos.md). Users never have to view advertisements, sponsored content, or donation prompts to use the app. Donations are opt-in from Settings only — not a paywall and not a substitute for ads.

The AI Studio / Firestore / Cloud Run stack costs **~$50/month**. The mobile PWA replaces it **without** putting ads on users.

## What we run for $0

| Piece | Cost | Notes |
|-------|------|--------|
| **Cloudflare Pages** | Free tier | Static `dist/` + `functions/api/kc` CORS relay |
| **King County + NWS** | Free | Public APIs; client-side fetch |
| **IndexedDB history** | $0 | On the user's device |
| **Ads** | **Never** | No AdMob, no programmatic ads, no sponsored placements — **not now, not as a fallback** |
| **Feature gating** | **Never** | No “watch ad to unlock”, no premium tier required for buoys/history/forecasts |
| **Donations** | **Optional** | Hidden unless `VITE_DONATE_URL` is set; never required; does not change app behavior |

## What we do not add

- Ad networks or analytics-for-ads
- Firebase / Firestore / Cloud Run for app state (paid backend)
- Free-tier cloud sync that creates a recurring hosting bill
- Nag screens, interstitials, or “upgrade to remove ads”
- Rewarded video, ad walls, or third-party ad SDKs (even if hosting gets expensive)
- Donation prompts on startup, between screens, or before viewing data

## Donations (voluntary, $0 backend)

Set **`VITE_DONATE_URL`** to your Ko-fi, Buy Me a Coffee, GitHub Sponsors, or PayPal link. Settings shows **Donate** only when this is set at build/deploy time.

- No Stripe integration in-app — user leaves to your donate page
- No ads, no paywall — full app stays free
- Copy in `src/components/settings-menu.tsx` + `src/lib/donate.ts`

## Backup without a server (recommended for $0)

If cloud backup is not worth operating, users can still recover history **with no hosting cost**:

| Method | Cost to you | Cost to user |
|--------|-------------|--------------|
| **Export file** | $0 | $0 — download encrypted or plain JSON from Settings |
| **Import file** | $0 | $0 — restore on a new device via file picker / share sheet |
| **Paid cloud backup** | Optional later | Optional subscription — **not required** for $0 ops |

Export/import uses the same `SnapshotRecord` shape as `history-store.ts`. No account, no server, no ads.

## When paid cloud backup makes sense

Only if you **want** optional revenue to fund something beyond buoy monitoring (e.g. longer retention in the cloud). It is **not** required to keep the app alive at $0. See [paid-backup-plan.md](paid-backup-plan.md) — treat as **optional**, not the default path.

## Shut down the $50/mo stack

1. Deploy `mobile/` to Cloudflare Pages (`pnpm deploy`).
2. Point users at the Pages URL / PWA install — not AI Studio.
3. Stop Cloud Run and Firestore writes on the old Firebase project.
4. Do not re-enable root `server.ts` in production.

## Related

- [cors.md](cors.md) — why `/api/kc` exists (not a paid backend)
- Skill `mobile-local-first` — local-first architecture
