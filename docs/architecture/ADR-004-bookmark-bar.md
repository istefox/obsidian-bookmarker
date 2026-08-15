# ADR-004 — A browser-style bookmark bar injected above the workspace

## Status

Accepted — 2026-08-08

## Context

Issue #58 asks for an alternative to the board: a horizontal strip pinned to the top of
the workspace, collapsible from a shortcut or ribbon icon, showing favicons and titles,
where clicking a category folder opens a dropdown of its links. The reporter's reason is
specific — the board is a full tab, so reaching a bookmark means covering up the note
they are working in. They want the browser bookmark-bar gesture: glance up, click, keep
the note visible.

The board (`BookmarkView`) is an `ItemView`, and every Obsidian UI surface a plugin can
claim through the public API is a leaf, a ribbon icon, a status-bar item, or a modal.
None of them is a top bar. `Plugin.addStatusBarItem()` is the only horizontal strip on
offer and it is at the bottom and absent on mobile.

Everything the bar needs to display already exists in frontmatter: `note-writer.ts`
writes `favorite`, `favicon`, `title`, and `url` on every capture, and the category is
the note's parent folder. So the question is placement, not data.

## Decision

**Insert a plain element above `.horizontal-main-container`.** Verified against the
shipped `app.css` inside `Obsidian.app/Contents/Resources/obsidian.asar`:

```css
.app-container { display: flex; flex-direction: column; height: 100%; }
.horizontal-main-container { width: 100%; display: flex; overflow: hidden; flex: 1 0 0; }
```

`.app-container` is a flex column whose main child grows to fill it. A sibling inserted
before that child therefore claims its own row and the workspace below shrinks by
exactly the bar's height — no absolute positioning, no `padding-top` compensation, no
z-index. The bar sits under the title bar and above the ribbon and both sidebars, which
is what "pinned to the top of the workspace" means to someone coming from a browser.

This is the one undocumented dependency in the feature, and it is contained: a single
`querySelector` in `BookmarkBar.mount()`. If a future Obsidian release renames or
restructures that container, `mount()` returns false, the bar never appears, and the
plugin's other features are untouched. No `Notice`, no console error — an absent bar is
self-evident and a startup error dialog would be worse than the missing strip.

**A `Component`, not an `ItemView`.** The bar must not be a leaf: leaves appear in the
workspace layout, get a tab header, are user-closable and draggable, and are persisted
and restored by Obsidian. `BookmarkBar extends Component` and is registered with
`plugin.addChild()`, so `registerEvent` cleanup and teardown on plugin unload come for
free and the element leaves no trace in `workspace.json`.

**The setting is the collapse state.** `showBookmarkBar` toggles between mounted and
detached. There is no third "collapsed but present" state and no chevron on the bar
itself, because a collapsed strip large enough to hold its own re-open affordance is
still a strip. The ribbon icon (`panel-top`) and the `toggle-bookmark-bar` command flip
the setting, matching the issue's wording exactly. Default off: this changes the app
layout, so no existing user gets it without asking.

**Favorites, then categories.** Starred bookmarks render as direct buttons (favicon +
title), capped by `bookmarkBarMaxFavorites`; then a separator; then one button per
category, ordered as the board's landing tiles are — named categories alphabetically,
Uncategorized last. Category buttons reuse `settings.categoryStyles` for colour and
icon, so the bar and the board never disagree about what a category looks like.

**Dropdowns are Obsidian `Menu`s, shown at the button's bottom-left** via
`showAtPosition({x: rect.left, y: rect.bottom})`. `MenuItem.setIcon` takes a Lucide name
only, so dropdown rows carry a generic link glyph rather than a favicon; favicons appear
on the bar itself, which is where the issue's description puts them. Rows are capped at
40, after which "Open in board" hands off to the view that is built for volume.

**Favicons are used unproxied and re-validated on read.** `isSafeRemoteUrl` runs again
at render time because frontmatter is hand-editable, and the wsrv.nl proxy is
deliberately skipped: it resizes to `TARGET_WIDTH = 1200`, which is absurd for a 16px
icon. A host that stops serving the file degrades to a link glyph through an `error`
listener.

