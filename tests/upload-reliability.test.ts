import "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import { describeGoogleError } from "../src/lib/google";

/** Mirrors the resumable chunk loop: offset advances only on confirmed 308s. */
function planChunks(size: number, chunkSize: number, received: number) {
  const chunks: { start: number; end: number }[] = [];
  for (let offset = received; offset < size; offset += chunkSize) {
    chunks.push({ start: offset, end: Math.min(offset + chunkSize, size) - 1 });
  }
  return chunks;
}

test("interrupted uploads resume from the last confirmed byte", () => {
  const size = 25 * 1024 * 1024;
  const chunk = 8 * 1024 * 1024;
  const full = planChunks(size, chunk, 0);
  assert.equal(full.length, 4);
  const resumed = planChunks(size, chunk, 16 * 1024 * 1024);
  assert.equal(resumed.length, 2);
  assert.equal(resumed[0].start, 16 * 1024 * 1024, "must not restart a huge upload unnecessarily");
});

test("authentication failures are human readable and not retryable", () => {
  const res = describeGoogleError({ code: 401, message: "Invalid Credentials" });
  assert.equal(res.code, "AUTH_EXPIRED");
  assert.equal(res.retryable, false);
  assert.match(res.message, /reconnect/i);
});

test("quota, network and 5xx errors map to friendly retryable messages", () => {
  const quota = describeGoogleError({ response: { status: 403 }, errors: [{ reason: "storageQuotaExceeded" }] });
  assert.equal(quota.code, "DRIVE_QUOTA");
  assert.equal(quota.retryable, false);

  const net = describeGoogleError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND www.googleapis.com" });
  assert.equal(net.code, "NETWORK");
  assert.equal(net.retryable, true);
  assert.match(net.message, /internet connection was lost/i);

  const server = describeGoogleError({ response: { status: 503 }, message: "backend error" });
  assert.equal(server.code, "SERVER_ERROR");
  assert.equal(server.retryable, true);

  const rate = describeGoogleError({ response: { status: 429 }, errors: [{ reason: "rateLimitExceeded" }] });
  assert.equal(rate.code, "RATE_LIMITED");
  assert.equal(rate.retryable, true);
});

test("no raw stack traces leak into user facing messages", () => {
  for (const err of [
    { code: 500, message: "Error: at Object.<anonymous> (/app/src/x.ts:12:9)" },
    { message: "socket hang up" },
    { code: 404, message: "File not found: 1abc" },
  ]) {
    const described = describeGoogleError(err);
    assert.doesNotMatch(described.message, /at Object\.<anonymous>/);
    assert.ok(described.message.length <= 300);
  }
});
