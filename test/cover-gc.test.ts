import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import type BookmarkerPlugin from "../src/main";
import { trashBookmarks } from "../src/cover-gc";
import { recordDownloadedAsset } from "../src/save-cover";
import { DEFAULT_SETTINGS, type BookmarkerSettings } from "../src/settings";

/**
 * Regression coverage for BM-002: cover-gc used to decide "is this ours to
 * delete" purely from folder location (anything under `_assets/`), which could
 * silently trash a user's own image. Ownership is now tracked explicitly via
 * `settings.downloadedAssets`, populated only by `saveCoverToVault`.
 */

function makeFile(path: string, extension: string): TFile {
	const file = new TFile();
	file.path = path;
	file.extension = extension;
	file.basename = path.split("/").pop()!.replace(/\.[^.]+$/, "");
	return file;
}

interface FakeAppOptions {
	fileCache: Map<string, { frontmatter?: Record<string, unknown> }>;
	files: Map<string, TFile>;
	markdownFiles: TFile[];
	trashed: string[];
}

function makeApp(opts: FakeAppOptions): App {
	return {
		metadataCache: {
			getFileCache: (file: TFile) => opts.fileCache.get(file.path),
			getFirstLinkpathDest: (linkpath: string) => opts.files.get(linkpath) ?? null,
			resolvedLinks: {},
		},
		vault: {
			getMarkdownFiles: () => opts.markdownFiles,
		},
		fileManager: {
			trashFile: async (file: TFile) => {
				opts.trashed.push(file.path);
			},
		},
	} as unknown as App;
}

function makePlugin(
	app: App,
	settings: BookmarkerSettings,
): { plugin: BookmarkerPlugin; saveCalls: { count: number } } {
	const saveCalls = { count: 0 };
	const plugin = {
		app,
		settings,
		saveSettings: async () => {
			saveCalls.count++;
		},
	} as unknown as BookmarkerPlugin;
	return { plugin, saveCalls };
}

test("cover-gc: a cover under _assets/ not present in the registry is not swept", async () => {
	// The core BM-002 regression: folder location alone must never imply ownership.
	const note = makeFile("_bookmarks/note.md", "md");
	const userPicked = makeFile("_bookmarks/_assets/user-picked.png", "png");
	const settings: BookmarkerSettings = { ...DEFAULT_SETTINGS, downloadedAssets: [] };
	const trashed: string[] = [];
	const app = makeApp({
		fileCache: new Map([[note.path, { frontmatter: { image: `[[${userPicked.path}]]` } }]]),
		files: new Map([[userPicked.path, userPicked]]),
		markdownFiles: [note],
		trashed,
	});
	const { plugin } = makePlugin(app, settings);

	const result = await trashBookmarks(plugin, [note]);

	assert.equal(result.trashed.length, 1);
	assert.equal(result.coversRemoved, 0);
	assert.ok(!trashed.includes(userPicked.path));
});

test("cover-gc: trashBookmarks reclaims a registered cover, updates the registry, and leaves a user-picked cover alone", async () => {
	const note1 = makeFile("_bookmarks/note1.md", "md");
	const note2 = makeFile("_bookmarks/note2.md", "md");
	const owned = makeFile("_bookmarks/_assets/owned.png", "png");
	const userPicked = makeFile("_bookmarks/_assets/user-picked.png", "png");
	const settings: BookmarkerSettings = {
		...DEFAULT_SETTINGS,
		downloadedAssets: [owned.path],
	};
	const trashed: string[] = [];
	const app = makeApp({
		fileCache: new Map([
			[note1.path, { frontmatter: { image: `[[${owned.path}]]` } }],
			[note2.path, { frontmatter: { image: `[[${userPicked.path}]]` } }],
		]),
		files: new Map([
			[owned.path, owned],
			[userPicked.path, userPicked],
		]),
		markdownFiles: [note1, note2],
		trashed,
	});
	const { plugin, saveCalls } = makePlugin(app, settings);

	const result = await trashBookmarks(plugin, [note1, note2]);

	assert.equal(result.trashed.length, 2);
	assert.equal(result.failed, 0);
	assert.equal(result.coversRemoved, 1);
	assert.ok(trashed.includes(owned.path));
	assert.ok(!trashed.includes(userPicked.path));
	assert.deepEqual(settings.downloadedAssets, []);
	assert.ok(saveCalls.count >= 1);
});

test("recordDownloadedAsset dedupes and reports whether it persisted", () => {
	const settings: BookmarkerSettings = { ...DEFAULT_SETTINGS, downloadedAssets: [] };
	const path = "_bookmarks/_assets/a.png";

	assert.equal(recordDownloadedAsset(settings, path), true);
	assert.deepEqual(settings.downloadedAssets, [path]);

	assert.equal(recordDownloadedAsset(settings, path), false);
	assert.deepEqual(settings.downloadedAssets, [path]);
});
