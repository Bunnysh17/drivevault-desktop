import fs from "node:fs";
import { db } from "@/db";
import { uploadSessions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { AuthError, describeGoogleError, getAccessToken } from "./google";
import { logActivity } from "./log";

const UPLOAD_HOST = "https://www.googleapis.com/upload/drive/v3/files";

export class UploadError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface UploadControl {
  paused: boolean;
  canceled: boolean;
}

export interface UploadProgress {
  bytesUploaded: number;
  speedBps: number;
  etaSeconds: number | null;
}

export interface UploadRequest {
  queueId: number;
  localPath: string;
  fileName: string;
  size: number;
  mimeType: string;
  parentFolderId: string;
  chunkSizeBytes: number;
  speedLimitBytesPerSec: number;
  maxChunkRetries: number;
  control: UploadControl;
  onProgress: (p: UploadProgress) => void;
}

interface SessionRow {
  id: number;
  resumableUri: string;
  bytesReceived: number;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, Math.round(Math.max(0, ms))));
}

function chunkBackoff(attempt: number) {
  return Math.round(Math.min(60_000, 1000 * Math.pow(2, attempt)) + Math.random() * 800);
}

class RateLimiter {
  private limit: number;
  constructor(limitBytesPerSec: number) {
    this.limit = limitBytesPerSec;
  }
  async pace(bytes: number, elapsedMs: number) {
    if (!this.limit || this.limit <= 0) return;
    const expectedMs = (bytes / this.limit) * 1000;
    const wait = Math.round(expectedMs - elapsedMs);
    if (wait > 5) await sleep(Math.min(wait, 10_000));
  }
}

async function loadSession(queueId: number, fileSize: number): Promise<SessionRow | null> {
  const rows = await db
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.queueId, queueId), eq(uploadSessions.status, "active")))
    .orderBy(desc(uploadSessions.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.fileSize !== fileSize) {
    await db.delete(uploadSessions).where(eq(uploadSessions.id, row.id));
    return null;
  }
  return { id: row.id, resumableUri: row.resumableUri, bytesReceived: row.bytesReceived };
}

async function saveSession(queueId: number, uri: string, bytes: number, size: number, chunkSize: number) {
  await db.insert(uploadSessions).values({
    queueId,
    resumableUri: uri,
    bytesReceived: bytes,
    fileSize: size,
    chunkSize,
    status: "active",
    updatedAt: new Date(),
  });
}

async function updateSession(id: number, bytes: number, status = "active") {
  await db
    .update(uploadSessions)
    .set({ bytesReceived: bytes, status, updatedAt: new Date() })
    .where(eq(uploadSessions.id, id));
}

