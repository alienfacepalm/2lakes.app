# Archived 2026-11-10 — AI Studio / repo-root applet

> Archived 2026-11-10. Superseded by [`mobile/`](../../mobile/) (GitHub Pages PWA) + [`worker/`](../../worker/) (Cloudflare Worker + D1).

## What it was

The original [Google AI Studio](https://ai.studio/apps/93efb958-567c-45af-ae4d-8a82dd625c16) export at the repository root: Vite + React SPA, Express (`server.ts`), Firebase/Firestore config, and Cloud Run–oriented packaging. This was the ~$50/month hosted stack.

## Why it was retired

AI Studio hosting ends. Operator cost target is **$0**: static PWA on GitHub Pages, shared buoy data on a free Cloudflare Worker + D1, history in browser IndexedDB replicas.

## What replaced it

| Old | New |
|-----|-----|
| Root `src/` + `server.ts` | `mobile/` PWA |
| Firestore `buoy_snapshots` | D1 source of truth + IndexedDB replicas |
| Express / Cloud Run | Worker `2lakes-api` (`/v1/latest`, `/v1/history`, `/v1/status`) |
| Root `pnpm dev` | `cd mobile && pnpm dev` |

## Last live commit

`ffa00af` (merge of GitHub Pages hosting PR #3 onto `main`).

## How to restore

```bash
git mv .archive/2026-11-10-ai-studio-root/<path> <path>
```

Then restore any README / docs wording that described the root as the live app. Do not re-enable Firestore or Cloud Run for production.
