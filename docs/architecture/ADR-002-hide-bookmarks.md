# ADR-002 — Per-note hide flag with in-memory show-hidden toggle

## Status

Accepted — 2026-06-16

## Context

The board (`BookmarkView`) already supports `favorite` and `broken` as optional
boolean frontmatter flags on each note. Both are read in `loadBookmarks`, stored
in `BookmarkItem`, and drive `filtered()` and per-card badges. The toolbar has
toggle chips (`bookmarker-tag-chip` + `bookmarker-tag-active`) and a conditional
bulk-action button (`deleteBrokenBtn`, toggled via `bookmarker-hidden`) as
established patterns.

The user needs a way to keep certain bookmarks in the vault but exclude them from
the board by default, revealing them on demand. The SPEC requires:

- A `hidden` frontmatter flag (absent/false = visible, true = hidden).
- A per-card context-menu action to hide or unhide.
- A bulk "Hide selected" toolbar button (shown only when selection is non-empty).
- A toolbar chip "Show hidden" (in-memory, default off) that includes hidden cards
  dimmed and badged when on.
- Consistent exclusion: grid, count label, search results, and category counts
  all respect the visibility rule while the toggle is off.

Constraints: TypeScript, Obsidian vault API only, mobile-safe (no Node modules,
no inline `.style` assignments per the `obsidianmd/no-static-styles-assignment`
lint rule), no persisted settings change.

## Decision

Extend `BookmarkItem` with `hidden: boolean`, read in `loadBookmarks` as
`fm.hidden === true` (mirrors `favorite`/`broken`). Add `showHidden: boolean`
in-memory field on `BookmarkView`, default `false`.

**Filter gate:** `filtered()` prepends the rule
`if (item.hidden && !this.showHidden) return false` before all other predicates.
This single gate covers grid rendering, the count label, search, folder/tag
filters, and `getVisibleFiles()`.

**Category counts:** `renderCategories()` currently counts `this.items` directly.
Change the loop to filter out hidden items when `showHidden` is false, so
category tile counts match the grid.

**Toolbar additions (inside `renderToolbar()`):**
1. "Show hidden" chip, styled as `bookmarker-tag-chip`, active class toggled
   on click, calls `renderGrid()`. Declared after the existing Broken chip.
2. "Hide selected" button, a `bookmarker-toolbar-btn` with an error-coloured
   class (same pattern as `deleteBrokenBtn`), stored as `hideSelectedBtn`.
   Its visibility is driven by `toggleClass("bookmarker-hidden", ...)` in
   `renderGrid()`, alongside `deleteBrokenBtn`, whenever
   `this.selected.size > 0`.

**Context menu (inside `showCardMenu()`):** a new entry immediately before the
existing "Delete" separator. It reads "Hide" when `!item.hidden`, "Unhide" when
`item.hidden`. The handler calls `processFrontMatter` to write `hidden: true` or
deletes the key (sets to undefined/null so the key is removed cleanly), updates
`item.hidden` in memory, and calls `renderGrid()`.

**Bulk hide (new private method `hideSelected()`):** iterates
`this.items.filter(i => this.selected.has(i.file.path))`, writes
`fm.hidden = true` via `processFrontMatter` on each, clears selection, calls
`renderGrid()`. Idempotent: already-hidden items are written again harmlessly.

**Visual treatment when shown:** in `renderCard()`, when `item.hidden &&
this.showHidden`, add class `bookmarker-card--hidden` to the card element. CSS
gives that class `opacity: 0.45`. A `<span class="bookmarker-card-hidden-badge">`
sits on the cover (same absolute-position pattern as `bookmarker-card-broken`).

All CSS is in `styles.css` (no inline style assignments).

## Alternatives considered

### A: Persist the toggle in `BookmarkerSettings`

Store `showHidden: boolean` in `DEFAULT_SETTINGS` and `BookmarkerSettings`.
Pros: state survives across vault reopens.
Rejected: the SPEC explicitly says "not persisted" and "every time the board
opens it starts with hidden bookmarks excluded". Persisting it would silently
reveal a set of items the user intentionally hid, undermining the purpose of the
feature. The in-memory default-off behaviour is the whole point.

### B: Filter hidden items at load time (`loadBookmarks`) rather than at `filtered()`

Omit hidden items from `this.items` entirely when `showHidden` is false, so
`filtered()`, category counts, and `getVisibleFiles()` all see the smaller set
without explicit checks.
Pros: no per-call guard in `filtered()`.
Cons: the toggle would require calling `loadBookmarks()` + full redraw (the vault
scan) on every toggle click, not just `renderGrid()`. It also makes
`getSelectedFiles()` silently drop hidden paths from the selection when the
toggle is off, making "Hide selected" unreachable for already-hidden items in the
selection. The `filtered()` gate is the established pattern (see `favoritesOnly`,
`brokenOnly`) and costs one boolean check per item.
Rejected: rebuild-on-toggle cost and selection coherence issue outweigh the
marginal simplicity gain.

### C: Separate "hidden" view mode instead of a toggle

Replace the toggle with a dedicated board mode ("Hidden" chip on the categories
landing) that shows only hidden items, symmetrical to the existing Favorites and
Broken chips.
Pros: clean separation, no dimming logic.
Cons: the SPEC is explicit about an in-grid toggle that shows hidden cards
alongside normal ones (dimmed, badged). A separate mode makes it impossible to
compare a hidden card with its neighbours to decide whether to unhide it.
Rejected: contradicts the specified UX.

## Consequences

**Positive**
- No new runtime dependency; no settings migration.
- The `filtered()` gate is a single addition; all downstream consumers (grid,
  count, search, `getVisibleFiles()`) inherit it without changes.
- Pattern is consistent with `favorite`/`broken`; any future per-note flag would
  follow the same path.

**Negative**
- Category counts currently loop `this.items` without filtering; the loop must be
  updated so counts stay consistent. This is a contained change but is easy to
  forget.
- `hideSelected()` issues one `processFrontMatter` call per selected note
  serially. For large selections this is acceptable (Obsidian's API serialises
  frontmatter writes anyway), but it is not batched.
- The "Hide selected" button visibility logic is now tied to two conditions
  (`selected.size > 0`, independently of `brokenOnly`). `renderGrid()` must
  manage both buttons' visibility; a slight increase in coupling.

**Neutral**
- Unhiding via context menu removes the `hidden` key rather than setting it to
  `false`, keeping frontmatter clean. Both representations are read as `false` by
  `fm.hidden === true`.
- The toggle resets on every board open because `showHidden` is an instance
  field with a `false` initialiser, which is already the desired behaviour.

## References

- SPEC.md `/Users/stefanoferri/Developer/Bookmark/SPEC.md` (hide-bookmarks)
- ADR-001 (no-backend, mobile-safe constraints)
- `src/bookmark-view.ts`: `loadBookmarks`, `filtered`, `renderToolbar`,
  `renderCard`, `showCardMenu`, `deleteBrokenBtn` pattern
- `styles.css`: `.bookmarker-card-broken`, `.bookmarker-hidden`,
  `.bookmarker-tag-active` for CSS patterns to mirror
