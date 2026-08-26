import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredFolders, protectedPaths, uploadQueue, uploadedFiles, uploadSessions, type MonitoredFolder } from "@/db/schema";
import { backoffDelay, findDuplicate } from "./dedupe";
import {
  detectGameRunning,
  extensionOf,
  fingerprintFile,
  isExtensionAllowed,
  isHiddenFile,
  localDiskStats,
  mimeTypeFor,
  normalizePath,
  relativeSegmentsFor,
  safeUnlink,
  waitForStableFile,
} from "./fs-utils";
import { describeGoogleError, getAuthStatus } from "./google";
import { getSettings, updateSettings } from "./settings";
import { destinationPathFor, ensureFolderChain, getDestinationFolderId, clearFolderCache } from "./drive-folders";
import { logActivity } from "./log";
import { evaluateDeletion, isPathProtected } from "./safety";
import { UploadError, abortSessionsForQueue, runResumableUpload, verifyDriveFile, type UploadControl } from "./uploader";

export interface LiveProgress {
  bytesUploaded: number;
  speedBps: number;
  etaSeconds: number | null;
}

interface EngineState {
  started: boolean;
  paused: boolean;
  gamingDetected: boolean;
  matchedGames: string[];
  watchers: Map<number, FSWatcher>;
  controls: Map<number, UploadControl>;
  inflight: Set<number>;
  live: Map<number, LiveProgress>;
  tickTimer?: ReturnType<typeof setInterval>;
  gameTimer?: ReturnType<typeof setInterval>;
  storageWarned: boolean;
  hadActive: boolean;
}

const g = globalThis as typeof globalThis & {
  __drivevaultEngine?: EngineState;
  __drivevaultTickBusy?: boolean;
};

function state(): EngineState {
  g.__drivevaultEngine ??= {
    started: false,
    paused: false,
    gamingDetected: false,
    matchedGames: [],
    watchers: new Map(),
    controls: new Map(),
    inflight: new Set(),
    live: new Map(),
    storageWarned: false,
    hadActive: false,
  };
  return g.__drivevaultEngine;
}

export function engineStatus() {
  const s = state();
  return {
    running: s.started,
    paused: s.paused,
    gamingModeActive: s.gamingDetected,
    matchedGames: s.matchedGames,
    activeUploads: s.inflight.size,
    watchedFolders: s.watchers.size,
  };
}

