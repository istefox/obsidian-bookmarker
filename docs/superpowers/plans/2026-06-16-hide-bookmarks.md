# Plan: Hide bookmarks — 2026-06-16

ADR: `docs/architecture/ADR-002-hide-bookmarks.md`

---

## Task 1 — Extend `BookmarkItem` and `loadBookmarks`

**Files:** `src/bookmark-view.ts`

Add `hidden: boolean` to the `BookmarkItem` interface (after `broken`):

```ts
hidden: boolean;
```

In `loadBookmarks`, inside the `items.push({…})` call, add:

```ts
hidden: fm.hidden === true,
```

This mirrors the existing `favorite: fm.favorite === true` and
`broken: fm.broken === true` lines.

No observable contract change for external callers; `BookmarkItem` is internal.

---

## Task 2 — Add `showHidden` in-memory field and wire `filtered()`

**Files:** `src/bookmark-view.ts`

Add the instance field with its private class-field declaration (alongside
`favoritesOnly` / `brokenOnly`):

```ts
private showHidden = false;
```

In `filtered()`, insert as the first guard inside the `.filter()` callback,
before any other predicate:

```ts
if (item.hidden && !this.showHidden) return false;
```

This single gate covers the grid, the "N bookmarks" count, search results, and
all filter combinations.

---

## Task 3 — Fix category counts to respect hidden visibility

**Files:** `src/bookmark-view.ts`

In `renderCategories()`, replace the counting loop:

```ts
// Before
for (const item of this.items) {
    counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
}

// After
for (const item of this.items) {
    if (item.hidden && !this.showHidden) continue;
    counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1);
}
```

This keeps tile counts consistent with the grid. The zero-count case (all items
hidden) surfaces the "No bookmarks yet." empty state, which is correct.

---

## Task 4 — Add toolbar "Show hidden" chip and "Hide selected" button

**Files:** `src/bookmark-view.ts`

In `renderToolbar()`, after the `brokenChip` block:

```ts
const showHiddenChip = toolbar.createSpan({
    cls: "bookmarker-tag-chip",
    text: "Hidden",
});
if (this.showHidden) showHiddenChip.addClass("bookmarker-tag-active");
showHiddenChip.addEventListener("click", () => {
    this.showHidden = !this.showHidden;
    showHiddenChip.toggleClass("bookmarker-tag-active", this.showHidden);
    this.renderGrid();
});
```

After the existing `deleteBrokenBtn` block, add:

```ts
const hideSelectedBtn = toolbar.createEl("button", {
    cls: "bookmarker-toolbar-btn bookmarker-hide-selected bookmarker-hidden",
    text: "Hide selected",
});
hideSelectedBtn.addEventListener("click", () => void this.hideSelected());
this.hideSelectedBtn = hideSelectedBtn;
```

Add `private hideSelectedBtn!: HTMLButtonElement;` alongside the existing
`private deleteBrokenBtn!: HTMLButtonElement;` declaration.

---

## Task 5 — Update `renderGrid()` to toggle `hideSelectedBtn` visibility

**Files:** `src/bookmark-view.ts`

In `renderGrid()`, after the existing `deleteBrokenBtn.toggleClass(…)` call,
add:

```ts
this.hideSelectedBtn.toggleClass(
    "bookmarker-hidden",
    this.selected.size === 0,
);
```

The "Hide selected" button appears whenever any card is ticked, regardless of
filter state. The "Delete broken" button remains gated on `brokenOnly &&
selected.size > 0` (unchanged).

---

## Task 6 — Add Hide/Unhide to the card context menu

**Files:** `src/bookmark-view.ts`

In `showCardMenu()`, insert a new `menu.addItem` immediately before the
`menu.addSeparator()` call that precedes "Delete":

```ts
menu.addItem((i) =>
    i
        .setTitle(item.hidden ? "Unhide" : "Hide")
        .setIcon(item.hidden ? "eye" : "eye-off")
        .onClick(() => void this.toggleHidden(item)),
);
```

Add the private method `toggleHidden`:

```ts
private async toggleHidden(item: BookmarkItem): Promise<void> {
    const next = !item.hidden;
    try {
        await this.app.fileManager.processFrontMatter(
            item.file,
            (fm: Record<string, unknown>) => {
                if (next) fm.hidden = true;
                else delete fm.hidden;
            },
        );
        item.hidden = next;
        this.renderGrid();
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        new Notice(`Failed to update hidden: ${msg}`);
    }
}
```

Unhiding deletes the key rather than setting `false` to keep frontmatter clean.

---

## Task 7 — Implement `hideSelected()` bulk action

**Files:** `src/bookmark-view.ts`

```ts
private async hideSelected(): Promise<void> {
    const targets = this.items.filter((i) => this.selected.has(i.file.path));
    if (targets.length === 0) return;
    let failed = 0;
    for (const item of targets) {
        try {
            await this.app.fileManager.processFrontMatter(
                item.file,
                (fm: Record<string, unknown>) => {
                    fm.hidden = true;
                },
            );
            item.hidden = true;
        } catch {
            failed++;
        }
    }
    this.selected.clear();
    if (failed > 0) new Notice(`${failed} hide${failed === 1 ? "" : "s"} failed.`);
    this.renderGrid();
}
```

Idempotent: writing `hidden: true` on an already-hidden note is harmless.

---

## Task 8 — Add CSS for hidden-card visual treatment

**Files:** `styles.css`

Append after the `.bookmarker-card-broken` block:

```css
/* Card rendered while "Show hidden" is on. */
.bookmarker-card--hidden {
    opacity: 0.45;
}

.bookmarker-card-hidden-badge {
    position: absolute;
    bottom: 4px;
    right: 6px;
    padding: 1px 6px;
    border-radius: var(--radius-s);
    background: var(--background-modifier-cover);
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    text-transform: uppercase;
}

/* When a hidden card also has a broken badge, shift hidden badge to the left. */
.bookmarker-card--hidden .bookmarker-card-broken {
    right: 60px;
}

.bookmarker-hide-selected {
    color: var(--text-muted);
}
```

---

## Task 9 — Wire hidden badge and dim class in `renderCard()`

**Files:** `src/bookmark-view.ts`

In `renderCard()`, after the existing `if (item.broken)` badge block:

```ts
if (item.hidden && this.showHidden) {
    card.addClass("bookmarker-card--hidden");
    cover.createSpan({ cls: "bookmarker-card-hidden-badge", text: "hidden" });
}
```

This runs only when the card is visible (the toggle is on), so the class and
badge are never applied to invisible cards.

---

## Verification checklist (manual, no unit-test suite)

- `npx tsc -noEmit -skipLibCheck` passes.
- `npx eslint src/` passes (no `no-static-styles-assignment` violations).
- `npm run build` completes without error.
- Context menu on a visible card shows "Hide"; after clicking it the card
  disappears from the grid (toggle off) and the count decrements.
- Enabling "Show hidden" reveals the card dimmed with "hidden" badge.
- "Unhide" from context menu restores the card to normal.
- Selecting cards and clicking "Hide selected" hides all of them at once;
  the "Hide selected" button disappears after the selection clears.
- Category counts on the landing exclude hidden items when toggle is off.
- A card that is hidden AND broken: when shown, both the "broken" and "hidden"
  badges render; the "broken" badge shifts left per the CSS rule.
- Reopening the board resets `showHidden` to false (hidden cards not shown).
