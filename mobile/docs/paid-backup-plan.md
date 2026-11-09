# Paid cloud backup & sync (optional — not required for $0 hosting)

**Status:** Not implemented. **Default path for backup:** device file export/import — see [zero-cost-policy.md](zero-cost-policy.md).

The free app stays **device-local** (IndexedDB, opt-in background collection). **No ads.** Operator hosting target is **$0** on Cloudflare Pages.

Paid cloud backup is an **optional** future revenue stream only if you want it — **not** needed to replace the ~$50/mo AI Studio bill.

## Product split

| Tier | History storage | Network | Cost to us |
|------|-----------------|---------|------------|
| **Free** | IndexedDB on device (30-day retention) | Public buoy APIs + `/api/kc` relay | ~$0 (Pages free tier) |
| **Paid backup** | Encrypted blob in object storage, per account | Backup/restore API on subscribe | Storage + egress; covered by subscription |

**What we charge for:** recover history after device loss, or sync the same history across phone + tablet.  
**What stays free:** live buoy readings, charts from local data, PWA install.

## Principles (extends `mobile-local-first`)

1. **Local-first always** — IndexedDB remains the runtime source of truth; cloud is a copy, not the primary DB.
2. **Opt-in + paid** — no cloud writes until the user subscribes and signs in.
3. **User-initiated or scheduled backup** — not continuous Firestore-style sync of every page view.
4. **Encrypt before upload** — server stores ciphertext; keys derived from user password or device-held key (document tradeoffs).
5. **Small payloads** — export `SnapshotRecord[]` (see `history-store.ts`), compress (gzip), encrypt; typical backup is KB—not GB.
6. **No free-tier cloud** — avoids the ~$50/mo Firestore/Cloud Run bill from the AI Studio stack.

## Suggested architecture

```
Device (IndexedDB)
  │
  ├─ exportHistory() ──► JSON / gzip
  ├─ encrypt(client) ──► blob + nonce
  └─ POST /api/backup ──► object storage (R2 / S3)
         ▲                      │
         │                      └── metadata: userId, updatedAt, byteSize, schemaVersion
         │
  Stripe / App Store / Play Billing ──► subscription gate (webhook → enable backup flag)
```

**Restore flow:** sign in → verify subscription → `GET /api/backup/latest` → decrypt on device → merge into IndexedDB (dedupe by `buoyId` + `timestamp`).

**Sync flow:** same as backup + restore; last-write-wins or merge-by-timestamp on restore. True multi-device live sync can be phase 2b (optional periodic pull on app open).

## Backend shape (minimal, not monolithic)

Avoid Express + Firestore. Prefer **small, scoped services**:

| Piece | Role |
|-------|------|
| **Auth** | Clerk, Supabase Auth, or Firebase Auth *auth only* — no Firestore history |
| **Billing** | Stripe (web) + store IAP where required |
| **Storage** | Cloudflare R2 or S3 — encrypted blobs only |
| **API** | Cloudflare Worker or Pages Functions: `PUT/GET /api/backup` gated by JWT + subscription |
| **Hosting** | Existing Cloudflare Pages for static PWA |

Do **not** reuse repo-root `server.ts`, `buoy_snapshots` Firestore rules, or developer API keys.

## Data model (backup blob)

Mirror `SnapshotRecord` from `src/lib/history-store.ts`:

```typescript
interface BackupPayload {
  schemaVersion: 1;
  exportedAt: string; // ISO
  deviceId?: string;  // opaque, for support only
  snapshots: Array<{
    buoyId: string;
    timestamp: string;
    recordedAt: string;
    tempC: number | null;
    // ... same fields as SnapshotRecord
  }>;
}
```

Retention: **free device = 30 days**; **paid backup = longer** (e.g. 1–2 years) — policy TBD, enforced at export or server metadata.

## Settings UX (future)

Under **Local history**, add when built:

- **Cloud backup (Premium)** — toggle only if subscribed
- Copy: *"Encrypted copy of your local history. Restore on a new device. Requires subscription."*
- Actions: Back up now · Restore · Last backup: …

Free users keep current **Background collection** copy unchanged.

## Monetization sketch

| Channel | Notes |
|---------|--------|
| Stripe | PWA / web subscribers |
| Google Play / App Store | TWA / Capacitor builds; use IAP for in-app purchase rules |
| Pricing | Low monthly (e.g. $1–3/mo) — storage cost is tiny for buoy snapshots |

Gate: subscription active → Worker checks claim → allow `PUT`/`GET` backup.

## Security checklist

- [ ] Client-side encryption (libsodium or Web Crypto AES-GCM)
- [ ] No plaintext history in logs or object storage
- [ ] JWT short-lived; backup endpoints rate-limited
- [ ] Per-user object prefix; no list-all
- [ ] Schema version in blob for forward-compatible restore
- [ ] Delete backup on account deletion (GDPR)

## Implementation order

1. `exportHistory()` / `importHistory()` in `history-store.ts` (local merge, tests)
2. Client encrypt/decrypt module + unit tests
3. Worker `PUT/GET /api/backup` + R2 bucket (no billing yet — dev flag)
4. Auth + Stripe webhook → subscription claim
5. Settings UI + “Back up now” / “Restore”
6. Store IAP if Android/iOS ship in stores

## Out of scope for v1 backup

- Real-time multi-device sync
- Sharing history publicly
- Server-side chart computation
- Replacing IndexedDB with cloud-primary storage

## Related

- Skill: `mobile-local-first` — free tier rules; paid backup is the documented exception
- Current local storage: `src/lib/history-store.ts`, `src/lib/background-history.ts`
