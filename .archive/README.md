# .archive

Read-only history of things this project retired. Nothing here is built, tested, deployed, or imported.

The rule that governs this folder is `.cursor/rules/docs-and-archive.mdc`. When a big change replaces or retires something, it is moved here with `git mv` in the same commit as the docs update, instead of being deleted.

## Layout

```
.archive/
  YYYY-MM-DD-<short-slug>/
    ARCHIVED.md        what it was, why it was retired, what replaced it,
                       last live commit, how to restore
    <original paths>   files kept at their old relative paths
```

## Index

| Folder | What | Replaced by |
|--------|------|-------------|
| [2026-11-10-ai-studio-root](2026-11-10-ai-studio-root/) | Google AI Studio export at repo root (Express + Firestore) | [`mobile/`](../mobile/) PWA + [`worker/`](../worker/) |
| [2026-11-10-cloudflare-pages-kc-proxy](2026-11-10-cloudflare-pages-kc-proxy/) | Cloudflare Pages KC proxy + `_redirects` + Pages wrangler.toml | GitHub Pages + Worker/D1; Capacitor direct-KC |

Add a row here whenever you add a folder.

## Restore

```
git mv .archive/<folder>/<path> <path>
```

Then undo the doc changes that retired it. `git log --follow` on any file shows its full history from before it was archived.