export function liveProgressFor(id: number): LiveProgress | null {
  return state().live.get(id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Folder watching                                                     */
/* ------------------------------------------------------------------ */

async function listMonitoredFolders(): Promise<MonitoredFolder[]> {
  return db.select().from(monitoredFolders);
}

export async function refreshWatchers() {
  const s = state();
  const folders = await listMonitoredFolders();
  const wanted = new Map<number, MonitoredFolder>();
  for (const f of folders) if (f.enabled) wanted.set(f.id, f);

  for (const [id, watcher] of s.watchers) {
    if (!wanted.has(id)) {
      void watcher.close().catch(() => undefined);
      s.watchers.delete(id);
    }
  }

  for (const [id, folder] of wanted) {
    if (s.watchers.has(id)) continue;
    if (!fs.existsSync(folder.path)) {
      void logActivity("watch", `Cannot watch "${folder.path}" — the folder does not exist.`, {
        status: "warning",
        filePath: folder.path,
      });
      continue;
    }
    const watcher = chokidar.watch(folder.path, {
      ignoreInitial: true,
      depth: folder.recursive ? 12 : 0,
      awaitWriteFinish: false,
      usePolling: false,
      ignorePermissionErrors: true,
    });
    watcher.on("add", (filePath) => {
      void handleNewFile(folder, filePath).catch((err) =>
        void logActivity("watch", `Could not queue ${path.basename(filePath)}: ${(err as Error).message}`, {
          status: "warning",
          filePath,
        }),
      );
    });
    watcher.on("error", (err) => {
      void logActivity("watch", `Folder watcher error for ${folder.path}: ${(err as Error).message}`, {
        status: "warning",
        filePath: folder.path,
      });
    });
    s.watchers.set(id, watcher);
    await db.update(monitoredFolders).set({ lastScanAt: new Date() }).where(eq(monitoredFolders.id, id));
  }
}

/* ------------------------------------------------------------------ */
/* Enqueue pipeline                                                    */
/* ------------------------------------------------------------------ */

function folderPassesFilters(folder: MonitoredFolder, filePath: string, size: number): { ok: boolean; reason?: string } {
  const name = path.basename(filePath);
  if (folder.ignoreHidden && isHiddenFile(filePath)) return { ok: false, reason: "hidden file" };
  if (!isExtensionAllowed(name, folder.allowedExtensions)) return { ok: false, reason: `extension ${extensionOf(name) || "(none)"} not allowed` };
  if (size < Number(folder.minFileSize)) return { ok: false, reason: "below the minimum file size" };
  return { ok: true };
}

export async function enqueueFile(
  folder: MonitoredFolder,
  filePath: string,
  opts: { skipStability?: boolean; existingRows?: Array<{ id: number; localPath: string; fileSize: number; fileHash: string | null; status: string; driveFileId: string | null }> } = {},
): Promise<{ queued: boolean; reason: string; queueId?: number }> {
  const settings = await getSettings();
  const normalized = normalizePath(filePath);

  if (!folder.autoUpload) return { queued: false, reason: "Auto upload is off for this folder." };
  if (!opts.skipStability) {
    const stability = await waitForStableFile(normalized, { stableMs: folder.stabilityWaitMs || settings.stabilityDelayMs });
    if (!stability.ok) {
      return {
        queued: false,
        reason:
          stability.reason === "gone"
            ? "The file disappeared before it finished writing."
            : stability.reason === "timeout"
              ? "The file never stopped growing (still recording?)."
              : "Stopped waiting for the file to settle.",
      };
    }
  }

  let stat;
  try {
    stat = fs.statSync(normalized);
  } catch {
    return { queued: false, reason: "The file is no longer available on disk." };
  }
  if (!stat.isFile()) return { queued: false, reason: "Not a file." };

  const filter = folderPassesFilters(folder, normalized, stat.size);
  if (!filter.ok) return { queued: false, reason: `Skipped (${filter.reason}).` };

  const existingRows = opts.existingRows ?? (await db
    .select({
      id: uploadQueue.id,
      localPath: uploadQueue.localPath,
      fileSize: uploadQueue.fileSize,
      fileHash: uploadQueue.fileHash,
      status: uploadQueue.status,
      driveFileId: uploadQueue.driveFileId,
    })
    .from(uploadQueue));

  const hash =
    settings.hashBeforeUpload || existingRows.length < 500
      ? await fingerprintFile(normalized, stat.size).catch(() => null)
      : null;

  const verdict = findDuplicate(
    { localPath: normalized, size: stat.size, mtimeMs: stat.mtimeMs, hash },
    existingRows.map((r) => ({
      id: r.id,
      localPath: r.localPath,
      fileSize: r.fileSize,
      fileHash: r.fileHash,
      driveFileId: r.driveFileId,
      status: r.status,
    })),
    { allowDuplicates: settings.uploadDuplicates },
  );
  if (verdict.duplicate) {
    await logActivity("queue", `Skipped ${path.basename(normalized)} — ${verdict.reason}`, {
      status: "skipped",
      filePath: normalized,
    });
    return { queued: false, reason: verdict.reason };
  }

  const folderBaseName = folder.label || path.basename(folder.path) || "Backup";
  const subSegments = folder.preserveStructure !== false ? relativeSegmentsFor(folder.path, normalized) : [];
  const segments = [folderBaseName, ...subSegments];
  await db
    .update(uploadQueue)
    .set({ status: "skipped" })
    .where(and(eq(uploadQueue.localPath, normalized), inArray(uploadQueue.status, ["failed", "canceled", "waiting"])));

  const inserted = await db
    .insert(uploadQueue)
    .values({
      localPath: normalized,
      fileName: path.basename(normalized),
      fileSize: stat.size,
      fileHash: hash,
      mimeType: mimeTypeFor(normalized),
      sourceFolderId: folder.id,
      sourcePath: folder.path,
      relativePath: segments.length ? segments.join("/") : null,
      status: "waiting",
      maxRetries: settings.maxRetries,
      protected: isPathProtected(normalized, await protectedPathList()),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: uploadQueue.id });

  if (inserted.length === 0) return { queued: false, reason: "Already in the queue." };
  await logActivity("queue", `Queued ${path.basename(normalized)} (${(stat.size / 1048576).toFixed(1)} MB) for backup.`, {
    status: "waiting",
    filePath: normalized,
  });
  return { queued: true, reason: "Queued.", queueId: inserted[0].id };
}

async function handleNewFile(folder: MonitoredFolder, filePath: string) {
  const res = await enqueueFile(folder, filePath);
  if (res.queued) {
    void processQueue();
  }
}

/** "Upload Existing Files": scans a folder and queues everything already in it. */
export async function scanFolderExisting(folderId: number, limit = 100000) {
  const rows = await db.select().from(monitoredFolders).where(eq(monitoredFolders.id, folderId));
  const folder = rows[0];
  if (!folder) throw new Error("Folder not found.");
  let queued = 0;

  const existingRows = await db
    .select({
      id: uploadQueue.id,
      localPath: uploadQueue.localPath,
      fileSize: uploadQueue.fileSize,
      fileHash: uploadQueue.fileHash,
      status: uploadQueue.status,
      driveFileId: uploadQueue.driveFileId,
    })
    .from(uploadQueue);

  const walk = async (dir: string, depth: number) => {
    if (depth > 25 || queued >= limit) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (queued >= limit) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (folder.recursive !== false) await walk(full, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        const filter = folderPassesFilters(folder, full, fs.statSync(full).size);
        if (!filter.ok) continue;
        const r = await enqueueFile({ ...folder, autoUpload: true }, full, { skipStability: true, existingRows });
        if (r.queued) queued += 1;
      }
    } catch {
      /* ignore inaccessible subdirs */
    }
  };

  await walk(folder.path, 0);
  await db.update(monitoredFolders).set({ lastScanAt: new Date() }).where(eq(monitoredFolders.id, folderId));
  await logActivity("watch", `Scanned ${queued} file(s) in ${folder.path} (subfolders preserved).`, { status: "info", filePath: folder.path });
  void processQueue();
  return { started: true, queued };
}

/* ------------------------------------------------------------------ */
/* Queue processing                                                    */
/* ------------------------------------------------------------------ */

export async function pauseEngine() {
  state().paused = true;
  for (const control of state().controls.values()) control.paused = true;
  await updateSettings({ enginePaused: true }).catch(() => undefined);
  await db
    .update(uploadQueue)
    .set({ status: "paused", updatedAt: new Date(), nextAttemptAt: null })
    .where(inArray(uploadQueue.status, ["waiting", "uploading", "preparing", "retrying"]));
  await logActivity("engine", "Uploads paused.", { status: "paused", notify: true });
}

export async function resumeEngine() {
  state().paused = false;
  for (const control of state().controls.values()) control.paused = false;
  await updateSettings({ enginePaused: false }).catch(() => undefined);
  await db
    .update(uploadQueue)
    .set({ status: "waiting", updatedAt: new Date(), nextAttemptAt: null, errorCode: null, errorMessage: null })
    .where(eq(uploadQueue.status, "paused"));
  await logActivity("engine", "Uploads resumed.", { status: "info", notify: true });
  void processQueue();
}

export function setPaused(paused: boolean) {
  state().paused = paused;
  for (const control of state().controls.values()) control.paused = paused;
  void updateSettings({ enginePaused: paused }).catch(() => undefined);
}

export async function pauseItem(id: number) {
  const control = state().controls.get(id);
  if (control) control.paused = true;
  await db
    .update(uploadQueue)
    .set({ status: "paused", updatedAt: new Date(), nextAttemptAt: null })
    .where(eq(uploadQueue.id, id));
}

export async function resumeItem(id: number) {
  const control = state().controls.get(id);
  if (control) control.paused = false;
  await db
    .update(uploadQueue)
    .set({ status: "waiting", updatedAt: new Date(), nextAttemptAt: null, errorCode: null, errorMessage: null })
    .where(eq(uploadQueue.id, id));
  void processQueue();
}

export async function cancelItem(id: number) {
  const control = state().controls.get(id);
  if (control) control.canceled = true;
  await abortSessionsForQueue(id);
  await db
    .delete(uploadQueue)
    .where(eq(uploadQueue.id, id));
  state().live.delete(id);
  state().controls.delete(id);
}

export async function cancelAllItems(): Promise<number> {
  const s = state();
  for (const [id, control] of s.controls.entries()) {
    control.canceled = true;
    await abortSessionsForQueue(id).catch(() => undefined);
  }
  s.controls.clear();
  s.live.clear();
  const deleted = await db.delete(uploadQueue).returning({ id: uploadQueue.id });
  await logActivity("engine", `Cancelled and cleared ${deleted.length} item(s) from the upload queue.`, {
    status: "info",
    notify: true,
  });
  return deleted.length;
}

export async function retryItem(id: number) {
  await db
    .update(uploadQueue)
    .set({
      status: "waiting",
      retryCount: 0,
      errorCode: null,
      errorMessage: null,
      nextAttemptAt: null,
      progress: 0,
      updatedAt: new Date(),
    })
    .where(eq(uploadQueue.id, id));
}

async function detectGaming() {
  const settings = await getSettings();
  const s = state();
  if (!settings.gamingMode) {
    s.gamingDetected = false;
    s.matchedGames = [];
    return;
  }
  const list = settings.gameProcesses.split(",").map((p) => p.trim()).filter(Boolean);
  const res = detectGameRunning(list);
  if (res.running && !s.gamingDetected) {
    await logActivity("engine", `Gaming Mode engaged (${res.matched.join(", ")}). Uploads ${settings.gamingModeAction === "pause" ? "paused" : "throttled"}.`, {
      status: "paused",
      notify: true,
    });
  }
  if (!res.running && s.gamingDetected) {
    await logActivity("engine", "Gaming Mode released. Uploads resumed.", { status: "info", notify: true });
  }
  s.gamingDetected = res.running;
  s.matchedGames = res.matched;
}

async function checkStorageThreshold() {
  const settings = await getSettings();
  const s = state();
  const disk = localDiskStats(process.platform === "win32" ? "C:\\" : "/");
  const used = disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
  if (used >= settings.storageThresholdPercent && !s.storageWarned && settings.notifyStorageLow && settings.notifications) {
    s.storageWarned = true;
    await logActivity(
      "storage",
      `Your PC storage is ${used.toFixed(0)}% full (${(disk.freeBytes / 1073741824).toFixed(1)} GB free). Consider cleaning up backed-up files.`,
      { status: "warning", notify: true, errorCode: "STORAGE_LOW" },
    );
  } else if (used < settings.storageThresholdPercent - 5) {
    s.storageWarned = false;
  }
}

async function pickNextBatch(concurrency: number) {
  const now = new Date();
  const rows = await db
    .select()
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.status, "waiting"),
        or(isNull(uploadQueue.nextAttemptAt), sql`${uploadQueue.nextAttemptAt} <= ${now}`),
      ),
    )
    .orderBy(uploadQueue.createdAt)
    .limit(concurrency * 3);
  return rows;
}

