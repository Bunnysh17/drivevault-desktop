import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDeletion, isPathProtected, normalizeForCompare } from "../src/lib/safety";

const base = {
  localPath: "C:\\Videos\\Medal\\clip.mp4",
  verified: true,
  driveFileId: "1abc",
  uploadedAt: new Date("2026-01-01T10:00:00Z").toISOString(),
  exists: true,
  protectedPaths: [] as string[],
  neverDeleteAutomatically: false,
  autoDeleteEnabled: true,
  keepLocalDays: 0,
  now: new Date("2026-01-10T10:00:00Z"),
};

test("a file is only safe to delete once verified in Drive", () => {
  assert.equal(evaluateDeletion(base).safe, true);
  assert.equal(evaluateDeletion({ ...base, verified: false }).safe, false);
  assert.match(evaluateDeletion({ ...base, verified: false }).reason, /not been verified/i);
});

test("starting an upload never makes a file deletable", () => {
  const uploading = evaluateDeletion({ ...base, verified: false, driveFileId: null, uploadedAt: null });
  assert.equal(uploading.safe, false);
});

test("protected files and folders are never safe to delete", () => {
  assert.equal(isPathProtected("C:\\Videos\\Medal\\clip.mp4", ["C:\\Videos\\Medal"]), true);
  assert.equal(isPathProtected("/home/u/clip.mp4", ["clip.mp4"]), true);
  assert.equal(isPathProtected("/home/u/clip.mp4", ["/home/other"]), false);
  const verdict = evaluateDeletion({ ...base, protectedPaths: ["C:\\Videos\\Medal"] });
  assert.equal(verdict.safe, false);
  assert.match(verdict.reason, /Protected/);
});

test("global 'never delete automatically' switch wins over everything", () => {
  const verdict = evaluateDeletion({ ...base, neverDeleteAutomatically: true });
  assert.equal(verdict.safe, false);
});

test("keep-local period blocks premature deletion", () => {
  assert.equal(evaluateDeletion({ ...base, keepLocalDays: 30 }).safe, false);
  assert.equal(evaluateDeletion({ ...base, keepLocalDays: 5 }).safe, true);
});

test("path comparison is case and separator insensitive", () => {
  assert.equal(normalizeForCompare("C:\\A\\B\\"), "c:/a/b");
  assert.equal(normalizeForCompare("/a/b"), "/a/b");
});
