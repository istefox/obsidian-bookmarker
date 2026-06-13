## Status (2026-06-14)
**Branch:** main (pushed to github.com/istefox/obsidian-bookmarker, public)
**Last commit:** 8cc6100 — chore(scaffold): set up Obsidian Bookmarker plugin (M1)
**In progress:** M2 capture pipeline — code complete, not yet committed.
**Done (M2):** src/metadata.ts (requestUrl fetch + DOMParser parse + excerpt), src/note-writer.ts
(slug/dedup, image download to _assets, §5 frontmatter+body, folder ensure), src/capture.ts
(orchestrator), main.ts command wired to pipeline. Type-check green; NOT yet runtime-tested in Obsidian.
**Next:** commit M2, then M3 — folder/tag taxonomy + ClaudeClassifier + review modal population.
**Open decisions:** confirm plugin id `obsidian-bookmarker` and `minAppVersion` 1.5.0 (brief §14).
**Notes:** M2 verified at type/build level only — load into a vault to confirm fetch/write end-to-end.
1 high-sev npm advisory on esbuild dev-server (not used in plugin builds), left unfixed.