export async function processQueue() {
  if (g.__drivevaultTickBusy) return;
  g.__drivevaultTickBusy = true;
  try {
    const s = state();
    const settings = await getSettings();
    if (settings.enginePaused || s.paused) {
      s.paused = true;
      return;
    }
    if (s.gamingDetected && settings.gamingModeAction === "pause") return;

    // Without a Drive connection the queue is held untouched (no wasted retries).
    const auth = await getAuthStatus().catch(() => ({ connected: false }));
    if (!auth.connected) return;

    let concurrency = settings.concurrentUploads;
    if (s.gamingDetected && settings.gamingModeAction === "slow") concurrency = 1;

    const capacity = concurrency - s.inflight.size;
    if (capacity <= 0) return;

    const candidates = await pickNextBatch(capacity);
    for (const item of candidates.slice(0, capacity)) {
      if (s.inflight.has(item.id)) continue;
      s.inflight.add(item.id);
      void runItem(item.id).finally(() => {
        s.inflight.delete(item.id);
        void processQueue();
      });
    }

    // Fire the "all queued files uploaded" notification on the active→idle edge.
    const activeNow = s.inflight.size > 0;
    if (activeNow) s.hadActive = true;
    if (s.hadActive && !activeNow && candidates.length === 0) {
      const remaining = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(uploadQueue)
        .where(inArray(uploadQueue.status, ["waiting", "preparing", "uploading", "paused", "retrying"]));
      if (Number(remaining[0]?.n ?? 0) === 0) {
        s.hadActive = false;
        if (settings.notifyQueueEmpty && settings.notifications) {
          await logActivity("engine", "All queued files have been uploaded and verified. You're all caught up!", {
            status: "completed",
            notify: true,
          });
        }
      }
    }
  } catch (err) {
    void logActivity("engine", `Queue loop error: ${(err as Error).message}`, { status: "warning" });
  } finally {
    g.__drivevaultTickBusy = false;
  }
}

