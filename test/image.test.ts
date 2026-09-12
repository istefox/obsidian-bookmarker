import { test } from "node:test";
import assert from "node:assert/strict";
import { faviconFallbackUrl, resolveFaviconUrl } from "../src/image";

test("faviconFallbackUrl builds a favicon-service URL containing the domain", () => {
	const url = faviconFallbackUrl("example.com");
	assert.ok(url.startsWith("https://www.google.com/s2/favicons"));
	assert.ok(url.includes("domain=example.com"));
});

test("resolveFaviconUrl returns the page's own favicon regardless of the fallback flag", () => {
	assert.equal(
		resolveFaviconUrl("https://example.com/favicon.ico", "example.com", true),
		"https://example.com/favicon.ico",
	);
	assert.equal(
		resolveFaviconUrl("https://example.com/favicon.ico", "example.com", false),
		"https://example.com/favicon.ico",
	);
});

test("resolveFaviconUrl falls back to the favicon service when the page has none and the flag is on", () => {
	const result = resolveFaviconUrl(null, "example.com", true);
	assert.equal(result, faviconFallbackUrl("example.com"));
});

test("resolveFaviconUrl returns null when the page has no favicon and the flag is off", () => {
	assert.equal(resolveFaviconUrl(null, "example.com", false), null);
});
