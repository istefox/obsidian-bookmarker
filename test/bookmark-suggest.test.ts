import { test } from "node:test";
import assert from "node:assert/strict";
import type { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../src/settings";
import { listBookmarkFiles } from "../src/bookmark-suggest";

function fakeFile(path: string, basename: string): TFile {
	return { path, basename } as unknown as TFile;
}

interface FakeFrontmatter {
	source?: string;
	title?: string;
	hidden?: boolean;
}

/** Minimal App stand-in driving listBookmarkFiles: a vault listing plus a frontmatter map. */
function fakeApp(files: TFile[], frontmatterByPath: Map<string, FakeFrontmatter>): App {
	return {
		vault: {
			getMarkdownFiles: () => files,
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const fm = frontmatterByPath.get(file.path);
				return fm ? { frontmatter: fm } : null;
			},
		},
	} as unknown as App;
}

test("listBookmarkFiles unconditionally excludes hidden bookmark notes", () => {
	const visible = fakeFile("_bookmarks/visible.md", "visible");
	const hidden = fakeFile("_bookmarks/hidden.md", "hidden");
	const frontmatter = new Map<string, FakeFrontmatter>([
		[visible.path, { source: "obsidian-bookmarker", title: "Visible" }],
		[hidden.path, { source: "obsidian-bookmarker", title: "Hidden", hidden: true }],
	]);
	const app = fakeApp([visible, hidden], frontmatter);

	const refs = listBookmarkFiles(app, DEFAULT_SETTINGS);

	assert.deepEqual(
		refs.map((r) => r.file.path),
		[visible.path],
	);
});

test("listBookmarkFiles has no showHidden/session parameter — hidden always means excluded", () => {
	// A function with only (app, settings) params cannot be called with a third
	// argument in a type-checked call; this is a compile-time guarantee, asserted
	// here by checking the declared arity.
	assert.equal(listBookmarkFiles.length, 2);
});
