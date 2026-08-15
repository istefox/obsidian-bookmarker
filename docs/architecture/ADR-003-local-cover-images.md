# ADR-003 — Vault images as bookmark covers, stored as wikilinks

## Status

Accepted — 2026-08-02

## Context

Covers were remote-URL only. The `image` frontmatter key held an `og:image` URL
(usually wrapped in the wsrv.nl proxy), the board rendered it with
`<img src>` behind an `isSafeRemoteUrl` gate, and nothing ever wrote a binary into
the vault — the `_bookmarks/_assets/` folder described in `CLAUDE.md` had no
implementing code.

Issue #54 reports the consequence: sites like Instagram rotate their CDN thumbnail
paths, so a saved cover silently stops resolving and the card falls back to a bare
domain string. The reporter asked to point a bookmark at an image already stored in
their vault instead.

Two separate needs sit behind that request: choosing an arbitrary vault image as a
cover, and making an existing remote cover permanent. Both must work on mobile
(`isDesktopOnly: false`), so: Obsidian vault API only, `requestUrl` for network, no
Node modules.

## Decision

**Storage format — a wikilink string.** `image` holds either a remote URL (unchanged)
or an Obsidian wikilink, `"[[_bookmarks/_assets/foo.png]]"`. The wikilink form is
what makes the cover survive: Obsidian tracks frontmatter links
(`CachedMetadata.frontmatterLinks`) and rewrites them when the image is renamed or
moved. A plain vault path would break on the first reorganization.

The plugin assigns the plain JS string and lets the YAML emitter quote it. This is
not incidental: YAML 1.2 forbids a plain scalar from beginning with `[`, so any
conformant emitter produces `image: '[[…]]'`, which reads back as a string. Writing
the line by hand as `image: [[x]]` would parse back as the nested array `[["x"]]`.
`coverValue()` tolerates that shape anyway, so a hand-edited note still renders and
is repaired on the next plugin write.

**One resolution helper.** `src/cover.ts` owns `resolveCover(app, value, sourcePath)`,
returning `{kind: "remote" | "vault" | "none"}`. A wikilink resolves through
`metadataCache.getFirstLinkpathDest` and must land on a `TFile` with an image
extension; the result is rendered via `vault.getResourcePath`. Both readers — the
board card and the review-modal preview — go through it, so the two can never drift.
`sourcePath` is load-bearing: it disambiguates a shortest-form wikilink when two
images share a basename.

**Two entry points, both explicit.**
- *Set cover from vault…* — `ImageSuggestModal`, a `FuzzySuggestModal<TFile>` over
  every vault image, with the assets folder as a sort key rather than a filter.
  Also reachable from the review modal during capture.
- *Save cover to vault* — downloads the current remote cover once into
  `_bookmarks/_assets/` and repoints the note at it.

There is **no automatic download on capture**. Every download is a per-card action,
which is its own opt-in and needs no settings toggle.

**Download the origin, not the proxy.** The stored URL is normally the wsrv.nl
derivative (`w=1200&output=webp`, lossy). `unproxiedImage()` recovers the origin URL
so the archived bytes are the real image, and the proxy is retried only if the origin
refuses (hotlink protection). Putting a third party in the critical path of the one
operation whose purpose is removing third-party fragility would be self-defeating.

**Format from magic bytes.** The saved extension comes from the file signature, never
from `Content-Type`, which is attacker-controlled. An unrecognised payload is refused
rather than written under a fake extension. SVG has no signature and is markup, so it
cannot be downloaded — it stays available through the picker, where the user chose the
file themselves.

**Note body.** A local cover emits a native `![[image]]` embed and the `image` key is
dropped from the ` ```embed ` block, which cannot render a vault resource path. Remote
covers keep their previous output byte for byte.

**Refresh no longer destroys covers.** `applyRefresh` previously wrote
`f.image = ""` whenever a refetch produced nothing, so refreshing a note with a local
cover would erase it. It now writes `image` only with a non-empty valid value. This
also fixes the pre-existing case of a page that has since dropped its `og:image`. The
cost is that "None" in the refresh modal now means "leave it alone", so a *Remove
cover* context-menu action provides the explicit path to clear one.

**No new settings key.** The assets folder derives from the existing `rootFolder`, so
the two cannot disagree. `useImageProxy` keeps its exact meaning (render-time proxying
of remote covers); local covers bypass it by construction.

## Alternatives considered

### A: Download every cover automatically at capture time

Every bookmark would be permanently self-contained, with no user action at all.
Rejected: it grows the vault without consent, costs mobile bandwidth on every
capture, and creates an orphan-cleanup obligation when notes are deleted or merged.
The on-demand action delivers the same permanence for the covers the user actually
cares about.

### B: Store a plain vault path instead of a wikilink

`image: _bookmarks/_assets/foo.png` resolves with a single
`vault.getAbstractFileByPath` call and needs no wikilink parsing.
Rejected: Obsidian does not track plain paths, so renaming or moving the image
silently breaks the cover — reintroducing exactly the rot the feature exists to
eliminate.

### C: Reuse the existing "Cover URL" text field for vault paths

Let the user type `[[foo.png]]` into the field already present in the review modal.
Rejected: a field labelled "Cover URL" that also accepts wikilinks is a trap, and it
offers no discovery — the user cannot see which images they have. A picker costs one
small file and makes the feature findable.

## Consequences

**Positive**
- A cover backed by a vault image cannot rot, and follows the file through renames
  and moves with zero plugin code.
- One resolution path for both readers; adding a third reader is a one-line call.
- Refresh became non-destructive for remote covers too, fixing a bug that predates
  this feature.
- No new settings, no migration: existing notes hold remote URLs and keep working.

**Negative**
- First use of `vault.getResourcePath` in the codebase. It returns `app://…` on
  desktop and `capacitor://…` on mobile; both load in `<img src>`, but this is the
  one behaviour that must be confirmed on-device rather than reasoned about.
- `requestUrl` has no streaming API, so the 5 MB size guard runs on bytes already in
  memory. It protects the vault, not peak memory.
- The body rewrite is text surgery on the `embed` fence. It replaces an existing
  embed line rather than appending, so repeated saves do not stack, but a heavily
  hand-restructured note may not match the expected shape.
- Deleting or deduplicating a bookmark still leaves its downloaded asset behind.
  `organize-dedup` trashes the losing note only. Orphan cleanup is not implemented.
  *Closed by ADR-005 (issue #60): every deletion path now reclaims a downloaded cover
  nothing else references. Assets orphaned before that change stay where they are.*

**Neutral**
- `organize-dedup`'s richness score treats any non-empty `image` string as "has a
  cover", which is already correct for a wikilink; no change was needed.
- A wikilink pointing outside the vault is impossible: `getFirstLinkpathDest`
  resolves against the metadata cache and can only return a vault file.

## References

- Issue #54 — "Using local images for thumbnail photos"
- ADR-001 (no-backend, mobile-safe constraints)
- `src/cover.ts`, `src/image-suggest.ts`, `src/save-cover.ts` (new)
- `src/bookmark-view.ts`: `loadBookmarks`, `renderCard`, `showCardMenu`
- `src/note-writer.ts`: `buildNote`, `uniqueName`; `src/refresh-card.ts`: `applyRefresh`
