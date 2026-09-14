# Changelog

All notable changes to Bookmarker are documented here. Versions follow the plugin's own
`manifest.json`/`versions.json`, released by tag through `.github/workflows/release.yml`.

## 0.1.30 — 2026-09-12

### Added
- Favicon fallback and automatic Wayback Machine snapshot now actually run: both settings existed in the UI before but were never read anywhere in the capture/refresh pipeline (#71).

### Fixed
- Hidden bookmarks no longer leak through tag counts, folder/type dropdowns, or the "Insert bookmark link" picker (#68).
- Deduplicate no longer silently drops a merged note's custom frontmatter properties or body content beyond the Notes bullets (#67).
- The board's related-bookmarks mode now respects the active search/scope/domain/folder/type/favorites/broken/tag filters instead of bypassing them (#66).
- A card's checkbox now immediately updates the "Hide selected"/"Delete broken" button visibility (#66).
- Cover ownership is tracked by an explicit registry instead of inferred from folder location, so a user's own image under `_bookmarks/_assets/` can no longer be swept when its bookmark is deleted (#69).
- Closed an IPv4-mapped IPv6 SSRF bypass (dotted and compressed hex forms) and a false-positive rejection of public hostnames starting with `fc`/`fd` in the URL safety guard (#72).
- Bulk AI classification no longer expands to the whole vault (hidden bookmarks included) when the board is open with nothing selected or visible; capped batches now advance per-command on re-run instead of always restarting from the first bookmark (#70).
- The taxonomy offered to the classifier excludes the plugin's own internal `_assets` and broken-link folders, including a customized broken-folder name at every call site, not just the default (#70, #77).
- The cover body sync now only ever touches the plugin's own previously-inserted embed line, never an unrelated embed further down the note; card refresh now resyncs the body embed instead of leaving it stale after a frontmatter-only update (#78).
- Disabling the image proxy now actually stops the origin-download fallback from contacting wsrv.nl, including when the stored cover URL was already a proxied one (#79).

### Changed
- CI now runs build, lint, and the test suite on every pull request and push to `main` (#76).
- Resolved the non-breaking npm audit advisories in dev dependencies (#73).

### Docs
- Fixed stale CONTRIBUTING.md claims about CI and lint enforcement, and stale source comments describing already-shipped behavior as upcoming (#74).

## 0.1.29 — 2026-08-15

### Changed
- CI and release workflows moved to Node 24, with `actions/checkout`/`actions/setup-node` bumped to v7 (#63, #64).

## 0.1.28 — 2026-08-15

### Added
- A browser-style bookmark bar above the workspace: starred bookmarks and per-category dropdowns, off by default (#59).

### Fixed
- Deleting a bookmark now reclaims its downloaded cover from `_bookmarks/_assets/` instead of leaving it orphaned (#61).

### Docs
- Documented the local cover images feature in the README's What's new section (#57).

## 0.1.27 — 2026-08-02

### Added
- Local covers: a card's cover can be an image stored in the vault instead of a remote URL, referenced by wikilink so it survives renames and URL rot (`feat(cover)`).

### Docs
- Documented all board and command features in the README (#53).

## 0.1.26 — 2026-07-11

### Fixed
- Search text and focus now carry over from the Categories screen into the card view (#51).

## 0.1.25 — 2026-07-04

### Fixed
- Replaced fuzzy board search with substring/token matching for more predictable results (#49).

### Changed
- Release workflow actions bumped to Node 24 runtime versions (#48).

## 0.1.24 — 2026-06-17

### Added
- An optional password lock for the Hidden-bookmarks toggle (#46).

## 0.1.23 — 2026-06-16

### Added
- A hide-bookmarks toolbar toggle and matching context-menu action on the board (#44).

## 0.1.22 — 2026-06-16

### Added
- A toolbar toggle to use the note's file name as the card title instead of its frontmatter title (#42).

## 0.1.21 — 2026-06-16

### Added
- A sort control for the card grid (#40).

## 0.1.20 — 2026-06-16

### Added
- Every card now gets a fixed, uniform size per size mode (#38).

## 0.1.19 — 2026-06-16

### Added
- Card height now scales with the size setting; added a board view switch and an icon palette (#36).

## 0.1.18 — 2026-06-16

### Added
- A category landing view ahead of the card grid, with a per-category color and icon (#34).

## 0.1.17 — 2026-06-16

### Added
- Configurable card size and gap on the board toolbar (#32).

## 0.1.16 — 2026-06-16

### Added
- A visible rename/delete affordance on tag chips (#30).

## 0.1.15 — 2026-06-16

### Fixed
- The delete-button state now toggles via a CSS class instead of an inline style (#28).

## 0.1.14 — 2026-06-16

### Added
- Unified toolbar button sizing; a bulk-delete action for broken links (#26).

## 0.1.13 — 2026-06-16

### Added
- A manageable tag panel, card refresh, and smarter link checks on the board.

## 0.1.12 — 2026-06-15

### Added
- Bulk Organize commands: deduplicate, re-tag, folder-move, and clean up broken links.

### Changed
- Extracted shared tag/timeout/scanner utilities; switched to `FileManager.trashFile` and disabled a false-positive lint rule.

## 0.1.11 — 2026-06-15

### Added
- "Insert bookmark link" command and quick notes on a bookmark (#23).

## 0.1.10 — 2026-06-15

### Added
- Fuzzy board search and a "Show related" card action (#22).

### Docs
- Documented Raindrop import and the board's card menu; recorded the saved-page badge decision in ADR-001 (#20, #21).

## 0.1.9 — 2026-06-15

### Added
- Create a new category on the fly when moving a card (#19).

## 0.1.8 — 2026-06-15

### Added
- A right-click context menu for cards on the board (#18).

## 0.1.7 — 2026-06-15

### Added
- Import bookmarks straight from Raindrop via its API (#17).

## 0.1.6 — 2026-06-15

### Changed
- Release actions moved to Node 24, build to Node 22; untracked internal files and refreshed post-publish docs (#14, #15, #16).

## 0.1.5 — 2026-06-15

### Added
- Auto-refresh for the board, a first test, and better folder classification (#13).

### Docs
- Linked the Chrome Web Store listing in the READMEs; removed em dashes from the extension README (#11, #12).

## 0.1.4 — 2026-06-15

### Changed
- Community scorecard improvements: native builtins, CONTRIBUTING guide, CI release workflow (#9, #10).

## 0.1.3 — 2026-06-15

### Fixed
- Replaced the deprecated `setWarning` call with the native warning class (#8).

## 0.1.2 — 2026-06-15

### Fixed
- Cleared Obsidian community-plugin validator errors; raised `minAppVersion` to 1.7.2 (#7).

## 0.1.1 — 2026-06-15

### Changed
- Renamed the plugin id to `bookmarker` (#6).

## 0.1.0 — 2026-06-14

Initial release: capture, AI tags/folder classification, review modal, board view, organize commands, and Raindrop/Pocket/browser import.
