# 2lakes.app — Mobile PWA

**This directory (`mobile/`) is the app.** Install, develop, test, and ship from here.

The former Google AI Studio export at the repo root is archived under [`.archive/2026-11-10-ai-studio-root/`](../.archive/2026-11-10-ai-studio-root/). Production hosting is **GitHub Pages** + Cloudflare Worker/D1 replicas — see the [root README](../README.md).

## Quick start

```bash
cd mobile
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173 — Vite proxies `/api/kc` to King County for local display fallback only.

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

## Architecture

- **Local-first** — UI reads IndexedDB replicas only; D1 is the Worker **source of truth**
- **$0 hosting, no ads** — GitHub Pages + Worker/D1 free tier; see [docs/zero-cost-policy.md](docs/zero-cost-policy.md)
- Web PWA syncs from Worker `/v1/*`; Capacitor may call King County directly as display-only fallback
- NOAA/NWS direct from the client
- History: **IndexedDB** on device (default 365-day retention, opt-in background sync)
- Deploy: **GitHub Pages** via Actions

Agents: see skill **`mobile-local-first`** (`.cursor/skills/mobile-local-first/`) before adding persistence, sync, or server routes.

```
mobile/
├── src/app.tsx              Main app shell + routes
├── src/lib/buoy-api.ts       Worker/IDB-first + KC display fallback
├── src/lib/sync.ts           Worker → IndexedDB replica sync
├── src/lib/history-store.ts  IndexedDB snapshots
├── android/                 Capacitor native shell (dev + sideload)
├── src/lib/native-shell.ts  Status bar, splash, back button, app-shell CSS
├── public/sw.js             Offline app shell
└── store/packaging.md       Play Store / App Store steps
```

See [`docs/cors.md`](docs/cors.md) for the CORS gate decision.

## Deploy (GitHub Pages)

Push to `main` (or run the workflow manually). CI:

- [`.github/workflows/mobile-ci.yml`](../.github/workflows/mobile-ci.yml) — `pnpm test:pr` + Playwright e2e on PRs
- [`.github/workflows/deploy-mobile.yml`](../.github/workflows/deploy-mobile.yml) — build + Pages deploy on push to `main`

Custom domain: `mobile/public/CNAME` → `2lakes.app`. SPA deep links use `404.html` (copy of `index.html`) in the artifact.

After deploy, follow [`store/packaging.md`](store/packaging.md) for PWABuilder / TWA / iOS wrapper. Android TWA needs `assetlinks.json` on the domain.

## Env vars

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE` | Override Worker API base (default in `src/lib/sync.ts`) |
| `VITE_KC_PROXY_URL` | Override King County proxy (default: `/api/kc`, local/dev) |
| `VITE_DONATE_URL` | HTTPS link for voluntary donations; hides Donate in Settings when unset |
| `VITE_BASE` | Vite base path (CI sets `/` for `2lakes.app`) |

See [`.env.example`](.env.example).

## Conventions

**pnpm@11.5.0**, Node **>=22**, ESLint flat config, Vitest, Playwright e2e, `tsc -b` build, strict dev port 5173. Repo-wide rules: [`.cursor/rules/`](../.cursor/rules/) (root) and [`mobile/.cursor/rules/`](.cursor/rules/).

**Cursor:** `/full-review` runs end-to-end gap review + tests — see [`.cursor/README.md`](.cursor/README.md).
