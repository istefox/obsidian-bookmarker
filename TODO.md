<!-- project-tasks: prefix=BM lastId=19 -->
# PROJECT TASKS

Updated: 2026-09-12 · Open: 8 (P1: 1) · In progress: 0

## GitHub Issues

_none_

## Open Issues

### Findings Codex

Reconciled 2026-09-12 against HEAD `e435de4` (release 0.1.29) from the audit embedded in
`BOOKMARKER-CLAUDE-CODE-HANDOFF.md`. HEAD equals the audit baseline exactly, so every finding
below was re-verified line-by-line this session and is still present, none already fixed.
Ordered for closure: content-loss and privacy risks first, then security, then defects with a
workaround, then documentation/housekeeping.

- [ ] `BM-002` **P1** Deleting a bookmark can also delete a manually-placed image, ownership is inferred from folder path alone — `src/cover-gc.ts:83` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
  - Related to the BM-001/BM-006 cover chain but needs its own decision first (explicit ownership tag vs. redefining `_assets` as fully plugin-managed) — recommend a separate PR
- [ ] `BM-013` **P2** favicon-fallback and automatic-Wayback settings are shown in the UI and saved but never read anywhere in the runtime — `src/settings.ts:269` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
  - Needs a decision first: retire the controls, or implement the advertised behavior
- [ ] `BM-014` **P3** npm audit still reports 4 dev-only advisories (brace-expansion, fast-uri, js-yaml high; esbuild moderate), none reachable from runtime — `package-lock.json` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
  - Standalone maintenance PR, different cadence/testing than the feature fixes
- [ ] `BM-015` **P3** CONTRIBUTING.md says "run all three" but lists two commands, and implies CI checks both when release.yml only runs the build on tag push — `CONTRIBUTING.md` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
  - Chain: BM-015 + BM-016 + BM-017 + BM-018, one PR — docs/comment housekeeping only, zero functional risk
- [ ] `BM-016` **P3** CONTRIBUTING.md describes `ui/sentence-case` lint warnings as tolerated false positives, the rule is actually set to `"off"` — `eslint.config.mjs:20` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
- [ ] `BM-017` **P3** Stale source comments: "M4/M5 fallbacks layer on later" (already shipped), board called "read-only" (fully interactive), search called "fuzzy" (substring-token-AND) — `src/capture.ts:17` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
- [ ] `BM-018` **P3** Completed historical implementation plan still in the public tree, with stale code-location references — `docs/superpowers/plans/2026-06-16-hide-bookmarks.md` <!-- src:review kind:fix opened:2026-09-12 runs:1 -->
- [ ] `BM-019` **P3** `readTaxonomy` only excludes the broken-folder by its default name at 3 call sites (`capture.ts`, `bookmark-view.ts`, `refresh-card.ts`), a user-customized `brokenFolderName` still leaks through as an ordinary destination there — `src/taxonomy.ts` <!-- src:session kind:fix opened:2026-09-12 -->
  - Surfaced by the BM-009 fix (fix/organize-ai-pipeline branch); those 3 call sites need to pass `settings.brokenFolderName` the same way `organize-ai.ts` now does

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
- [x] `BM-009` Taxonomy offered to the classifier now excludes the plugin's internal `_assets` and broken-link folders (known gap: 3 other call sites still exclude only the default `_broken` name, not a customized one — see `taxonomy.ts` doc comment) (2026-09-12)
- [x] `BM-003` Proxy opt-out now skips the fallback entirely when disabled, including when the stored cover is already a wsrv.nl URL from a prior setting (2026-09-12)
- [x] `BM-010` Per-card checkbox change now triggers `renderGrid()`, so "Delete broken"/"Hide selected" button visibility updates immediately, matching the select-all/clear-selection pattern (2026-09-12)
- [x] `BM-011` Related-bookmarks mode now applies the same search/scope/domain/folder/type/favorites/broken/tag filters as normal mode, narrowing candidates before ranking/`MAX_RELATED` truncation instead of bypassing them (2026-09-12)
- [x] `BM-008` Dedup merge now also preserves the victim's custom (non-schema) frontmatter properties, not already set on the keeper, and any other body content beyond the Notes bullets (appended under a clearly attributed "Merged from duplicate" section), instead of silently dropping them (2026-09-12)
- [x] `BM-012` Tag-panel counts, folder/type dropdown options, and the "Insert bookmark link" picker no longer leak hidden bookmarks' tags/folders/types/existence; the board-side surfaces now share a `visibleItems(items, showHidden)` helper matching the grid's own hidden check, and the global insert-link picker (no session/lock state to check) now excludes hidden notes unconditionally (2026-09-12)
