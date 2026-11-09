# 2lakes.app — Mobile PWA

**This directory (`mobile/`) is the app.** Install, develop, test, and deploy from here — not from the repo root.

The top-level files (`../src/`, `../server.ts`, `../firebase-applet-config.json`, …) are the original **[Google AI Studio](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16)** export. That hosted stack (Firestore + Cloud Run) is **~$50/month** and **will be shut down**; this PWA replaces it with IndexedDB history and Cloudflare Pages (free tier).

See the [root README](../README.md) for the full AI Studio → `mobile/` migration story and prerequisites.

## Quick start

```bash
cd mobile
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173 — Vite proxies `/api/kc` to King County.

## Android emulator (frontend dev)

The shipped app is a **native-style shell** — no URL bar, no browser chrome:

- **Android dev:** Capacitor WebView (`android/`) via `pnpm dev:android`
- **Web install:** PWA `display: standalone` (Add to Home Screen)
- **Play Store:** TWA wrapper ([`store/packaging.md`](store/packaging.md))

`src/lib/native-shell.ts` configures status bar, splash, hardware back, and disables the service worker inside the native shell (bundled assets + live reload instead).

Requires [Android Studio](https://developer.android.com/studio) with at least one AVD, `ANDROID_HOME` set, and **Java 21+** (Android Studio’s bundled JBR is used automatically).

**One command** — Vite live reload inside the native app shell:

```bash
pnpm dev:android
```

First run builds the Android project (Gradle) and can take a few minutes.

| Command | Purpose |
|---------|---------|
| `pnpm dev:android` | Vite + Capacitor app on emulator (standalone, hot reload) |
| `pnpm android:boot` | Boot AVD only (`ANDROID_AVD`, default `Pixel_3_API_33`) |
| `pnpm android:connect` | Launch app shell when Vite is already running |
| `pnpm android:open` | Re-open installed app + `adb reverse` (Vite must be running) |
| `pnpm android:list` | List installed AVDs |
| `pnpm android:status` | SDK path, AVDs, connected devices |

With `pnpm dev` already running in another terminal: `pnpm android:connect`.

Set `ANDROID_AVD` to pick a device (`Pixel_10`, `Pixel_9_Pro_Fold`, …).

Do **not** use a browser tab for day-to-day mobile UI work — use `pnpm dev:android` so you get the real app shell.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server (`127.0.0.1:5173`, strict port) |
| `pnpm dev:port:check` | Verify port 5173 is free before starting |
| `pnpm dev:port:free` | Stop processes listening on 5173 |
| `pnpm build` | Typecheck + production bundle → `dist/` |
| `pnpm preview` | Preview production build locally |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit tests |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test:coverage` | Vitest with v8 coverage |
| `pnpm test:scripts` | Node tests for `scripts/dev-port.mjs` |
| `pnpm test:e2e` | Playwright route tests (starts its own Vite) |
| `pnpm test:pr` | test + scripts + build + lint (CI gate) |
| `pnpm deploy` | Build + Cloudflare Pages deploy |

## Architecture

- **Local-first** — no Express, Firebase, or Cloud Run; history and prefs on the **user's device**
- **$0 hosting, no ads** — Cloudflare Pages free tier; see [docs/zero-cost-policy.md](docs/zero-cost-policy.md)
- King County via `/api/kc` edge proxy (CORS relay only, not an app backend) + NOAA/NWS direct
- History: **IndexedDB** on device (30-day retention, opt-in background collection)
- Deploy: **Cloudflare Pages** static hosting (free tier)

Agents: see skill **`mobile-local-first`** (`.cursor/skills/mobile-local-first/`) before adding persistence, sync, or server routes.

```
mobile/
├── src/app.tsx              Main app shell + routes
├── src/lib/buoy-api.ts       Client API (King County + NWS)
├── src/lib/history-store.ts  IndexedDB snapshots
├── android/                 Capacitor native shell (dev + sideload)
├── src/lib/native-shell.ts  Status bar, splash, back button, app-shell CSS
├── public/sw.js             Offline app shell
└── store/packaging.md       Play Store / App Store steps
```

See [`docs/cors.md`](docs/cors.md) for the CORS gate decision.

## Deploy (Cloudflare Pages)

```bash
pnpm deploy
```

CI: [`.github/workflows/mobile-ci.yml`](../.github/workflows/mobile-ci.yml) runs `pnpm test:pr` and Playwright e2e on PRs; [`.github/workflows/deploy-mobile.yml`](../.github/workflows/deploy-mobile.yml) deploys on push to `main`.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

After deploy, follow [`store/packaging.md`](store/packaging.md) for PWABuilder / TWA / iOS wrapper.

## Env vars

| Variable | Purpose |
|----------|---------|
| `VITE_KC_PROXY_URL` | Override King County proxy (default: `/api/kc`) |
| `VITE_DONATE_URL` | HTTPS link for voluntary donations (Ko-fi, BMC, etc.); hides Donate in Settings when unset |

See [`.env.example`](.env.example). For Cloudflare Pages, set `VITE_DONATE_URL` under project environment variables before build.

## Conventions

**pnpm@11.5.0**, Node **>=22**, ESLint flat config, Vitest, Playwright e2e, `tsc -b` build, strict dev port 5173. Repo-wide rules: [`.cursor/rules/`](../.cursor/rules/) (root) and [`mobile/.cursor/rules/`](.cursor/rules/).

**Cursor:** `/full-review` runs end-to-end gap review + tests — see [`.cursor/README.md`](.cursor/README.md).

## Differences from repo root (AI Studio export — deprecated)

| Feature | Repo root (`/`) | **`mobile/`** (this app) |
|---------|-----------------|--------------------------|
| Origin | Google AI Studio export | Ported + rebuilt for self-hosting |
| Status | Shutting down (**~$50/mo** AI Studio / Firebase) | **Active production** |
| Backend | Express + Cloud Run | Edge proxy only |
| History | Firestore | IndexedDB (local) |
| Developer API | Yes | Removed |
| Package manager | pnpm at root (legacy layout) | pnpm in `mobile/` |
