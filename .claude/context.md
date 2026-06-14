## Status (2026-06-14)
**Branch:** feat/m2-capture-pipeline (off main; remote main = github.com/istefox/obsidian-bookmarker, public)
**Last commit:** 70d1d94 — feat(capture): implement M2 fetch and note-writing pipeline
**In progress:** M2 security hardening + ADR-001 (one-click architecture) — committing now.
**Done:** M2 chain (capture/metadata/note-writer). Hardening: src/url-safety.ts SSRF guard,
stringifyYaml frontmatter, control-char sanitize. ADR-001 accepted: thin browser extension +
obsidian://bookmark protocol handler, no backend (alternatives B cloud-queue / C Local REST API rejected).
**Next:** M2.5 — registerObsidianProtocolHandler("bookmark", …) in main.ts (unblocks one-click).
Then EX1 — Manifest V3 browser extension in extension/ (goes through plan mode).
**Open decisions:** confirm plugin id `obsidian-bookmarker` and `minAppVersion` 1.5.0 (brief §14).
**Notes:** M2 build installed in TEST vault (.obsidian/plugins/obsidian-bookmarker); not yet runtime-confirmed.
1 high-sev npm advisory on esbuild dev-server (not used in plugin builds), left unfixed.
