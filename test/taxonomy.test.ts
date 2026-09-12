import { test } from "node:test";
import assert from "node:assert/strict";
import { App, TFolder } from "obsidian";
import { isInternalFolder, internalFolderPaths, readTaxonomy } from "../src/taxonomy";

// BM-009: internal-folder-path computation is pure and fully testable.
test("internalFolderPaths: resolves the assets folder and the configured broken folder under root", () => {
	const paths = internalFolderPaths("_bookmarks", "_broken");
	assert.deepEqual(paths.sort(), ["_bookmarks/_assets", "_bookmarks/_broken"].sort());
});

test("internalFolderPaths: honors a user-customized broken-folder name", () => {
	const paths = internalFolderPaths("_bookmarks", "Broken Links");
	assert.ok(paths.includes("_bookmarks/Broken Links"));
});

test("isInternalFolder: exact match is internal", () => {
	assert.equal(isInternalFolder("_bookmarks/_assets", ["_bookmarks/_assets"]), true);
});

test("isInternalFolder: nested descendant of an internal folder is also internal", () => {
	assert.equal(isInternalFolder("_bookmarks/_assets/sub", ["_bookmarks/_assets"]), true);
});

test("isInternalFolder: a folder that merely shares a prefix is NOT internal", () => {
	// "_bookmarks/_assets-archive" must not be treated as nested under "_bookmarks/_assets".
	assert.equal(isInternalFolder("_bookmarks/_assets-archive", ["_bookmarks/_assets"]), false);
});

test("isInternalFolder: an ordinary user folder is not internal", () => {
	assert.equal(isInternalFolder("_bookmarks/tech/ai", ["_bookmarks/_assets", "_bookmarks/_broken"]), false);
});

// readTaxonomy/readSubfolders walk a live Obsidian TFolder tree; exercised here
// against the stub TFolder/App from test/stubs/obsidian.js (see that file's
// header for why a stub is needed at all). This covers the folder-walking logic
// itself, not real Obsidian vault behavior.
function makeFolder(path: string, children: unknown[] = []): TFolder {
	const folder = new TFolder();
	(folder as unknown as { path: string }).path = path;
	(folder as unknown as { children: unknown[] }).children = children;
	return folder;
}

test("readTaxonomy: excludes _assets and the broken-folder from the offered taxonomy", () => {
	const assets = makeFolder("_bookmarks/_assets");
	const broken = makeFolder("_bookmarks/_broken");
	const tech = makeFolder("_bookmarks/tech", [makeFolder("_bookmarks/tech/ai")]);
	const root = makeFolder("_bookmarks", [assets, broken, tech]);

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (p === "_bookmarks" ? root : null),
		},
		metadataCache: {
			getTags: () => ({}),
		},
	} as unknown as App;

	const taxonomy = readTaxonomy(app, "_bookmarks", "_broken");
	assert.deepEqual(taxonomy.folders, ["tech", "tech/ai"]);
});

test("readTaxonomy: an ordinary folder that is not the internal pair is kept", () => {
	const custom = makeFolder("_bookmarks/_archive-of-mine");
	const root = makeFolder("_bookmarks", [custom]);

	const app = {
		vault: {
			getAbstractFileByPath: (p: string) => (p === "_bookmarks" ? root : null),
		},
		metadataCache: {
			getTags: () => ({}),
		},
	} as unknown as App;

	const taxonomy = readTaxonomy(app, "_bookmarks", "_broken");
	assert.deepEqual(taxonomy.folders, ["_archive-of-mine"]);
});
