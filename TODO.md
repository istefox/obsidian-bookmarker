<!-- project-tasks: prefix=BM lastId=19 -->
# PROJECT TASKS

Updated: 2026-09-12 · Open: 0 (P1: 0) · In progress: 0

## GitHub Issues

_none_

## Open Issues

### Findings Codex

Reconciled 2026-09-12 against HEAD `e435de4` (release 0.1.29) from the audit embedded in
`BOOKMARKER-CLAUDE-CODE-HANDOFF.md`. HEAD equals the audit baseline exactly, so every finding
below was re-verified line-by-line this session and is still present, none already fixed.
Ordered for closure: content-loss and privacy risks first, then security, then defects with a
workaround, then documentation/housekeeping.

## In Progress

_none_

## Backlog / To Add

_none_

## Initiatives (multi-ADR)

_none_

## Blocked / Decisions Needed

_none_

## Project Map

- **Entry point**: `src/main.ts`
- **Modules**: capture (`capture.ts`, `capture-modal.ts`) · covers (`save-cover.ts`, `cover-gc.ts`, `cover.ts`, `image.ts`) · board (`bookmark-view.ts`, `bookmark-bar.ts`) · organize (`organize-ai.ts`, `organize-dedup.ts`, `organize-broken.ts`, `organize-modal.ts`, `organize-scan.ts`) · taxonomy/classification (`taxonomy.ts`, `classifier.ts`) · safety (`url-safety.ts`) · import (`import.ts`) · settings (`settings.ts`)
- **Build & test**: `npm run build` (type-check + bundle) · `npm run lint` (eslint) · no test suite/script (test-cmd: `npm run build && npm run lint`)
- **Key ADRs**: ADR-001 browser capture · ADR-002 hide-bookmarks · ADR-003 local cover images · ADR-004 bookmark bar · ADR-005 cover garbage collection
- **Invariants**: no `fetch`/Node HTTP/electron, only `requestUrl` · no Node-only modules (`fs`, `path`, `child_process`) · vault I/O only through the Obsidian vault API

## Done

- [x] `BM-005` URL safety guard fixed: IPv4-mapped IPv6 (dotted + compressed hex form) and DNS-hostname-vs-IPv6-literal disambiguation, regression tests added (2026-09-12)
- [x] `BM-001` Cover-body sync now only ever touches the plugin's own previously-inserted embed line, never an unrelated one (2026-09-12)
- [x] `BM-006` Card refresh now resyncs the body embed with the new frontmatter cover instead of leaving it stale (2026-09-12)
- [x] `BM-004` Board with zero visible/selected cards now yields zero AI candidates instead of falling back to the whole vault; whole-vault fallback only applies with no board open at all (2026-09-12)
- [x] `BM-007` Capped AI batches now advance per-command (bulk-retag / suggest-folder-moves independently), re-running actually reaches later bookmarks (2026-09-12)
- [x] `BM-009` Taxonomy offered to the classifier now excludes the plugin's internal `_assets` and broken-link folders (2026-09-12)
- [x] `BM-019` The 3 remaining `readTaxonomy` call sites (`capture.ts`, `bookmark-view.ts` x2, `refresh-card.ts`) now pass `settings.brokenFolderName` the same way `organize-ai.ts` already did, so a user-customized broken-folder name is honored everywhere instead of only the `"_broken"` default (2026-09-12)
- [x] `BM-003` Proxy opt-out now skips the fallback entirely when disabled, including when the stored cover is already a wsrv.nl URL from a prior setting (2026-09-12)
- [x] `BM-010` Per-card checkbox change now triggers `renderGrid()`, so "Delete broken"/"Hide selected" button visibility updates immediately, matching the select-all/clear-selection pattern (2026-09-12)
- [x] `BM-011` Related-bookmarks mode now applies the same search/scope/domain/folder/type/favorites/broken/tag filters as normal mode, narrowing candidates before ranking/`MAX_RELATED` truncation instead of bypassing them (2026-09-12)
- [x] `BM-008` Dedup merge now also preserves the victim's custom (non-schema) frontmatter properties, not already set on the keeper, and any other body content beyond the Notes bullets (appended under a clearly attributed "Merged from duplicate" section), instead of silently dropping them (2026-09-12)
- [x] `BM-012` Tag-panel counts, folder/type dropdown options, and the "Insert bookmark link" picker no longer leak hidden bookmarks' tags/folders/types/existence; the board-side surfaces now share a `visibleItems(items, showHidden)` helper matching the grid's own hidden check, and the global insert-link picker (no session/lock state to check) now excludes hidden notes unconditionally (2026-09-12)
- [x] `BM-002` Cover ownership is now tracked by an explicit `settings.downloadedAssets` registry (populated only by `saveCoverToVault`, cleared on reclaim) instead of inferring "plugin-owned" from folder location, so a user's own image under `_assets/` can no longer be silently swept when its bookmark note is deleted (decision: explicit ownership tag) (2026-09-12)
- [x] `BM-013` Favicon fallback and automatic Wayback snapshot now actually implement their advertised settings: capture/refresh fall back to a favicon service when the page declares none and the setting is on, and capture fires a background (never-awaited) Wayback Save Page Now request when its setting is on (decision: implement the advertised behavior) (2026-09-12)
- [x] `BM-014` `npm audit fix` resolved the 3 non-breaking dev-only advisories (brace-expansion, fast-uri, js-yaml, all transitive); the remaining esbuild moderate advisory is left as an accepted, dev-only, breaking-change-gated risk (bumping the pinned `0.20.0` to `0.28.2` requires `--force` per npm's own classification) (2026-09-12)
- [x] `BM-015`+`BM-016` CONTRIBUTING.md now says "run both" (matching the two actual commands) and correctly describes `ui/sentence-case` as disabled rather than "tolerated warnings"; its CI paragraph was updated a second time during this merge to describe `ci.yml` (build+lint+test on every PR/push to `main`, merged after this branch was created) instead of the now-superseded "release.yml only runs the build on tag push" claim (2026-09-12)
- [x] `BM-017` Stale source comments fixed: capture.ts's pipeline doc comment now describes the shipped Microlink/favicon/Wayback fallbacks instead of "layers on later"; the board is now described as fully interactive instead of "read-only"; search is now described as substring/AND instead of "fuzzy" (2026-09-12)
- [x] `BM-018` The completed hide-bookmarks plan doc now carries a "Status: implemented and shipped" header disclosing that its file/line references reflect 2026-06-16's codebase and may not match current structure, pointing readers to the ADR and source instead (2026-09-12)
