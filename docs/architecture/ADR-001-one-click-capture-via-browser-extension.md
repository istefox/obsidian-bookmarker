# ADR-001 — One-click browser→Obsidian capture via a thin browser extension + protocol handler

## Status

Accepted — 2026-06-14

## Context

The plugin (`obsidian-bookmarker`, TypeScript, desktop + iOS/iPad, `requestUrl`,
no Node-only modules) must let a user save a web page as a bookmark with **one
click in the browser**, without copy-pasting the URL into a modal. The current
M1/M2 flow (open a modal, paste a URL, submit) was judged too primitive.

Constraints and requirements:

- Cross-platform: must work on desktop and on iOS/iPad. Browser extensions do not
  exist on iOS, so the mobile path cannot depend on one.
- Personal-first tool; minimise moving parts, hosting, and maintenance.
- The heavy capture chain (fetch HTML, DOMParser metadata, og:image download, AI
  tag/folder classification, note writing) already exists in the plugin (M2) and
  must stay there to avoid duplicating logic.
- The brief already planned `registerObsidianProtocolHandler("bookmark", …)` for M5.
- Prior art surveyed: **LinkStowr** (Chrome extension → proprietary Rust/SurrealDB
  cloud backend-queue → plugin pulls via Access Token; MIT, but the backend repo is
  archived as of 2025-06 and exposes no third-party integration hooks); the official
  **Obsidian Web Clipper** (extension → `obsidian://new` URI + clipboard handoff,
  not extensible by third-party plugins); the **Local REST API** community plugin
  (extension → `localhost` HTTPS, desktop-only).

The user explicitly stated that **silent/offline capture is not required** — it is
acceptable for the click to bring Obsidian to the foreground and require it to be
running or launchable.

## Decision

Adopt a **thin browser extension + `obsidian://` protocol handler**, with no
backend service:

- A new first-class component, a **Manifest V3 browser extension** (in `extension/`),
  exposes a toolbar action. On click it reads the active tab's URL (and optionally
  title) and navigates to `obsidian://bookmark?url=<encoded>`.
- The Obsidian plugin registers `registerObsidianProtocolHandler("bookmark", …)`
  which invokes the existing `captureBookmark` chain with the received URL. This is
  pulled earlier in the roadmap (**M2.5**) so one-click works before M3/M4.
- **Mobile** reuses the same URI: an Apple Shortcut on the iOS/iPad Share Sheet calls
  `obsidian://bookmark?url=…`. No mobile code is shipped, only documentation.
- The heavy chain stays entirely **inside the plugin**; the extension only captures
  the URL and hands off. The plugin remains the single source of truth.

## Alternatives considered

### B) LinkStowr-style cloud backend-queue — rejected
Extension → our own hosted service that queues links → plugin pulls on sync. The
only capability it adds over Strada A is silent capture while Obsidian is closed,
no app-switch, and a cross-device queue independent of vault sync. Rejected because
the user does not require silent/offline capture, and it imposes a large, ongoing
burden: server, authentication, hosting, and the privacy exposure of routing every
saved URL (and potentially the API key flow) through an external service. For a
personal-first tool, Obsidian's own vault sync already carries finished notes
across devices. Integrating with LinkStowr's existing backend was also rejected: it
offers no third-party hooks and its backend is archived.

### C) Local REST API community plugin — rejected
Extension POSTs to `https://127.0.0.1:27124/` exposed by the
`obsidian-local-rest-api` plugin. Avoids app-switch and needs no cloud, but is
**desktop-only** (no iOS), forces users to install and configure a *second* plugin,
and would push part of the capture chain into the extension. Fails the cross-platform
requirement and adds user friction.

## Consequences

**Positive**
- Minimal surface: one thin extension + one small protocol handler; the existing M2
  chain is reused unchanged.
- True one-click on desktop, no copy-paste.
- One transport (`obsidian://bookmark`) serves both desktop (extension) and mobile
  (Apple Shortcut) — no divergent code paths.
- No backend means no server cost, no auth system, no extra privacy exposure.
- Reuses work already scoped in the brief (the M5 protocol handler), just earlier.

**Negative / accepted tradeoffs**
- Clicking the extension **switches focus to Obsidian** (app-switch) and requires
  Obsidian to be running or launchable. Accepted by the user.
- Passing data through the URI has practical length limits; we pass only the URL
  (the plugin re-fetches everything else), so this is not a constraint today.
- iOS Share Sheet / Shortcut paths are documented as occasionally unreliable; the
  mobile experience is best-effort, not guaranteed 100% capture.
- A browser extension is a new artifact to build, test, and (if published) submit to
  the Chrome Web Store / Firefox AMO, each with its own review process.

**Neutral**
- The extension is intentionally "dumb"; if richer capture is ever needed (e.g.
  selected text, full-page content), it can be extended without changing the plugin
  contract beyond adding URI parameters.

## References

- Build brief: `~/Downloads/20260613_ObsidianBookmarker_Brief_v1.md` (§4 entry points,
  §11 milestones — protocol handler originally M5)
- M2 capture chain: `src/capture.ts`, `src/metadata.ts`, `src/note-writer.ts`
- `registerObsidianProtocolHandler` — https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerObsidianProtocolHandler
- Obsidian URI — https://obsidian.md/help/Extending+Obsidian/Obsidian+URI
- LinkStowr — https://github.com/joelseq/obsidian-linkstowr (extension https://github.com/joelseq/linkstowr-extension, archived backend https://github.com/joelseq/linkstowr-api)
- Official Obsidian Web Clipper — https://github.com/obsidianmd/obsidian-clipper
- Local REST API — https://github.com/coddingtonbear/obsidian-local-rest-api
