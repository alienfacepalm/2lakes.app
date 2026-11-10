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
| _none yet_ | | |

Add a row here whenever you add a folder.

## Restore

```
git mv .archive/<folder>/<path> <path>
```

Then undo the doc changes that retired it. `git log --follow` on any file shows its full history from before it was archived.
