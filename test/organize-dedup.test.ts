import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { App, TFile } from "obsidian";
import {
	appendMergedContent,
	extractResidualBody,
	mergeCustomFrontmatter,
} from "../src/organize-dedup";

describe("mergeCustomFrontmatter", () => {
	it("copies a custom key the keeper does not have", () => {
		const keeperFm: Record<string, unknown> = { url: "https://a.example" };
		const victimFm: Record<string, unknown> = { url: "https://a.example", rating: 5 };
		mergeCustomFrontmatter(keeperFm, victimFm);
		assert.equal(keeperFm.rating, 5);
	});

	it("never overwrites a custom key the keeper already has", () => {
		const keeperFm: Record<string, unknown> = { rating: 3 };
		const victimFm: Record<string, unknown> = { rating: 5 };
		mergeCustomFrontmatter(keeperFm, victimFm);
		assert.equal(keeperFm.rating, 3);
	});

	it("never copies a known/structural key, regardless of keeper state", () => {
		const keeperFm: Record<string, unknown> = {};
		const victimFm: Record<string, unknown> = {
			broken: true,
			hidden: true,
			url: "https://victim.example",
		};
		mergeCustomFrontmatter(keeperFm, victimFm);
		assert.equal(keeperFm.broken, undefined);
		assert.equal(keeperFm.hidden, undefined);
		assert.equal(keeperFm.url, undefined);
	});

	it("is a no-op when the victim has no frontmatter", () => {
		const keeperFm: Record<string, unknown> = { url: "https://a.example" };
		mergeCustomFrontmatter(keeperFm, undefined);
		assert.deepEqual(keeperFm, { url: "https://a.example" });
	});
});

describe("extractResidualBody", () => {
	const standardBody = [
		"---",
		"url: https://example.com",
		"title: Example",
		"---",
		"",
		"# Example",
		"",
		"```embed",
		"title: Example",
		"image: https://example.com/cover.png",
		"```",
		"",
		"[example.com](https://example.com)",
		"",
		"## Notes",
		"- [2026-01-01] first note",
		"- [2026-01-02] second note",
		"",
	].join("\n");

	it("returns no residual for the standard title/embed/fallback-link/Notes-bullets structure", () => {
		assert.equal(extractResidualBody(standardBody), "");
	});

	it("returns an extra paragraph beyond the standard structure verbatim", () => {
		// Inserted before "## Notes" so it isn't swallowed by that section's scan
		// (content trailing the bullets with no heading boundary stays in-section,
		// which mirrors extractNotesBullets's own existing scan behavior).
		const body = [
			"---",
			"url: https://example.com",
			"title: Example",
			"---",
			"",
			"# Example",
			"",
			"```embed",
			"title: Example",
			"image: https://example.com/cover.png",
			"```",
			"",
			"[example.com](https://example.com)",
			"",
			"Some extra paragraph the user typed.",
			"",
			"## Notes",
			"- [2026-01-01] first note",
			"",
		].join("\n");
		assert.equal(extractResidualBody(body), "Some extra paragraph the user typed.");
	});

	it("returns an extra heading and its content beyond the standard structure verbatim", () => {
		const body = standardBody + "\n## Extra section\nExtra content under it.\n";
		assert.equal(
			extractResidualBody(body),
			["## Extra section", "Extra content under it."].join("\n"),
		);
	});

	it("returns only the content after the Notes section, not its already-merged bullets", () => {
		const body = standardBody + "\n## After Notes\nTrailing content.\n";
		const residual = extractResidualBody(body);
		assert.equal(residual, ["## After Notes", "Trailing content."].join("\n"));
		assert.doesNotMatch(residual, /first note|second note/);
	});

	it("treats a local-cover ![[wikilink]] embed line as structural, not residual", () => {
		const body = [
			"---",
			"url: https://example.com",
			"title: Example",
			"---",
			"",
			"# Example",
			"",
			"![[cover.png]]",
			"",
			"```embed",
			"title: Example",
			"description: A cover-card description",
			"```",
			"",
			"[example.com](https://example.com)",
			"",
			"## Notes",
			"- [2026-01-01] first note",
			"",
		].join("\n");
		assert.equal(extractResidualBody(body), "");
	});

	it("treats a body paragraph matching frontmatter description as structural, not residual", () => {
		const description = "Auto-fetched description text.";
		const body = [
			"---",
			"url: https://example.com",
			"title: Example",
			`description: ${description}`,
			"---",
			"",
			"# Example",
			"",
			description,
			"",
			"[example.com](https://example.com)",
			"",
		].join("\n");
		assert.equal(extractResidualBody(body, description), "");
	});

	it("still preserves a body paragraph that does not match frontmatter description", () => {
		const description = "Auto-fetched description text.";
		const body = [
			"---",
			"url: https://example.com",
			"title: Example",
			`description: ${description}`,
			"---",
			"",
			"# Example",
			"",
			"A description the user edited by hand.",
			"",
			"[example.com](https://example.com)",
			"",
		].join("\n");
		assert.equal(
			extractResidualBody(body, description),
			"A description the user edited by hand.",
		);
	});
});

describe("appendMergedContent", () => {
	it("lands both Notes bullets and residual content in the keeper's final body", async () => {
		let stored = ["---", "url: https://example.com", "---", "", "# Keeper", ""].join("\n");
		const fakeApp = {
			vault: {
				process: async (_file: TFile, fn: (data: string) => string) => {
					stored = fn(stored);
					return stored;
				},
			},
		} as unknown as App;
		const keeper = { path: "Keeper.md", basename: "Keeper" } as unknown as TFile;

		await appendMergedContent(
			fakeApp,
			keeper,
			["- [2026-01-01] a bullet"],
			"Residual text.",
			"Victim",
		);

		assert.match(stored, /## Notes\n- \[2026-01-01\] a bullet/);
		assert.match(stored, /## Merged from duplicate \(Victim\)\n\nResidual text\./);
	});
});
