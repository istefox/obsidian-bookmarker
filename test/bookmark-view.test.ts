import { test } from "node:test";
import assert from "node:assert/strict";
import { TFile } from "obsidian";
import type { BookmarkItem } from "../src/bookmark-data";
import {
	BookmarkFilterOptions,
	computeRelatedItems,
	matchesFilters,
	visibleItems,
} from "../src/bookmark-view";

// Minimal stand-in: only `path` is read by the assertions below.
function fakeFile(path: string): TFile {
	return { path } as unknown as TFile;
}

// Regression cases for BM-011: `filtered()` used to hand related-bookmarks mode
// straight to `relatedItems()`, bypassing every other active filter (search,
// category scope, domain/folder/type, favorites/broken-only, tag filter). The
// shared predicate below is now applied in both modes, before ranking/slicing.

function makeItem(overrides: Partial<BookmarkItem> = {}): BookmarkItem {
	const file = new TFile();
	file.path = overrides.file?.path ?? `${overrides.title ?? "item"}.md`;
	return {
		file,
		title: "Item",
		url: "https://example.com/page",
		image: "",
		favicon: "",
		tags: [],
		domain: "example.com",
		folder: "",
		created: "2026-01-01T00:00:00.000Z",
		modified: 0,
		type: "article",
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

function baseOpts(overrides: Partial<BookmarkFilterOptions> = {}): BookmarkFilterOptions {
	return {
		search: "",
		searchScope: "category",
		activeCategory: null,
		domainFilter: "",
		folderFilter: "",
		typeFilter: "",
		favoritesOnly: false,
		brokenOnly: false,
		tagFilter: "",
		showHidden: false,
		...overrides,
	};
}

void test("matchesFilters: search terms must all appear (AND, case-insensitive)", () => {
	const item = makeItem({ title: "Deep Learning Notes", description: "" });
	assert.equal(matchesFilters(item, baseOpts({ search: "deep notes" })), true);
	assert.equal(matchesFilters(item, baseOpts({ search: "deep missing" })), false);
});

void test("matchesFilters: category scope excludes items outside the active category", () => {
	const item = makeItem({ folder: "Reading" });
	assert.equal(
		matchesFilters(item, baseOpts({ searchScope: "category", activeCategory: "Reading" })),
		true,
	);
	assert.equal(
		matchesFilters(item, baseOpts({ searchScope: "category", activeCategory: "Videos" })),
		false,
	);
	// Global scope ignores the active category entirely.
	assert.equal(
		matchesFilters(item, baseOpts({ searchScope: "global", activeCategory: "Videos" })),
		true,
	);
});

void test("matchesFilters: domainFilter matches the normalized domain (www. stripped)", () => {
	const item = makeItem({ domain: "www.example.com" });
	assert.equal(matchesFilters(item, baseOpts({ domainFilter: "example.com" })), true);
	assert.equal(matchesFilters(item, baseOpts({ domainFilter: "other.com" })), false);
});

void test("matchesFilters: folderFilter excludes items in a different folder", () => {
	const item = makeItem({ folder: "Reading" });
	assert.equal(matchesFilters(item, baseOpts({ folderFilter: "Reading" })), true);
	assert.equal(matchesFilters(item, baseOpts({ folderFilter: "Videos" })), false);
});

void test("matchesFilters: typeFilter excludes items of a different type", () => {
	const item = makeItem({ type: "video" });
	assert.equal(matchesFilters(item, baseOpts({ typeFilter: "video" })), true);
	assert.equal(matchesFilters(item, baseOpts({ typeFilter: "article" })), false);
});

void test("matchesFilters: favoritesOnly excludes non-favorites", () => {
	const item = makeItem({ favorite: false });
	assert.equal(matchesFilters(item, baseOpts({ favoritesOnly: true })), false);
	assert.equal(matchesFilters(makeItem({ favorite: true }), baseOpts({ favoritesOnly: true })), true);
});

void test("matchesFilters: brokenOnly excludes non-broken items", () => {
	const item = makeItem({ broken: false });
	assert.equal(matchesFilters(item, baseOpts({ brokenOnly: true })), false);
	assert.equal(matchesFilters(makeItem({ broken: true }), baseOpts({ brokenOnly: true })), true);
});

void test("matchesFilters: tagFilter requires the item to carry the exact tag", () => {
	const item = makeItem({ tags: ["ai", "rust"] });
	assert.equal(matchesFilters(item, baseOpts({ tagFilter: "rust" })), true);
	assert.equal(matchesFilters(item, baseOpts({ tagFilter: "python" })), false);
});

void test("matchesFilters: hidden items are excluded unless showHidden is set", () => {
	const item = makeItem({ hidden: true });
	assert.equal(matchesFilters(item, baseOpts({ showHidden: false })), false);
	assert.equal(matchesFilters(item, baseOpts({ showHidden: true })), true);
});

void test("computeRelatedItems: a related-but-filtered-out item is excluded from the final result", () => {
	const source = makeItem({
		title: "Source",
		domain: "example.com",
		tags: ["ai"],
		type: "article",
	});
	// Shares a tag with source (qualifies for relatedness) but lives on a different
	// domain than the active domainFilter, so it must be excluded once the shared
	// filter predicate is applied before ranking/slicing.
	const wrongDomain = makeItem({
		title: "WrongDomain",
		domain: "other.com",
		tags: ["ai"],
		type: "article",
	});
	const rightDomain = makeItem({
		title: "RightDomain",
		domain: "example.com",
		tags: ["ai"],
		type: "article",
	});

	const opts = baseOpts({ domainFilter: "example.com" });
	const related = computeRelatedItems([source, wrongDomain, rightDomain], source, opts);

	assert.deepEqual(
		related.map((i) => i.title),
		["RightDomain"],
	);
});

void test("computeRelatedItems: relatedness ranking (shared tags, then domain) is unaffected by filtering", () => {
	const source = makeItem({ title: "Source", domain: "example.com", tags: ["ai", "rust"] });
	const twoShared = makeItem({ title: "TwoShared", domain: "other.com", tags: ["ai", "rust"] });
	const oneShared = makeItem({ title: "OneShared", domain: "example.com", tags: ["ai"] });

	const related = computeRelatedItems([source, oneShared, twoShared], source, baseOpts());

	assert.deepEqual(
		related.map((i) => i.title),
		["TwoShared", "OneShared"],
	);
});
