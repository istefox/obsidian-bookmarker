## Status (2026-06-14)
**Branch:** feat/m2-capture-pipeline (off main; remote main = github.com/istefox/obsidian-bookmarker, public)
**Last commit:** 70d1d94 — feat(capture): implement M2 fetch and note-writing pipeline
**In progress:** M2.5 protocol handler — implemented + installed in TEST, committing now.
**Done:** M2 chain + hardening (47397a5: url-safety SSRF guard, stringifyYaml, sanitize). ADR-001
accepted (thin extension + obsidian://bookmark, no backend). M2.5: registerObsidianProtocolHandler
("bookmark") runs captureBookmark with http(s) validation; isHttpUrl extracted to url-safety, reused in modal.
**Next:** EX1 — Manifest V3 browser extension in extension/ (goes through plan mode).
**Open decisions:** confirm plugin id `obsidian-bookmarker` and `minAppVersion` 1.5.0 (brief §14).
**Notes:** M2 build installed in TEST vault (.obsidian/plugins/obsidian-bookmarker); not yet runtime-confirmed.
1 high-sev npm advisory on esbuild dev-server (not used in plugin builds), left unfixed.
