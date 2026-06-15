# CLAUDE.md

## What is this project
Obsidian Bookmarker is a custom Obsidian plugin that captures web URLs as Markdown
bookmarks in the vault, with og:image preview, AI-proposed tags, and AI-proposed
destination subfolder.

## Stack
TypeScript, Obsidian Plugin API, esbuild (standard `obsidian-sample-plugin` scaffold).
Node for tooling, package manager: npm. Runtime npm deps for v1: none beyond `obsidian`.

## Commands
- Install: `npm install`
- Dev:     `npm run dev`      (esbuild watch)
- Build:   `npm run build`    (tsc type-check + esbuild production bundle)
- Type:    `tsc -noEmit -skipLibCheck`

## Architecture
Capture pipeline: validate URL → `requestUrl` fetch → DOMParser metadata extraction →
image download/fallback → classify → review modal → write note into chosen subfolder.
- Swappable `Classifier` interface: `ClaudeClassifier` (default, `claude-haiku-4-5`) with
  `HeuristicClassifier` (offline, zero-cost) as fallback.
- Free service layers, all default-on, all degrade gracefully: Microlink (image fallback),
  favicon fallback, Wayback archive snapshot.
- Root folder `_bookmarks`; categories = subfolders; assets in `_bookmarks/_assets/`.
- Settings via `PluginSettingTab` + `loadData`/`saveData`.

## Gotchas
- Mobile + desktop both supported (`isDesktopOnly: false`). Every constraint below exists
  to keep the bundle mobile-safe.
- HTTP: use Obsidian `requestUrl` for ALL network calls. Never `fetch`, Node `http`,
  `axios`, or `electron` (CORS + mobile break).
- HTML parsing: `new DOMParser()`. No cheerio/jsdom.
- File I/O: Obsidian vault API only (`vault.create`, `createBinary`, `createFolder`).
  No Node-only modules anywhere (`fs`, `path`, `child_process`, `electron`, `puppeteer`).
- Never log the API key or full request bodies. Key lives plaintext in `data.json`;
  the settings UI must warn about `.obsidian` sync.
