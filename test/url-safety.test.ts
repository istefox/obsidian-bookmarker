import { test } from "node:test";
import * as assert from "node:assert/strict";
import { isSafeRemoteUrl } from "../src/url-safety";

// Regression cases for BM-005: two isPrivateHost misclassifications.
// 1) An IPv4-mapped IPv6 loopback bypassed the guard because the URL parser
//    normalizes the bracketed literal to the compressed hex form
//    (::ffff:7f00:1), which the old code never matched.
// 2) Public hostnames starting with "fc"/"fd" (fda.gov, fdic.gov, ...) were
//    wrongly rejected by a bare string-prefix check meant for IPv6 literals.

void test("rejects IPv4-mapped IPv6 loopback, dotted form", () => {
	assert.equal(isSafeRemoteUrl("http://[::ffff:127.0.0.1]/x"), false);
});

void test("rejects IPv4-mapped IPv6 loopback, compressed hex form", () => {
	assert.equal(isSafeRemoteUrl("http://[::ffff:7f00:1]/x"), false);
});

void test("accepts public hostnames that merely start with fc/fd", () => {
	assert.equal(isSafeRemoteUrl("https://fda.gov/x"), true);
	assert.equal(isSafeRemoteUrl("https://fdic.gov/x"), true);
	assert.equal(isSafeRemoteUrl("https://fc-example.com/x"), true);
});

void test("still rejects existing private/reserved hosts", () => {
	assert.equal(isSafeRemoteUrl("http://127.0.0.1/x"), false);
	assert.equal(isSafeRemoteUrl("http://10.0.0.5/x"), false);
	assert.equal(isSafeRemoteUrl("http://169.254.169.254/x"), false); // cloud metadata
	assert.equal(isSafeRemoteUrl("http://[fc00::1]/x"), false);
	assert.equal(isSafeRemoteUrl("http://[fe80::1]/x"), false);
	assert.equal(isSafeRemoteUrl("http://localhost/x"), false);
});

void test("still accepts ordinary public URLs", () => {
	assert.equal(isSafeRemoteUrl("https://example.com/x"), true);
	assert.equal(isSafeRemoteUrl("https://sub.example.co.uk/x"), true);
});
