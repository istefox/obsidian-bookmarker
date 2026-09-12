import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProxyFallbackUrl } from "../src/save-cover";

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
