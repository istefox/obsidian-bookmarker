# ADR-005 — Reclaiming downloaded covers when a bookmark is deleted

## Status

Accepted — 2026-08-14

## Context

ADR-003 shipped local cover images and recorded the gap it left: "Deleting or
deduplicating a bookmark still leaves its downloaded asset behind. `organize-dedup`
trashes the losing note only. Orphan cleanup is not implemented." Issue #60 files it.

`_bookmarks/_assets/` only ever grows. Three call sites trash a bookmark note and
none of them touch its cover: `deleteBookmark` and `deleteBrokenSelected` in
`src/bookmark-view.ts`, and `applyDedup` in `src/organize-dedup.ts`. Deduplication is
the worst case, because `readDedupNote` awards a cover 100 points of richness score:
whenever both notes in a duplicate group have one, the loser's image is orphaned
every single time the feature is used.

Reclaiming the file means the plugin deletes something the user can see in their
vault. That is a different class of action from writing a note into its own folder,
and the reason this decision is recorded rather than treated as a bug fix.

## Decision

**One entry point.** `src/cover-gc.ts` owns `trashBookmarks(app, settings, notes)`.
Every path that trashes a bookmark note calls it; no call site calls
`fileManager.trashFile` on a note directly any more. A cover is reclaimed as a
consequence of deleting the bookmark that owned it, never as a separate sweep the
user has to remember to run.

**Three rules gate every deletion.**

1. *Only inside the assets folder.* The asset path must sit under
   `assetsFolder(settings.rootFolder)`. `setCoverFromVault` lets a user point a
   bookmark at any image they already own, and that image outlives the bookmark
   unconditionally. The plugin only reclaims what the plugin downloaded.
2. *Only when nothing else references it.* References are counted across the vault
   with the notes being trashed excluded. Two bookmarks sharing one picked image is
   a real case, and so is a user embedding the image in an unrelated note.
3. *`fileManager.trashFile`, never `vault.delete`.* Removal honours the user's
   "Deleted files" preference and stays recoverable, the same rule the note
   deletions already followed.

**Reference counting reads the frontmatter directly.** `resolvedLinks` is unioned in,
so a body embed or an unrelated note counts, but it is not the authority: frontmatter
links depend on Obsidian's `frontmatterLinks` support, and a cover must not be deleted
because a cache did not list it. Scanning `image` values is the load-bearing half and
`resolvedLinks` is the belt.

**Covers are read before anything is trashed, counted after.** A deleted note's
frontmatter is no longer readable, and the metadata cache updates on its own
schedule. Capturing the covers up front and then excluding the just-trashed paths
from the count is correct whether or not the cache has caught up; a plain
"scan after delete" is not.

**Failures never cascade.** A note that fails to trash keeps its cover, because the
surviving note is found by the reference scan. A cover that fails to trash is logged
and skipped: the note deletion already succeeded and is not reported as failed.

**No setting.** The cleanup touches only files this plugin downloaded, into its own
folder, only when nothing references them, and recoverably. A toggle would be a
setting whose "off" position means the folder grows forever.

## Consequences

**Positive**
- `_bookmarks/_assets/` stays proportional to the bookmarks that exist.
- Deduplication stops being the main producer of orphans.
- `applyDedup` now merges every victim first and trashes the survivors as one batch,
  so two victims sharing a cover release it. The existing invariant holds: a victim
  whose merge failed is still never trashed.

**Negative**
- Reference counting scans every markdown file's frontmatter per deletion batch. It
  is the same scan the board, `link-check`, `duplicates`, and the Organize commands
  already run, so the cost is familiar, but it is paid on delete now too.
- The plugin deletes a user-visible file for the first time. Trash, the assets-folder
  restriction, and the reference check are what make that acceptable; weakening any
  one of them is not a small change.

**Neutral**
- No migration. Assets already orphaned by earlier versions stay where they are;
  nothing scans for them retroactively.

## References

- Issue #60 — "Deleting a bookmark orphans its downloaded cover in _assets"
- ADR-003 (local cover images, which recorded this gap)
- `src/cover-gc.ts` (new), `src/bookmark-view.ts`, `src/organize-dedup.ts`
