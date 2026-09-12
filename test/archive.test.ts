import { test } from "node:test";
import assert from "node:assert/strict";
import * as obsidianStub from "obsidian";
import { triggerWaybackSnapshot } from "../src/archive";

// `src/timeout.ts`'s withTimeout() uses the browser/Electron `window` global (present
// in the real Obsidian runtime, absent under plain `node --test`). Polyfill it here,
// confined to this test file, rather than touching production code out of this
// finding's scope.
const globalWithWindow = globalThis as unknown as { window?: unknown };
if (typeof globalWithWindow.window === "undefined") {
	globalWithWindow.window = globalThis;
}

type RequestUrlArgs = { url: string; method?: string; throw?: boolean };
const stub = obsidianStub as unknown as {
	__setRequestUrlImpl: (fn: (args: RequestUrlArgs) => Promise<unknown>) => void;
	__resetRequestUrlImpl: () => void;
};

test("triggerWaybackSnapshot calls the Save Page Now endpoint with the URL not percent-encoded", async () => {
	const calls: RequestUrlArgs[] = [];
	stub.__setRequestUrlImpl(async (args) => {
		calls.push(args);
		return { status: 200, json: {}, text: "" };
	});
	try {
		triggerWaybackSnapshot("https://example.com/a page?x=1");
		// Fire-and-forget: give the queued microtask/promise chain a tick to run.
		await new Promise((resolve) => setTimeout(resolve, 10));

		assert.equal(calls.length, 1);
		assert.equal(
			calls[0].url,
			"https://web.archive.org/save/https://example.com/a page?x=1",
		);
	} finally {
		stub.__resetRequestUrlImpl();
	}
});

test("triggerWaybackSnapshot never throws synchronously and swallows a failing requestUrl", async () => {
	stub.__setRequestUrlImpl(async () => {
		throw new Error("network down");
	});

	let unhandled: unknown = null;
	const onUnhandledRejection = (err: unknown) => {
		unhandled = err;
	};
	process.on("unhandledRejection", onUnhandledRejection);
	try {
		assert.doesNotThrow(() => triggerWaybackSnapshot("https://example.com/broken"));
		// Let the fire-and-forget chain settle before checking for stray rejections.
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(unhandled, null, "expected no unhandled rejection to surface");
	} finally {
		process.removeListener("unhandledRejection", onUnhandledRejection);
		stub.__resetRequestUrlImpl();
	}
});
