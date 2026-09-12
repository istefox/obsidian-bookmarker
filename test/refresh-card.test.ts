import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRefreshCover } from "../src/refresh-card";
import { syncCoverBody } from "../src/save-cover";

/**
 * Regression coverage for BM-006: refreshing a card with a new chosen cover must
 * resync the note body's embed to match the new frontmatter `image`, and refreshing
 * with no new image must leave both frontmatter and body untouched.
 *
 * `resolveRefreshCover` is the pure decision behind `applyRefresh` (in
 * `refresh-card.ts`): given the reviewed draft's `imageUrl`, it says what (if
 * anything) should be written to frontmatter and what the body-sync target is —
 * exercised here without a live Obsidian `App`/`TFile`. The body-sync side itself is
 * `syncCoverBody`, already covered by `save-cover.test.ts`'s BM-001 regressions;
 * composing the two below is what `applyRefresh` actually does.
 */

test("resolveRefreshCover: a vault wikilink cover is passed through to frontmatter and body", () => {
	const resolved = resolveRefreshCover("[[_bookmarks/_assets/new.png]]", false);
	assert.deepEqual(resolved, {
		frontmatterImage: "[[_bookmarks/_assets/new.png]]",
		newLocalCover: "_bookmarks/_assets/new.png",
	});
});

test("resolveRefreshCover: a safe remote candidate updates frontmatter but has no body embed", () => {
	const resolved = resolveRefreshCover("https://example.com/cover.png", false);
	assert.deepEqual(resolved, {
		frontmatterImage: "https://example.com/cover.png",
		newLocalCover: null,
	});
});

test("resolveRefreshCover: a remote candidate is proxied when the setting is on", () => {
	const resolved = resolveRefreshCover("https://example.com/cover.png", true);
	assert.equal(
		resolved?.frontmatterImage,
		"https://wsrv.nl/?url=https%3A%2F%2Fexample.com%2Fcover.png&w=1200&output=webp",
	);
	assert.equal(resolved?.newLocalCover, null);
});

test("resolveRefreshCover: no candidate — nothing to change", () => {
	assert.equal(resolveRefreshCover(null, false), null);
	assert.equal(resolveRefreshCover("", false), null);
});

test("resolveRefreshCover: an unsafe remote candidate — nothing to change", () => {
	assert.equal(resolveRefreshCover("http://127.0.0.1/x.png", false), null);
});

const NOTE_WITH_REMOTE_COVER_AND_UNRELATED_EMBED = [
	"---",
	"image: https://example.com/old-cover.png",
	"---",
	"# My Bookmark",
	"",
	"## Notes",
	"",
	"![[diagram.png]]",
].join("\n");

test("refresh with a new chosen cover updates the body embed to match the new frontmatter image", () => {
	// Mirrors what applyRefresh does: resolve, then (only if resolved) sync the body.
	const resolved = resolveRefreshCover("[[_bookmarks/_assets/new.png]]", false);
	if (!resolved) throw new Error("expected a resolved cover");
	const newBody = syncCoverBody(
		NOTE_WITH_REMOTE_COVER_AND_UNRELATED_EMBED,
		resolved.newLocalCover,
		null, // previous cover was remote — nothing of the plugin's in the body yet
	);
	assert.match(newBody, /!\[\[_bookmarks\/_assets\/new\.png\]\]/);
	// The unrelated embed further down is untouched.
	assert.match(newBody, /!\[\[diagram\.png\]\]/);
});

test("refresh with no new image leaves the body untouched", () => {
	// applyRefresh's own guard is `if (resolvedCover) { ...call rewriteCoverBody... }`:
	// simulate that composition and confirm the body-sync step is skipped entirely
	// when there is no candidate — not just that syncCoverBody is a no-op if called.
	let bodySyncCalls = 0;
	const simulateApplyRefreshCoverStep = (imageUrl: string | null, body: string): string => {
		const resolved = resolveRefreshCover(imageUrl, false);
		if (!resolved) return body;
		bodySyncCalls++;
		return syncCoverBody(body, resolved.newLocalCover, null);
	};

	const result = simulateApplyRefreshCoverStep(null, NOTE_WITH_REMOTE_COVER_AND_UNRELATED_EMBED);
	assert.equal(bodySyncCalls, 0, "no candidate means the body-sync step must never run");
	assert.equal(result, NOTE_WITH_REMOTE_COVER_AND_UNRELATED_EMBED);
});
