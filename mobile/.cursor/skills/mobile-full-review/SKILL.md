---
name: mobile-full-review
description: >-
  Full code and plan review for 2lakes mobile feature branches — align implementation
  with README/docs, run scoped tests, fix gaps, add missing tests, ship via PR.
  Use when the user asks for end-to-end review, gap analysis, or merge-ready
  delivery on a feature branch.
---

# 2lakes mobile full review and ship

**Shortcuts:** `/full-review` or `/mobile-full-review-do-not-fuck-me` in Cursor chat (`.cursor/commands/`).

**Skill alias:** `mobile-full-review-do-not-fuck-me` (same workflow — thin delegate in `.cursor/skills/mobile-full-review-do-not-fuck-me/`).

End-to-end review workflow for a feature branch. Combines Karpathy-style surgical fixes and **`mobile-feature-ship.mdc`** delivery.

## When to use

- User requests **full code review**, **plan review**, **find gaps**, **fix errors**, **missing tests**, **commit/push/PR**.
- Before opening or updating a large PR (PWA, buoy API, IndexedDB history, deploy/CI).

**Do not use** for babysitting an existing PR's CI/comments only — use **`babysit`** skill instead.

## Read order (plan review)

1. [README.md](../../README.md) — architecture, commands, deploy
2. [docs/cors.md](../../docs/cors.md) — King County proxy decision
3. [store/packaging.md](../../store/packaging.md) — store wrapper steps
4. **`mobile-filenames.mdc`** — kebab-case on disk
5. **`mobile-tests.mdc`** — test requirements for changed behavior
6. **`mobile-pnpm.mdc`** — pnpm-only, `test:pr` gate

## Gap checklist (code review)

| Area | Verify |
|------|--------|
| **Buoy API** | `src/lib/buoy-api.ts` + `buoy-parse.ts`; KC via `/api/kc`; NWS client-side; session cache fallback |
| **History** | `src/lib/history-store.ts` (IndexedDB); 30-day retention; opt-in `background-history.ts`; **no Firebase** |
| **UI routes** | `src/app.tsx` routes match nav links (`/`, `/history`, `/network`, `/tos`, `/icons`) |
| **PWA** | `public/manifest.json`, `public/sw.js`, icons, `assetlinks.json` |
| **Edge** | `functions/api/kc.ts` proxy; Vite dev proxy in `vite.config.ts` |
| **Local-first** | No Firebase/Express/cloud history; device storage only — skill **`mobile-local-first`** |
| **Deploy** | `wrangler.toml`, `.github/workflows/mobile-ci.yml`, `deploy-mobile.yml` |
| **Docs** | README commands match `package.json`; cors/packaging links use kebab-case paths |
| **Tests** | Vitest for parse/API/utils/DB; Playwright for routes; mocked KC/NWS in e2e |

Common gaps to hunt:

- README still references PascalCase or camelCase file paths
- Missing tests for new parsing rules or history retention
- `pnpm test:pr` not updated when scripts change
- CORS proxy missing in dev or Cloudflare functions
- Stale imports after kebab-case renames
- `app.tsx` regressions (offline handling, history save on fetch)
- Cloud backend or Firestore reintroduced in `mobile/` (**`mobile-local-first`**)

## Execution loop

1. **Branch** — `git branch --show-current`; must not be `master`/`main` for deliverable work (**`mobile-branch-commit-pr.mdc`**).
2. **Baseline tests** — pick commands from **`mobile-feature-ship.mdc`**:

   | Changed paths | Run |
   |---------------|-----|
   | `src/**` (TS/TSX) | `pnpm test:pr` |
   | `e2e/**`, `playwright.config.ts` | `pnpm test:e2e` |
   | `scripts/**` | `pnpm test:scripts` |
   | Docs / `.cursor/**` only | `pnpm lint` if TS touched; otherwise skip |
   | **Unsure** | `pnpm test:pr` |

3. **Fix** — surgical changes only (**`mobile-karpathy-guidelines`**); add tests for new behavior (**`mobile-tests.mdc`**).
4. **Re-run** failed suites until green.
5. **Ship** (unless user said WIP / no PR):
   - `git add` (never `.env` secrets)
   - `git commit` imperative message (`feat:`, `fix:`, `test:`)
   - `git push -u origin HEAD`
   - `gh pr create` with Summary + Test plan

## PR body template

```markdown
## Summary
- …

## Test plan
- [x] pnpm test:pr (or scoped commands)
```

## Output to user

Report:

1. **Plan alignment** — what matched / what was missing
2. **Fixes applied** — bullets with file areas
3. **Tests added/run**
4. **PR URL** (if shipped)
