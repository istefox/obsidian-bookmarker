## Status (2026-06-14)
**Branch:** main (not yet a git repo)
**In progress:** M1 scaffold — done.
**Done:** manifest/esbuild/tsconfig scaffold, settings tab (§8 schema + privacy warning),
"Bookmark a URL" command with clipboard prefill, capture modal with manual URL entry + validation.
Build green (`npm run build`), type-check gate in `.claude/test-cmd`.
**Next:** M2 — `requestUrl` fetch + DOMParser metadata extraction + image download + note writing into root.
**Open decisions:** confirm plugin id `obsidian-bookmarker` and `minAppVersion` 1.5.0 (brief §14 assumptions).
**Notes:** 1 high-sev npm advisory on esbuild dev-server (not used in plugin builds) — left unfixed to avoid a breaking major bump.
