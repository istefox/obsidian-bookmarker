import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProxyFallbackUrl, syncCoverBody } from "../src/save-cover";

// Regression cases for BM-003: the origin-download fallback hardcoded proxy use
// (`proxiedImage(stored, true)`), so a user who disabled the image proxy (privacy
// setting) still had a wsrv.nl request fired whenever the origin download failed.

test("useImageProxy: false skips the fallback entirely (no wsrv.nl contact)", () => {
	assert.equal(resolveProxyFallbackUrl("https://example.com/cover.png", false), null);
});

test("useImageProxy: false skips the fallback even for an already-proxied stored URL", () => {
	// `stored` can already be a wsrv.nl URL if the setting was on when the bookmark
	// was created. proxiedImage(url, false) would return it unchanged (already-proxied
	// URLs pass through regardless of the flag), silently hitting wsrv.nl despite the
	// setting now being off — must resolve to null instead of reaching download() at all.
	const alreadyProxied = "https://wsrv.nl/?url=https%3A%2F%2Fexample.com%2Fcover.png&w=1200&output=webp";
	assert.equal(resolveProxyFallbackUrl(alreadyProxied, false), null);
});

test("useImageProxy: true routes the fallback through wsrv.nl", () => {
	const url = resolveProxyFallbackUrl("https://example.com/cover.png", true);
	assert.equal(url, "https://wsrv.nl/?url=https%3A%2F%2Fexample.com%2Fcover.png&w=1200&output=webp");
});

/**
 * Regression coverage for BM-001: `rewriteCoverBody`/`syncCoverBody` must only ever
 * touch the line matching the *previous* cover it was told about, never "the first
 * standalone embed line found anywhere in the body". `syncCoverBody` is the pure
 * string transform behind `rewriteCoverBody`, so these run without a live Obsidian
 * `App`/`TFile`.
 */

const NOTE_WITH_UNRELATED_EMBED = [
	"---",
	"image: https://example.com/cover.png",
	"---",
	"# My Bookmark",
	"",
	"Some intro text.",
	"",
	"## Notes",
	"",
	"![[diagram.png]]",
	"",
	"More notes below.",
].join("\n");

test("remove cover: previous cover remote — unrelated embed elsewhere is left untouched", () => {
	const result = syncCoverBody(NOTE_WITH_UNRELATED_EMBED, null, null);
	assert.equal(result, NOTE_WITH_UNRELATED_EMBED, "body must be byte-for-byte unchanged");
	assert.match(result, /!\[\[diagram\.png\]\]/, "unrelated embed must survive");
});

test("set cover from vault: previous cover remote — unrelated embed elsewhere is left untouched, new embed inserted after heading", () => {
	const result = syncCoverBody(NOTE_WITH_UNRELATED_EMBED, "_bookmarks/_assets/new.png", null);
	assert.match(result, /!\[\[diagram\.png\]\]/, "unrelated embed must survive");
	const lines = result.split("\n");
	const headingIndex = lines.findIndex((l) => l === "# My Bookmark");
	assert.equal(lines[headingIndex + 2], "![[_bookmarks/_assets/new.png]]");
	// Only one new embed line was added — the unrelated one is still the only other one.
	const embedLines = lines.filter((l) => /^!\[\[[^\]]+\]\]\s*$/.test(l));
	assert.deepEqual(embedLines, ["![[_bookmarks/_assets/new.png]]", "![[diagram.png]]"]);
});

test("no previous cover at all — unrelated embed elsewhere is left untouched", () => {
	const noteNoCover = [
		"---",
		"title: x",
		"---",
		"# My Bookmark",
		"",
		"## Notes",
		"",
		"![[diagram.png]]",
	].join("\n");
	const result = syncCoverBody(noteNoCover, null, null);
	assert.equal(result, noteNoCover);
});

const NOTE_WITH_OWN_COVER = [
	"---",
	'image: "[[_bookmarks/_assets/old.png]]"',
	"---",
	"# My Bookmark",
	"",
	"![[_bookmarks/_assets/old.png]]",
	"",
	"## Notes",
	"",
	"![[diagram.png]]",
].join("\n");

test("legitimate case: replacing the plugin's own previous cover embed", () => {
	const result = syncCoverBody(
		NOTE_WITH_OWN_COVER,
		"_bookmarks/_assets/new.png",
		"_bookmarks/_assets/old.png",
	);
	const lines = result.split("\n");
	assert.equal(lines[5], "![[_bookmarks/_assets/new.png]]");
	assert.match(result, /!\[\[diagram\.png\]\]/, "unrelated embed must still survive");
	// No stacking: still exactly one plugin cover line plus the unrelated one.
	const embedLines = lines.filter((l) => /^!\[\[[^\]]+\]\]\s*$/.test(l));
	assert.deepEqual(embedLines, ["![[_bookmarks/_assets/new.png]]", "![[diagram.png]]"]);
});

test("legitimate case: removing the plugin's own previous cover embed", () => {
	const result = syncCoverBody(NOTE_WITH_OWN_COVER, null, "_bookmarks/_assets/old.png");
	assert.doesNotMatch(result, /!\[\[_bookmarks\/_assets\/old\.png\]\]/);
	assert.match(result, /!\[\[diagram\.png\]\]/, "unrelated embed must still survive");
});

test("repeated saves never stack embeds when the previous cover embed is found", () => {
	const once = syncCoverBody(NOTE_WITH_OWN_COVER, "_bookmarks/_assets/new.png", "_bookmarks/_assets/old.png");
	const twice = syncCoverBody(once, "_bookmarks/_assets/new.png", "_bookmarks/_assets/new.png");
	const embedLines = twice.split("\n").filter((l) => /^!\[\[[^\]]+\]\]\s*$/.test(l));
	assert.deepEqual(embedLines, ["![[_bookmarks/_assets/new.png]]", "![[diagram.png]]"]);
});

test("stale ```embed image: line is still stripped regardless of previous/new cover", () => {
	const noteWithFence = [
		"---",
		'image: "[[_bookmarks/_assets/old.png]]"',
		"---",
		"# My Bookmark",
		"",
		"![[_bookmarks/_assets/old.png]]",
		"",
		"```embed",
		"title: Example",
		"image: https://example.com/old.png",
		"url: https://example.com",
		"```",
	].join("\n");
	const result = syncCoverBody(noteWithFence, "_bookmarks/_assets/new.png", "_bookmarks/_assets/old.png");
	const fenceBlock = result.slice(result.indexOf("```embed"), result.lastIndexOf("```") + 3);
	assert.doesNotMatch(fenceBlock, /^image:\s/m, "the fence's own image: line must be stripped");
	assert.match(fenceBlock, /title: Example/, "the rest of the fence content is untouched");
	// The frontmatter's own `image:` key is a different line entirely and stays put.
	assert.match(result, /^image: "\[\[_bookmarks\/_assets\/old\.png\]\]"$/m);
});
