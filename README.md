# Bookmarker for Obsidian

Save any web page into your Obsidian vault as a clean Markdown note, with a preview image, AI-proposed tags, and an AI-proposed destination folder. It works on desktop and mobile, keeps everything inside the vault, and runs no backend of its own.

The goal is a Raindrop-style bookmarking experience that lives entirely in plain Markdown files you own.

## What it does

- **One-click capture.** Save the current browser tab through a small companion extension, or trigger a capture from inside Obsidian. On iOS/iPad the same path works from the Share Sheet via an Apple Shortcut.
- **AI tags and folder.** A Claude classifier reads the page and proposes tags plus a destination subfolder, reusing the tags and folders already in your vault instead of inventing a fresh taxonomy. An offline heuristic mode is available with no API key.
- **Review before saving.** A review window lets you edit the title, tags, and destination folder before the note is written. Turn it off for a silent one-click save.
- **Preview images.** Bookmarker extracts the page's Open Graph, Twitter, and JSON-LD image, falls back to a Microlink screenshot when a page exposes none, and can serve images through the wsrv.nl cache/proxy. A cover picker in the review window lets you choose among candidates or paste a custom image URL.
- **Board view.** A grid of cover cards for everything you saved, with filters by tag, folder, domain, and type, plus a favorites flag. Right-click a card to open its URL in the browser, move it to another category (an existing one or a new folder you name), regenerate its tags, or delete it.
- **Duplicate awareness.** Before saving it checks whether the URL is already bookmarked: an exact match is blocked, a same-page-different-tracking match is flagged, and other pages from the same domain raise a quiet notice with a link to them.
- **Type detection and favorites.** Each bookmark is tagged as an article, video, image, document, audio, or link, and can be starred.
- **Broken-link checker.** An on-demand command tests every saved URL and flags dead ones in frontmatter. It is deliberately conservative: only a 404/410 or a network failure counts as broken, so anti-bot 403/429 and 5xx responses are left alone.
- **Organize.** Bulk tidying for a collection that has grown messy: deduplicate notes that point to the same URL, re-tag in batches, move misfiled bookmarks to a better folder, and remediate dead links by archiving, moving, or marking them. Every operation previews its changes and applies only what you approve.
- **Import.** Pull your whole Raindrop library straight from the Raindrop API, covers and collections included, with a token set in settings. You can also bring in a Pocket, Raindrop, or browser HTML export, or a Raindrop CSV.

Several helpers degrade gracefully and stay out of the way: a favicon fallback service, an optional Wayback Machine snapshot, and the image proxy can each be turned off.

## How a note looks

Every bookmark is a Markdown file with YAML frontmatter and an optional preview card:

```markdown
---
url: https://example.com/article
title: The article title
description: A short summary pulled from the page.
created: 2026-06-14T10:00:00.000Z
domain: example.com
type: article
favorite: false
tags:
  - reading
  - research
image: https://wsrv.nl/?url=...
favicon: https://example.com/favicon.ico
archive: ""
source: obsidian-bookmarker
---

# The article title

```embed
title: The article title
image: https://wsrv.nl/?url=...
description: A short summary pulled from the page.
url: https://example.com/article
favicon: https://example.com/favicon.ico
aspectRatio: 1.91
```

[example.com](https://example.com/article)
```

The fallback link at the bottom works even without a preview plugin installed.

## Requirements

