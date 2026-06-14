## Status (2026-06-14)
**Branch:** feat/m2-capture-pipeline (off main; remote main = github.com/istefox/obsidian-bookmarker, public)
**Last commit:** a374e1e — feat(extension): one-click capture browser extension
**In progress:** M3 (classifier + review modal + link-embed image) — code complete, reviewed, committing.
**Done:** M1/M2/M2.5 + hardening; EX1 extension (extension/, committed a374e1e, one-click verified).
M3: src/classifier.ts (Claude + heuristic fallback), src/taxonomy.ts (vault tags + subfolders),
src/review-modal.ts (edit title/tags/folder), note-writer now writes an obsidian-link-embed ```embed
card by external URL (no _assets/no local files), settings gain alwaysReview, drop assetSubfolder.
**Next:** M4 — Microlink/favicon/Wayback fallbacks; consider duplicate-URL detection.
**Open decisions:** confirm plugin id + minAppVersion (brief §14).
**Notes:** card preview needs the obsidian-link-embed community plugin installed; without it the note
shows the raw ```embed block + a fallback [domain](url) link. Type-check/build green; M3 reviewer pass
applied (heuristic-confidence fix, Claude-fallback Notice, normalizePath, SSRF guard on modal img).