async function runItem(queueId: number) {
  const s = state();
  const settings = await getSettings();
  const rows = await db.select().from(uploadQueue).where(eq(uploadQueue.id, queueId));
  const item = rows[0];
  if (!item) return;

  if (!fs.existsSync(item.localPath)) {
    await db
      .update(uploadQueue)
      .set({ status: "failed", errorCode: "FILE_GONE", errorMessage: "The local file disappeared before the upload started.", updatedAt: new Date() })
      .where(eq(uploadQueue.id, queueId));
    await logActivity("error", `${item.fileName} was moved or deleted before uploading. The queue entry was kept.`, {
      status: "failed",
      errorCode: "FILE_GONE",
      filePath: item.localPath,
    });
    return;
  }

  const stat = fs.statSync(item.localPath);
  const control: UploadControl = { paused: s.paused, canceled: false };
  s.controls.set(queueId, control);

  await db
    .update(uploadQueue)
    .set({ status: "preparing", fileSize: stat.size, startedAt: new Date(), updatedAt: new Date() })
    .where(eq(uploadQueue.id, queueId));

  try {
    const rootFolderId = await getDestinationFolderId();
    const segments =
      item.relativePath && item.relativePath.length > 0
        ? item.relativePath.split("/").filter(Boolean)
        : [];
    const parentId = segments.length ? await ensureFolderChain(rootFolderId, segments) : rootFolderId;
    const destPath = await destinationPathFor(segments);

    await db
      .update(uploadQueue)
      .set({
        status: "uploading",
        destinationFolderId: parentId,
        destinationPath: destPath,
        updatedAt: new Date(),
      })
      .where(eq(uploadQueue.id, queueId));

    let lastPersist = 0;
    const outcome = await runResumableUpload({
      queueId,
      localPath: item.localPath,
      fileName: item.fileName,
      size: stat.size,
      mimeType: item.mimeType || mimeTypeFor(item.fileName),
      parentFolderId: parentId,
      chunkSizeBytes: Math.max(1, settings.chunkSizeMb) * 1024 * 1024,
      speedLimitBytesPerSec: settings.uploadSpeedLimitKbps * 1024,
      maxChunkRetries: 6,
      control,
      onProgress: (p) => {
        s.live.set(queueId, { bytesUploaded: p.bytesUploaded, speedBps: p.speedBps, etaSeconds: p.etaSeconds });
        const now = Date.now();
        if (now - lastPersist > 1200) {
          lastPersist = now;
          void db
            .update(uploadQueue)
            .set({
              bytesUploaded: p.bytesUploaded,
              progress: stat.size > 0 ? Math.min(100, (p.bytesUploaded / stat.size) * 100) : 0,
              speedBps: p.speedBps,
              etaSeconds: p.etaSeconds,
              status: "uploading",
              updatedAt: new Date(),
            })
            .where(eq(uploadQueue.id, queueId))
            .catch(() => undefined);
        }
      },
    });

    if (control.canceled) {
      await db
        .update(uploadQueue)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(uploadQueue.id, queueId));
      s.live.delete(queueId);
      return;
    }

    // --- VERIFY BEFORE ANYTHING ELSE HAPPENS TO THE LOCAL FILE ---
    const verification = await verifyDriveFile(outcome.driveFileId, stat.size);
    if (!verification.ok) {
      throw new UploadError("VERIFY_FAILED", verification.reason ?? "Could not verify the file in Google Drive.", true);
    }

    const now = new Date();
    await db
      .update(uploadQueue)
      .set({
        status: "completed",
        progress: 100,
        bytesUploaded: stat.size,
        driveFileId: outcome.driveFileId,
        verifiedAt: now,
        completedAt: now,
        errorMessage: null,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(uploadQueue.id, queueId));

    const keepUntil =
      settings.keepLocalDays > 0 ? new Date(now.getTime() + settings.keepLocalDays * 86_400_000) : null;
    await db.insert(uploadedFiles).values({
      queueId,
      driveFileId: outcome.driveFileId,
      driveFolderId: parentId,
      drivePath: `${destPath}/${item.fileName}`,
      fileName: item.fileName,
      localPath: item.localPath,
      fileSize: stat.size,
      fileHash: item.fileHash,
      mimeType: item.mimeType,
      uploadedAt: now,
      verifiedAt: now,
      keepLocalUntil: keepUntil,
    });

    s.live.delete(queueId);
    await logActivity(
      "verify",
      `${item.fileName} is safely stored in Google Drive (${(stat.size / 1048576).toFixed(1)} MB verified).`,
      { status: "completed", filePath: item.localPath, notify: settings.notifyOnComplete && settings.notifications },
    );

    // Optional automatic local cleanup — only after successful verification.
    const verdict = evaluateDeletion({
      localPath: item.localPath,
      verified: true,
      driveFileId: outcome.driveFileId,
      uploadedAt: now.toISOString(),
      exists: fs.existsSync(item.localPath),
      protectedPaths: await protectedPathList(),
      neverDeleteAutomatically: settings.neverDeleteAutomatically,
      autoDeleteEnabled: (item.sourceFolderId ? await folderDeleteSetting(item.sourceFolderId) : false) || settings.deleteAfterUpload,
      keepLocalDays: settings.keepLocalDays,
    });

    if (verdict.safe) {
      const removed = safeUnlink(item.localPath);
      if (removed.ok) {
        await db
          .update(uploadQueue)
          .set({ status: "deleted_locally", deletedLocally: true, updatedAt: new Date() })
          .where(eq(uploadQueue.id, queueId));
        await db
          .update(uploadedFiles)
          .set({ deletedLocallyAt: new Date() })
          .where(eq(uploadedFiles.queueId, queueId));
        await logActivity("cleanup", `Freed ${(stat.size / 1048576).toFixed(1)} MB: ${item.fileName} removed from this PC after verified backup.`, {
          status: "deleted_locally",
          filePath: item.localPath,
          notify: settings.notifications,
        });
      } else {
        await logActivity("cleanup", `Could not remove ${item.fileName}: ${removed.error}`, {
          status: "warning",
          filePath: item.localPath,
        });
      }
    }
  } catch (err) {
    const isAuth = (err as Error)?.name === "AuthError";
    const d = isAuth
      ? { code: "AUTH_EXPIRED", message: (err as Error).message, retryable: false }
      : describeGoogleError(err);
    const code = err instanceof UploadError ? err.code : d.code;
    const retryable = err instanceof UploadError ? err.retryable : d.retryable;
    const attempts = item.retryCount + 1;

    s.live.delete(queueId);

    if (code === "CANCELED") {
      await db
        .update(uploadQueue)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(uploadQueue.id, queueId));
      return;
    }

    if (code === "PARENT_NOT_FOUND" || code === "NOT_FOUND" || /404|File not found|notFound/i.test(d.message) || /404|File not found|notFound/i.test(String(err))) {
      await clearFolderCache();
      await db.delete(uploadSessions).where(eq(uploadSessions.queueId, queueId));
      await db
        .update(uploadQueue)
        .set({
          status: "waiting",
          retryCount: 0,
          destinationFolderId: null,
          errorCode: null,
          errorMessage: null,
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(uploadQueue.id, queueId));
      await logActivity("engine", `${item.fileName}: destination folder was missing on Drive. Folder cache cleared — will re-create automatically.`, {
        status: "info",
        filePath: item.localPath,
      });
      return;
    }

    const authBlocked = ["AUTH_EXPIRED", "NOT_CONNECTED", "OAUTH_NOT_CONFIGURED"].includes(code);
    if (authBlocked) {
      await db
        .update(uploadQueue)
        .set({ status: "waiting", errorCode: code, errorMessage: d.message, nextAttemptAt: null, updatedAt: new Date() })
        .where(eq(uploadQueue.id, queueId));
      await logActivity("auth", d.message, { status: "warning", errorCode: code, filePath: item.localPath });
      return;
    }

    if (retryable && attempts <= (item.maxRetries || settings.maxRetries)) {
      const delay = backoffDelay(attempts, settings.retryDelayMs, settings.retryBackoffFactor);
      await db
        .update(uploadQueue)
        .set({
          status: "retrying",
          retryCount: attempts,
          errorCode: code,
          errorMessage: d.message,
          nextAttemptAt: new Date(Date.now() + delay),
          updatedAt: new Date(),
        })
        .where(eq(uploadQueue.id, queueId));
      await logActivity("retry", `${item.fileName}: ${d.message} Retrying in ${Math.round(delay / 1000)}s (attempt ${attempts}).`, {
        status: "retrying",
        errorCode: code,
        filePath: item.localPath,
        notify: false,
      });
      return;
    }

    await db
      .update(uploadQueue)
      .set({
        status: "failed",
        retryCount: attempts,
        errorCode: code,
        errorMessage: d.message,
        updatedAt: new Date(),
      })
      .where(eq(uploadQueue.id, queueId));
    await logActivity("error", `${item.fileName}: ${d.message} Your local file was left untouched.`, {
      status: "failed",
      errorCode: code,
      filePath: item.localPath,
      notify: settings.notifyOnFail && settings.notifications,
    });
  } finally {
    s.controls.delete(queueId);
  }
}

