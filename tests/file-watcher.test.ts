import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  candidateMedalFolders,
  detectMedalFolders,
  isStable,
  parseExtensionList,
  isExtensionAllowed,
  relativeSegmentsFor,
  waitForStableFile,
} from "../src/lib/fs-utils";

test("Medal folder detection never returns non-existent paths", () => {
  const detected = detectMedalFolders();
  for (const folder of detected) {
    assert.equal(fs.existsSync(folder.path), true, `${folder.path} should exist`);
  }
  assert.ok(candidateMedalFolders().length > 0);
});

test("extension filters accept and reject correctly", () => {
  assert.deepEqual(parseExtensionList(".MP4, mkv,.mov"), [".mp4", ".mkv", ".mov"]);
  assert.equal(isExtensionAllowed("clip.MP4", ".mp4,.mkv"), true);
  assert.equal(isExtensionAllowed("notes.txt", ".mp4,.mkv"), false);
  assert.equal(isExtensionAllowed("anything.bin", ""), true, "empty list allows everything");
});

test("stability detection waits for the size to stop changing", () => {
  const now = Date.now();
  const growing = [
    { size: 100, mtimeMs: now - 3000, at: now - 3000 },
    { size: 200, mtimeMs: now - 2000, at: now - 2000 },
    { size: 300, mtimeMs: now - 1000, at: now - 1000 },
  ];
  assert.equal(isStable(growing, 5000, now), false);

  const settled = [
    { size: 300, mtimeMs: now - 9000, at: now - 9000 },
    { size: 300, mtimeMs: now - 6000, at: now - 6000 },
    { size: 300, mtimeMs: now - 3000, at: now - 3000 },
  ];
  assert.equal(isStable(settled, 2000, now), true);
});

test("waitForStableFile returns once a real file stops growing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drivevault-"));
  const file = path.join(dir, "recording.mp4");
  fs.writeFileSync(file, Buffer.alloc(1024));

  const grow = setInterval(() => {
    fs.appendFileSync(file, Buffer.alloc(1024));
  }, 60);
  setTimeout(() => clearInterval(grow), 400);

  const result = await waitForStableFile(file, { stableMs: 250, intervalMs: 80, timeoutMs: 5000 });
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.size >= 1024);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("waitForStableFile reports a vanished file instead of crashing", async () => {
  const result = await waitForStableFile(path.join(os.tmpdir(), "definitely-missing-drivevault.mp4"), {
    stableMs: 100,
    intervalMs: 50,
    timeoutMs: 2000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "gone");
});

test("relative structure is preserved without duplicating the root", () => {
  const segments = relativeSegmentsFor("/backup/Medal", "/backup/Medal/2026/August/Gaming/clip.mp4");
  assert.deepEqual(segments, ["2026", "August", "Gaming"]);
  assert.deepEqual(relativeSegmentsFor("/backup/Medal", "/backup/Medal/clip.mp4"), []);
  assert.deepEqual(relativeSegmentsFor("/backup/Medal", "/somewhere/else/clip.mp4"), []);
});
