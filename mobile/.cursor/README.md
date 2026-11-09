# 2lakes mobile — Cursor AI setup

Adapted from [talemail](https://github.com/alienfacepalm/talemail) / Projocalypse Cursor configuration.

## Slash commands (`.cursor/commands/`)

| Command | Purpose |
|---------|---------|
| `/full-review` | Plan + code review, fix gaps, tests, commit/push/PR — loads `mobile-full-review` skill |
| `/mobile-full-review-do-not-fuck-me` | Alias of `/full-review` — same workflow |

## Project rules (`.cursor/rules/`)

| Rule | Always apply |
|------|----------------|
| `mobile-feature-ship.mdc` | **yes** |
| `mobile-branch-commit-pr.mdc` | **yes** |
| `mobile-feature-branches.mdc` | **yes** |
| `mobile-karpathy-guidelines.mdc` | **yes** |
| `mobile-tests.mdc` | **yes** |
| `mobile-dev-server.mdc` | **yes** |
| `mobile-filenames.mdc` | **yes** |
| `mobile-pnpm.mdc` | no (globs: package.json, TS) |

## Skills matrix

| Skill | Use when |
|-------|----------|
| `mobile-local-first` | Architecture guardrails — no backend, on-device history; designing/reviewing data features |
| `mobile-full-review` | End-to-end plan + code review on a feature branch: gaps, fixes, tests, commit/push/PR |
| `mobile-full-review-do-not-fuck-me` | Alias of `mobile-full-review` |
| `mobile-karpathy-guidelines` | Expanded narrative for the always-on Karpathy rule |

## Project rules (`.cursor/rules/` at repo root)

| Rule | Scope |
|------|-------|
| `mobile-local-first.mdc` | `mobile/**` — local-first architecture summary |

## Quick start for agents

1. Read [README.md](../README.md) for stack and deploy.
2. **`mobile-local-first`** — before adding persistence, sync, or API routes in `mobile/`.
3. `mobile-feature-ship` + `mobile-branch-commit-pr` are always on (repo root rules).
4. `mobile-pnpm` + `mobile-filenames` when editing `src/**` or `package.json`.
5. `/full-review` before large PRs.