export async function protectedPathList(): Promise<string[]> {
  const rows = await db.select({ path: protectedPaths.path }).from(protectedPaths);
  return rows.map((r) => r.path);
}

async function folderDeleteSetting(folderId: number): Promise<boolean> {
  const rows = await db.select().from(monitoredFolders).where(eq(monitoredFolders.id, folderId));
  return rows[0]?.deleteAfterUpload ?? false;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export async function startEngine() {
  const s = state();
  if (s.started) return engineStatus();
  s.started = true;

  const settings = await getSettings();
  s.paused = Boolean(settings.enginePaused);

  // Resume interrupted uploads from a previous run ONLY if not paused!
  if (!s.paused) {
    const interrupted = await db
      .select()
      .from(uploadQueue)
      .where(inArray(uploadQueue.status, ["uploading", "preparing", "retrying"]));
    if (interrupted.length > 0) {
      await db
        .update(uploadQueue)
        .set({ status: "waiting", nextAttemptAt: null, updatedAt: new Date() })
        .where(inArray(uploadQueue.status, ["uploading", "preparing", "retrying"]));
      await logActivity("engine", `Resuming ${interrupted.length} upload(s) interrupted by the last shutdown.`, {
        status: "info",
        notify: true,
      });
    }
  }

  await refreshWatchers();
  await detectGaming();
  s.tickTimer = setInterval(() => {
    void processQueue().catch(() => undefined);
  }, 2000);
  s.gameTimer = setInterval(() => {
    void detectGaming().catch(() => undefined);
    void checkStorageThreshold().catch(() => undefined);
  }, 15_000);

  await logActivity("engine", `DriveVault backup engine started (${s.paused ? "Paused" : "Active"}).`, { status: s.paused ? "paused" : "info" });
  return engineStatus();
}

export async function stopEngine() {
  const s = state();
  if (s.tickTimer) clearInterval(s.tickTimer);
  if (s.gameTimer) clearInterval(s.gameTimer);
  for (const control of s.controls.values()) control.paused = true;
  for (const [, watcher] of s.watchers) await watcher.close().catch(() => undefined);
  s.watchers.clear();
  s.started = false;
  await logActivity("engine", "DriveVault backup engine stopped.", { status: "info" });
}

export async function ensureEngineStarted() {
  if (!state().started) return startEngine();
  return engineStatus();
}

export async function queueCounts() {
  const rows = await db
    .select({ status: uploadQueue.status, count: sql<number>`count(*)::int` })
    .from(uploadQueue)
    .groupBy(uploadQueue.status);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = Number(r.count);
    return acc;
  }, {});
}

export async function recentQueue(limit = 200) {
  return db.select().from(uploadQueue).orderBy(desc(uploadQueue.createdAt)).limit(limit);
}
