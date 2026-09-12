import { test } from "node:test";
import assert from "node:assert/strict";
import {
	pickCandidateFiles,
	nextBatchOffset,
	commitBatchOffset,
} from "../src/organize-ai";

// BM-004: an open board with an active filter/search matching zero cards must
// resolve to zero candidates, never silently expand to the whole vault.
test("pickCandidateFiles: board open, nothing selected, nothing visible -> empty (no vault fallback)", () => {
	const result = pickCandidateFiles<string>(true, [], [], ["whole", "vault"]);
	assert.deepEqual(result, []);
});

test("pickCandidateFiles: board open, selection present -> selection wins over visible", () => {
	const result = pickCandidateFiles<string>(true, ["a"], ["b", "c"], ["whole", "vault"]);
	assert.deepEqual(result, ["a"]);
});

test("pickCandidateFiles: board open, no selection, visible cards present -> visible cards", () => {
	const result = pickCandidateFiles<string>(true, [], ["b", "c"], ["whole", "vault"]);
	assert.deepEqual(result, ["b", "c"]);
});

test("pickCandidateFiles: no board view at all -> whole-vault fallback preserved", () => {
	const result = pickCandidateFiles<string>(false, [], [], ["whole", "vault"]);
	assert.deepEqual(result, ["whole", "vault"]);
});

// BM-007: a capped batch must make forward progress on re-run instead of always
// re-slicing from index 0.
test("nextBatchOffset: fresh command starts at offset 0", () => {
	const state = new Map();
	const { offset } = nextBatchOffset(state, "bulk-retag", ["a", "b", "c"]);
	assert.equal(offset, 0);
});

test("commitBatchOffset + nextBatchOffset: re-run advances past the previous batch", () => {
	const state = new Map();
	const paths = ["a", "b", "c", "d", "e"];

	const first = nextBatchOffset(state, "bulk-retag", paths);
	assert.equal(first.offset, 0);
	commitBatchOffset(state, "bulk-retag", first.signature, first.offset, 2, paths.length);

	const second = nextBatchOffset(state, "bulk-retag", paths);
	assert.equal(second.offset, 2, "re-run must resume after the previously processed batch");
	commitBatchOffset(state, "bulk-retag", second.signature, second.offset, 2, paths.length);

	const third = nextBatchOffset(state, "bulk-retag", paths);
	assert.equal(third.offset, 4);
});

test("commitBatchOffset: consuming the full set forgets the offset (next run starts over)", () => {
	const state = new Map();
	const paths = ["a", "b"];
	const { offset, signature } = nextBatchOffset(state, "bulk-retag", paths);
	commitBatchOffset(state, "bulk-retag", signature, offset, paths.length, paths.length);

	assert.equal(state.has("bulk-retag"), false);
	const again = nextBatchOffset(state, "bulk-retag", paths);
	assert.equal(again.offset, 0);
});

test("nextBatchOffset: two commands keep independent continuation state", () => {
	const state = new Map();
	const paths = ["a", "b", "c", "d"];

	const retag1 = nextBatchOffset(state, "bulk-retag", paths);
	commitBatchOffset(state, "bulk-retag", retag1.signature, retag1.offset, 2, paths.length);

	// A different command against the same candidate set must not see the
	// bulk-retag command's progress.
	const folders1 = nextBatchOffset(state, "suggest-folder-moves", paths);
	assert.equal(folders1.offset, 0);
});

test("nextBatchOffset: composition change resets the offset instead of skipping files", () => {
	const state = new Map();
	const first = nextBatchOffset(state, "bulk-retag", ["a", "b", "c"]);
	commitBatchOffset(state, "bulk-retag", first.signature, first.offset, 2, 3);

	// Board selection/filter changed since the last run: a different file set.
	const second = nextBatchOffset(state, "bulk-retag", ["x", "y"]);
	assert.equal(second.offset, 0, "a changed candidate set must not reuse a stale offset");
});
