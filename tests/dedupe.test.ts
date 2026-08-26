import assert from "node:assert/strict";
import test from "node:test";
import { backoffDelay, findDuplicate } from "../src/lib/dedupe";

const records = [
  { id: 1, localPath: "C:\\Medal\\a.mp4", fileSize: 1000, fileHash: "hash-a", mtimeMs: 1000 },
  { id: 2, localPath: "C:\\Medal\\b.mp4", fileSize: 2000, fileHash: "hash-b", mtimeMs: 2000 },
];

test("same path, size and mtime is a duplicate", () => {
  const v = findDuplicate({ localPath: "C:\\Medal\\a.mp4", size: 1000, mtimeMs: 1000 }, records);
  assert.equal(v.duplicate, true);
  assert.equal(v.matchedId, 1);
});

test("identical content hash is a duplicate even when moved", () => {
  const v = findDuplicate({ localPath: "D:\\moved\\renamed.mp4", size: 1000, mtimeMs: 5000, hash: "hash-a" }, records);
  assert.equal(v.duplicate, true);
  assert.equal(v.matchedId, 1);
});

test("modified file with same path and size is re-uploaded", () => {
  const v = findDuplicate({ localPath: "C:\\Medal\\a.mp4", size: 1000, mtimeMs: 99999, hash: "hash-new" }, records);
  assert.equal(v.duplicate, false);
});

test("new file is never a duplicate", () => {
  const v = findDuplicate({ localPath: "C:\\Medal\\c.mp4", size: 3000, mtimeMs: 1, hash: "hash-c" }, records);
  assert.equal(v.duplicate, false);
});

test("duplicate uploads setting overrides detection", () => {
  const v = findDuplicate({ localPath: "C:\\Medal\\a.mp4", size: 1000, mtimeMs: 1000 }, records, { allowDuplicates: true });
  assert.equal(v.duplicate, false);
});

test("exponential backoff grows and is capped", () => {
  const first = backoffDelay(1, 5000, 2, 60000);
  const third = backoffDelay(3, 5000, 2, 60000);
  const huge = backoffDelay(30, 5000, 2, 60000);
  assert.ok(first >= 5000 && first <= 6000);
  assert.ok(third > first);
  assert.equal(huge, 60000);
});
