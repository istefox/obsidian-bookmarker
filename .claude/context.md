## Status (2026-06-14)
**Branch:** feat/m2-capture-pipeline (off main; remote main = github.com/istefox/obsidian-bookmarker, public)
**Last commit:** 51f838e — feat(preview): candidate extraction, Microlink screenshot, cover picker (NOT pushed yet)
**Done:** M1/M2/M2.5 + hardening; EX1 extension; M3 (classifier + review modal + link-embed card);
prompt tuning; Note name field; preview images (extraction chain → Microlink synchronous screenshot
→ wsrv.nl proxy → cover picker in modal with candidate thumbnails + None + custom Cover URL).
Verified in TEST: Amazon now shows a real Microlink screenshot, proxied via wsrv.nl.
**Direction:** make it Raindrop-like. ADR-001 = thin extension + obsidian://bookmark, no backend.
**Roadmap (user-approved, queued):** 1) grid/cover dashboard view (ItemView with cover cards + filters
by tag/folder/domain/type) — the big "Raindrop feeling" item; 2) duplicate-URL detection (normalize URL,
warn if already saved); 3) type detection (article/video/image/doc) + favorites flag; 4) broken-link
checker (on-demand command) + import from Pocket/Raindrop HTML/CSV.
**Out of scope (needs backend):** full-text content search, web archive, AI search, collaboration/public/RSS.
**Open decisions:** confirm plugin id `obsidian-bookmarker` + minAppVersion 1.5.0 (brief §14).
**Notes:** card preview needs obsidian-link-embed installed (Settings → Preview has install button).
Settings: useImageProxy + enableScreenshotFallback (both default ON, new keys). Reload plugin after each
build copy into TEST. /humanize-en required on all commit messages (public repo).