async function initiateSession(req: UploadRequest, token: string): Promise<string> {
  const metadata = {
    name: req.fileName,
    parents: req.parentFolderId === "root" ? [] : [req.parentFolderId],
    mimeType: req.mimeType,
    description: `Backed up by DriveVault from ${req.localPath}`,
    appProperties: { drivevault: "1", localPath: req.localPath.slice(0, 512) },
  };
  const res = await fetch(`${UPLOAD_HOST}?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": req.mimeType,
      "X-Upload-Content-Length": String(req.size),
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new AuthError("AUTH_EXPIRED", "Google rejected the upload session. Reconnect your account.");
  }
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    if (res.status === 404 || errorText.includes("File not found")) {
      throw new UploadError("PARENT_NOT_FOUND", "Destination folder not found on Google Drive (healing folder chain)...", true);
    }
    const d = describeGoogleError(new Error(`HTTP ${res.status} ${errorText}`));
    throw new UploadError(d.code, d.message, d.retryable);
  }
  const location = res.headers.get("location");
  if (!location) throw new UploadError("NO_SESSION", "Google did not return a resumable upload session.", true);
  return location;
}

/** Asks Google how many bytes it already stored for this session (resume support). */
async function querySession(uri: string, token: string, size: number): Promise<{ bytesReceived: number; completedId?: string }> {
  const res = await fetch(uri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Range": `bytes */${size}`,
      "Content-Length": "0",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 200 || res.status === 201) {
    const json = (await res.json()) as { id?: string };
    return { bytesReceived: size, completedId: json.id };
  }
  if (res.status === 308) {
    const range = res.headers.get("range");
    if (!range) return { bytesReceived: 0 };
    const end = Number(range.split("-")[1]);
    return { bytesReceived: Number.isFinite(end) ? end + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) {
    throw new UploadError("SESSION_EXPIRED", "The previous upload session expired; starting a fresh one.", true);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError("AUTH_EXPIRED", "Google rejected the upload session. Reconnect your account.");
  }
  throw new UploadError("HTTP_" + res.status, `Google returned HTTP ${res.status} while resuming.`, res.status >= 500);
}

export interface UploadOutcome {
  driveFileId: string;
  bytesUploaded: number;
}

export async function runResumableUpload(req: UploadRequest): Promise<UploadOutcome> {
  const { token } = await getAccessToken();
  const limiter = new RateLimiter(req.speedLimitBytesPerSec);
  let session = await loadSession(req.queueId, req.size);
  let sessionId: number | null = session?.id ?? null;

  if (session) {
    try {
      const state = await querySession(session.resumableUri, token, req.size);
      if (state.completedId) {
        await updateSession(session.id, req.size, "completed");
        return { driveFileId: state.completedId, bytesUploaded: req.size };
      }
      await updateSession(session.id, state.bytesReceived);
      session = { ...session, bytesReceived: state.bytesReceived };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      await db.delete(uploadSessions).where(eq(uploadSessions.id, session.id));
      session = null;
    }
  }

  if (!session) {
    const uri = await initiateSession(req, token);
    await saveSession(req.queueId, uri, 0, req.size, req.chunkSizeBytes);
    const fresh = await loadSession(req.queueId, req.size);
    sessionId = fresh?.id ?? null;
    session = fresh;
  }

  let offset = session?.bytesReceived ?? 0;
  let uri = session!.resumableUri;
  // High-speed adaptive chunk sizing for maximum throughput (up to 64MB per stream)
  let baseChunk = req.chunkSizeBytes || 32 * 1024 * 1024;
  if (req.size >= 250 * 1024 * 1024) {
    baseChunk = Math.max(baseChunk, 64 * 1024 * 1024);
  } else if (req.size >= 64 * 1024 * 1024) {
    baseChunk = Math.max(baseChunk, 32 * 1024 * 1024);
  } else if (req.size <= 16 * 1024 * 1024) {
    baseChunk = Math.max(256 * 1024, req.size);
  }
  const chunkSize = Math.max(256 * 1024, Math.min(64 * 1024 * 1024, baseChunk));

  let lastTick = Date.now();
  let lastBytes = offset;
  let speed = 0;
  let chunkAttempt = 0;

  const handle = await fs.promises.open(req.localPath, "r");

  try {
    while (offset < req.size) {
      if (req.control.canceled) throw new UploadError("CANCELED", "Upload canceled by the user.", false);
      if (req.control.paused) {
        await sleep(400);
        lastTick = Date.now();
        lastBytes = offset;
        speed = 0;
        continue;
      }

      const end = Math.min(offset + chunkSize, req.size) - 1;
      const length = end - offset + 1;
      let payload: Uint8Array;
      try {
        payload = new Uint8Array(length);
        await handle.read(payload, 0, length, offset);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        throw new UploadError(
          code === "ENOENT" ? "FILE_GONE" : "FILE_LOCKED",
          code === "ENOENT"
            ? "The file was moved or deleted while uploading. The local copy was left untouched."
            : "The file could not be read (it may be in use by another program). Retrying shortly.",
          code !== "ENOENT",
        );
      }

      const started = Date.now();
      const res = await fetch(uri, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Length": String(length),
          "Content-Range": `bytes ${offset}-${end}/${req.size}`,
          "Content-Type": req.mimeType || "application/octet-stream",
        },
        body: payload as unknown as BodyInit,
        signal: AbortSignal.timeout(Math.round(Math.max(120_000, (length / 200_000) * 1000))),
      });

      if (res.status === 308) {
        const range = res.headers.get("range");
        const received = range ? Number(range.split("-")[1]) + 1 : end + 1;
        offset = Number.isFinite(received) ? received : end + 1;
        chunkAttempt = 0;
        const now = Date.now();
        const dt = (now - lastTick) / 1000;
        if (dt >= 0.5) {
          const inst = (offset - lastBytes) / dt;
          speed = speed === 0 ? inst : speed * 0.6 + inst * 0.4;
          lastTick = now;
          lastBytes = offset;
        }
        req.onProgress({
          bytesUploaded: offset,
          speedBps: speed,
          etaSeconds: speed > 0 ? Math.max(0, Math.round((req.size - offset) / speed)) : null,
        });
        if (sessionId) await updateSession(sessionId, offset);
        await limiter.pace(length, Date.now() - started);
        continue;
      }

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { id?: string };
        if (!json.id) throw new UploadError("NO_FILE_ID", "Google did not return a file id after upload.", true);
        if (sessionId) await updateSession(sessionId, req.size, "completed");
        req.onProgress({ bytesUploaded: req.size, speedBps: speed, etaSeconds: 0 });
        return { driveFileId: json.id, bytesUploaded: req.size };
      }

      const text = await res.text().catch(() => "");
      if (res.status === 404 || res.status === 410) {
        if (sessionId) await db.delete(uploadSessions).where(eq(uploadSessions.id, sessionId));
        const newUri = await initiateSession(req, token);
        await saveSession(req.queueId, newUri, 0, req.size, chunkSize);
        const fresh = await loadSession(req.queueId, req.size);
        sessionId = fresh?.id ?? null;
        uri = newUri;
        offset = 0;
        chunkAttempt = 0;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new AuthError("AUTH_EXPIRED", "Google authentication expired during the upload. Reconnect your account.");
      }
      if (res.status === 429 || res.status >= 500) {
        chunkAttempt += 1;
        if (chunkAttempt > req.maxChunkRetries) {
          throw new UploadError(
            "RETRY_EXHAUSTED",
            "Upload paused after repeated errors from Google Drive. It will retry automatically later.",
            true,
          );
        }
        const d = describeGoogleError(new Error(`HTTP ${res.status} ${text}`));
        void logActivity("retry", d.message, {
          filePath: req.localPath,
          status: "retrying",
          errorCode: d.code,
        });
        await sleep(chunkBackoff(chunkAttempt));
        // Ask Google where the session really is before continuing.
        const state = await querySession(uri, token, req.size).catch(() => ({ bytesReceived: offset }));
        offset = state.bytesReceived ?? offset;
        continue;
      }

      const d = describeGoogleError(new Error(`HTTP ${res.status} ${text}`));
      throw new UploadError(d.code, d.message, d.retryable);
    }
  } finally {
    await handle.close().catch(() => undefined);
  }

  // Loop finished without a completion response: confirm with a status query.
  const state = await querySession(uri, token, req.size);
  if (state.completedId) {
    if (sessionId) await updateSession(sessionId, req.size, "completed");
    return { driveFileId: state.completedId, bytesUploaded: req.size };
  }
  throw new UploadError("INCOMPLETE", "The upload did not finish cleanly. It will resume from where it stopped.", true);
}

export interface VerifyResult {
  ok: boolean;
  size: number | null;
  name: string | null;
  webViewLink: string | null;
  reason?: string;
}

/** Confirms the complete file really exists in Drive before any local deletion. */
export async function verifyDriveFile(fileId: string, expectedSize: number): Promise<VerifyResult> {
  try {
    const { token } = await getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,size,mimeType,trashed,webViewLink,parents`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw describeGoogleError(new Error(`HTTP ${res.status}`));
    }
    if (!res.ok) {
      const d = describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
      return { ok: false, size: null, name: null, webViewLink: null, reason: d.message };
    }
    const data = (await res.json()) as { name?: string; size?: string; trashed?: boolean; webViewLink?: string };
    const size = Number(data.size ?? -1);
    if (data.trashed) return { ok: false, size, name: data.name ?? null, webViewLink: null, reason: "File is in the Drive trash." };
    if (size !== expectedSize) {
      return {
        ok: false,
        size,
        name: data.name ?? null,
        webViewLink: data.webViewLink ?? null,
        reason: `Drive file size (${size}) does not match the local file (${expectedSize}).`,
      };
    }
    return { ok: true, size, name: data.name ?? null, webViewLink: data.webViewLink ?? null };
  } catch (err) {
    const d = describeGoogleError(err);
    return { ok: false, size: null, name: null, webViewLink: null, reason: d.message };
  }
}

export async function abortSessionsForQueue(queueId: number) {
  await db.delete(uploadSessions).where(eq(uploadSessions.queueId, queueId));
}
