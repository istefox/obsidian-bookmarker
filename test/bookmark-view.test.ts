import { test } from "node:test";
import assert from "node:assert/strict";
import type { TFile } from "obsidian";
import type { BookmarkItem } from "../src/bookmark-data";
import { visibleItems } from "../src/bookmark-view";

// Minimal stand-in: only `path` is read by the assertions below.
function fakeFile(path: string): TFile {
	return { path } as unknown as TFile;
}

function makeItem(overrides: Partial<BookmarkItem> & { file: TFile }): BookmarkItem {
	return {
		title: "",
		url: "",
		image: "",
		favicon: "",
		tags: [],
		domain: "",
		folder: "",
		created: "",
		modified: 0,
		type: "link",
		favorite: false,
		broken: false,
		hidden: false,
		description: "",
		...overrides,
	};
}

test("visibleItems drops hidden items when showHidden is false, hiding their tag/folder/type", () => {
	const visible = makeItem({
		file: fakeFile("a.md"),
		tags: ["public-tag"],
		folder: "Work",
		type: "link",
	});
	const hidden = makeItem({
		file: fakeFile("b.md"),
		hidden: true,
		tags: ["secret-tag"],
		folder: "Private",
		type: "note",
	});

	const shown = visibleItems([visible, hidden], false);

	assert.deepEqual(
		shown.map((i) => i.file.path),
		["a.md"],
	);
	// The tag/folder/type that exist ONLY on the hidden item must not surface anywhere
	// the board derives its tag panel / folder dropdown / type dropdown from this list.
	assert.ok(!shown.some((i) => i.tags.includes("secret-tag")));
	assert.ok(!shown.some((i) => i.folder === "Private"));
	assert.ok(!shown.some((i) => i.type === "note"));
});

test("visibleItems keeps hidden items when showHidden is true", () => {
	const visible = makeItem({
		file: fakeFile("a.md"),
		tags: ["public-tag"],
		folder: "Work",
		type: "link",
	});
	const hidden = makeItem({
		file: fakeFile("b.md"),
		hidden: true,
		tags: ["secret-tag"],
		folder: "Private",
		type: "note",
	});

	const shown = visibleItems([visible, hidden], true);

	assert.deepEqual(
		shown.map((i) => i.file.path).sort(),
		["a.md", "b.md"],
	);
	assert.ok(shown.some((i) => i.tags.includes("secret-tag")));
	assert.ok(shown.some((i) => i.folder === "Private"));
	assert.ok(shown.some((i) => i.type === "note"));
});