- Obsidian 1.7.2 or newer, desktop or mobile.
- An Anthropic API key for the Claude classifier. This is optional: the heuristic mode classifies offline with no key.
- The [obsidian-link-embed](https://github.com/Seraphli/obsidian-link-embed) community plugin to render preview cards. Without it the note still saves, showing the raw embed block and the fallback link. The plugin settings include an install button for it.

## Install

From inside Obsidian: open Settings, go to Community plugins, Browse, search for "Bookmarker", and install. Then enable it.

To install manually instead:

1. Download `main.js`, `manifest.json`, and `styles.css` from a [release](https://github.com/istefox/obsidian-bookmarker/releases).
2. Copy them into `<your vault>/.obsidian/plugins/bookmarker/`.
3. Enable Bookmarker in Community plugins, then reload.

### Browser extension (desktop one-click)

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/gmpfgkokpoblhaajglclanlmfnldoiee) (Chrome, Edge, Brave, Arc). Click its toolbar button on any page and Obsidian saves the bookmark.

The `extension/` folder also holds the source. To run it unpacked for development: Chrome `chrome://extensions` → Developer mode → Load unpacked → select `extension/`. The button opens `obsidian://bookmark?url=<current tab>`, which hands the URL to the plugin. See `extension/README.md` for details.

### Mobile (iOS/iPad)

No extension is needed. Make an Apple Shortcut on the Share Sheet that opens `obsidian://bookmark?url=` followed by the shared URL. The plugin handles the rest.

## Usage

- **Bookmark a URL**: command palette entry. Opens the capture window, prefilled if your clipboard holds a link.
- **Open bookmarks board**: ribbon icon and command. Opens the grid view.
- **Check for broken links**: command that scans every saved bookmark and flags dead URLs.
- **Import bookmarks…**: command that opens the import window for an HTML or CSV file.
- **Import from Raindrop**: command that pulls every bookmark from your Raindrop account through the API, with covers and collections. Set the token in settings first.

### Organize

Four commands tidy a collection that has grown messy. Each one scans, shows a review window where every proposed change has a checkbox, and applies only what you keep checked.

- **Deduplicate bookmarks**: groups notes that point to the same URL (ignoring trackers, `www.`, and trailing slashes), keeps the richest note in each group, merges the others' tags, notes, and favorite flag into it, then deletes the duplicates you confirm.
- **Bulk re-tag selected bookmarks**: re-runs the classifier and replaces tags, showing the old set next to the new one.
- **Suggest folder moves for selected bookmarks**: proposes a better subfolder for notes that look misfiled and moves the ones you approve.
- **Clean up broken links**: finds dead URLs and offers a per-item fix: swap in a Wayback Machine snapshot, move the note to a `_broken` folder, or mark it with a `broken` flag and a `#broken` tag. Nothing is deleted.

The two AI commands work on the cards you tick on the board (each card has a selection checkbox, with Select all / Select none in the toolbar). With nothing selected they fall back to the cards currently visible under your filters. A batch cap keeps a single run bounded; re-run to continue.

On the board, right-click a card for its actions: open URL, move to category, regenerate tags, delete.

## Settings

The settings tab covers the classifier (mode, model, API key), the vault layout (root folder, default `_bookmarks`), preview behavior (image proxy, screenshot fallback), the free service layers (favicon, Wayback), classification behavior (allow new tags, allow new folders, duplicate and same-domain warnings, max tags, excerpt length), the Organize commands (batch cap, broken-link folder, default broken-link remediation), and a Raindrop API token for the Raindrop import. The API key and token fields each have a Test button to check they work.

## Privacy

- The Anthropic API key is stored in plaintext in `.obsidian/plugins/bookmarker/data.json`. If you sync your `.obsidian` folder, the key syncs with it. Exclude that file from sync.
- The Claude classifier sends the page title, description, and a text excerpt to the Anthropic API. Use the heuristic mode to keep everything offline.
- The image proxy (wsrv.nl) and the screenshot fallback (Microlink) see the image and page URLs you save. Both are optional and can be turned off in settings.

## How it is built

The capture pipeline is: validate the URL, fetch the HTML with Obsidian's `requestUrl`, extract metadata with `DOMParser`, resolve a preview image, classify, optionally review, then write the note into the chosen subfolder. All network and file access goes through the Obsidian API so the plugin stays mobile-safe, with no Node-only modules. The classifier is a swappable interface with Claude and heuristic implementations. ADR-001 in `docs/architecture/` records the one-click capture design.

## Development

```bash
npm install
npm run dev     # esbuild watch
npm run build   # type-check + production bundle
```

Type-check on its own: `npx tsc -noEmit -skipLibCheck`.

## License

MIT. See [LICENSE](LICENSE).