**Extract, do not duplicate.** `BookmarkView` already owned the vault scan
(`loadBookmarks`), the root-path test (`isUnderRoot`), the `BookmarkItem` shape, and
`renderCategoryIcon`. All four moved to `src/bookmark-data.ts` and `src/category-icon.ts`
so the bar and the board see identical data from identical logic. `BookmarkItem` gained a
`favicon` field, which the board simply ignores. `renderCategoryIcon` needed its own
module rather than an export from `bookmark-view.ts`: importing it from there would form
`bookmark-bar → bookmark-view → main → bookmark-bar`.

**One refresh hook.** `saveSettings()` ends with `this.bar?.sync()`. Every input the bar
reads — visibility, `rootFolder`, `categoryStyles`, the favourites cap, a star toggled
on a card — flows through either that call or the debounced vault-event listeners, so no
settings control needs its own callback.

## Alternatives considered

### A: A workspace pane placed with `createLeafBySplit(leaf, "horizontal", true)`

100% public API, and Obsidian restores it across restarts at no cost.
Rejected: it is a leaf, with everything that implies — a tab header to hide with CSS, a
close button the user will eventually hit, free resizing of something that wants to be
36px tall, and a footprint limited to the main split, so it cannot span the sidebars. It
also cannot be guaranteed to land at the very top when the user already has splits open.
The result would be a pane that looks like a broken bar rather than a bar.

### B: A ribbon icon opening a menu of categories

Zero layout risk, identical behaviour on mobile, about eighty lines.
Rejected: it discards the horizontal bar, which is the request. The issue is explicitly
about browser muscle memory and about seeing the links without a click; a menu that must
be summoned first delivers neither.

### C: Reuse `BookmarkView` in a narrow horizontal leaf

Add a "bar" render mode to the existing view rather than writing a second surface.
Rejected: `BookmarkView` carries a toolbar, filters, tag panel, selection state, and a
password-gated hidden mode — roughly 1200 lines of state that a bar has no use for. The
bar shares the data layer, which is the part worth sharing.

## Consequences

**Positive**
- The bar is genuinely full width and genuinely above everything, including the
  sidebars, which no public-API placement achieves.
- It costs no workspace leaf, so it never shows up in the layout, never steals focus,
  and cannot be accidentally closed into an unrecoverable state.
- The `favorite` flag, previously only a board filter, gains a real daily purpose.
- The data extraction removes a duplicated vault scan before it could be written.

**Negative**
- First undocumented DOM dependency in the codebase. It is one selector with a
  graceful-skip fallback, but a silent Obsidian layout change would silently remove the
  feature, and nothing in CI would notice — this repo has no PR CI and no test suite.
- The bar mounts in the main window only. Popout windows have their own document and get
  no bar. Accepted rather than fixed: `workspace.on("window-open")` would double the
  mounting logic for a case the issue does not mention.
- Every render re-scans the vault via `loadBookmarks`. That is the same cost the board
  already pays on every refresh, and it is debounced to 300 ms, but the bar pays it for
  the whole session rather than only while a tab is open.
- Vertical space is finite on phones. The feature is opt-in everywhere, which pushes that
  judgement to the user instead of making it for them.

**Neutral**
- `openBoard(domain?)` became `openBoard({domain?, category?})`. Three call sites; the
  object form was chosen over a second positional parameter because `category: ""` is a
  meaningful value (Uncategorized) and must be distinguishable from "no filter".
- Favicons are fetched by the browser from the origin host at render time. That is the
  same exposure remote card covers already have when `useImageProxy` is off.

## References

- Issue #58 — "Feature Idea: A horizontal, collapsible browser-like bookmark bar?"
- ADR-001 (no-backend, mobile-safe constraints)
- `src/bookmark-bar.ts`, `src/bookmark-data.ts`, `src/category-icon.ts` (new)
- `src/main.ts`: `toggleBookmarkBar`, `openBoard`, `saveSettings`
- `src/bookmark-view.ts`: `filterByCategory`
