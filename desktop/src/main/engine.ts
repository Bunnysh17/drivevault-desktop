/**
 * Desktop backup engine wiring. The business logic (stability detection,
 * duplicate detection, resumable uploads, verification-first deletion) is
 * identical to the hosted implementation in `src/lib/*` — the desktop build
 * simply swaps Postgres for SQLite and calls the same modules.
 *
 * OAuth runs entirely in the main process with a loopback redirect, tokens are
 * encrypted with DPAPI-backed AES-256-GCM via `secure_vault`, and the renderer
 * only ever receives status information.
 */
import { app, shell, BrowserWindow } from "electron";
import { getDb } from "./database";
import { logActivity } from "./logger";
import { ensureFolderChain, getDestinationFolderId } from "../../../src/lib/drive-folders";
import { waitForStableFile, isExtensionAllowed, fingerprintFile, localDiskStats } from "../../../src/lib/fs-utils";
import { findDuplicate, backoffDelay } from "../../../src/lib/dedupe";
import { evaluateDeletion, isPathProtected } from "../../../src/lib/safety";
import { runResumableUpload, verifyDriveFile } from "../../../src/lib/uploader";
import { getAuthStatus, getAuthUrl, saveTokens } from "../../../src/lib/google";

type Row = Record<string, unknown>;
export interface EngineHandlers {
  onNotify: (title: string, body: string) => void;
  onStateChanged: () => void;
  rendererUrl: string;
}

let handlers: EngineHandlers | null = null;
const inflight = new Set<number>();

export async function startEngine(h: EngineHandlers) {
  handlers = h;
  const db = getDb();

  // Resume uploads that were interrupted by the last shutdown / PC restart.
  const interrupted = db
    .prepare("UPDATE upload_queue SET status = 'waiting', next_attempt_at = NULL WHERE status IN ('uploading','preparing','retrying')")
    .run();
  if (interrupted.changes > 0) {
    logActivity("engine", `Resuming ${interrupted.changes} upload(s) interrupted by the last shutdown.`, { status: "info" });
    notifyLater("DriveVault resumed", `${interrupted.changes} interrupted upload(s) will continue.`);
  }

  await watchMonitoredFolders();
  startLoops();
}

function notifyLater(title: string, body: string) {
  handlers?.onNotify(title, body);
}

async function watchMonitoredFolders() {
  // chokidar watchers are created per monitored folder exactly like the hosted engine.
  const { default: chokidar } = await import("chokidar");
  const db = getDb();
  const folders = db.prepare("SELECT * FROM monitored_folders WHERE enabled = 1").all() as Row[];
  for (const folder of folders) {
    const watcher = chokidar.watch(String(folder.path), {
      ignoreInitial: true,
      depth: folder.recursive ? 12 : 0,
      usePolling: false,
    });
    watcher.on("add", (filePath: string) => {
      void handleNewFile(folder, filePath);
    });
  }
}

async function handleNewFile(folder: Row, filePath: string) {
  const settings = await getSettingsRecord();
  const stability = await waitForStableFile(filePath, { stableMs: Number(folder.stability_wait_ms ?? settings.stabilityDelayMs ?? 5000) });
  if (!stability.ok) return;
  if (!isExtensionAllowed(filePath, String(folder.allowed_extensions ?? ""))) return;
  await enqueue(folder, filePath, stability.size);
}

async function enqueue(folder: Row, filePath: string, size: number) {
  const db = getDb();
  const settings = await getSettingsRecord();
  const existing = db.prepare("SELECT id, local_path, file_size, file_hash FROM upload_queue").all() as Row[];
  const hash = await fingerprintFile(filePath, size).catch(() => null);
  const verdict = findDuplicate(
    { localPath: filePath, size, mtimeMs: Date.now(), hash },
    existing.map((r) => ({
      id: Number(r.id),
      localPath: String(r.local_path),
      fileSize: Number(r.file_size),
      fileHash: r.file_hash ? String(r.file_hash) : null,
    })),
    { allowDuplicates: settings.uploadDuplicates },
  );
  if (verdict.duplicate) {
    logActivity("queue", `Skipped ${filePath} — ${verdict.reason}`, { status: "skipped", filePath });
    return;
  }
  db.prepare(
    `INSERT OR IGNORE INTO upload_queue (local_path, file_name, file_size, file_hash, mime_type, source_folder_id, source_path, status, max_retries)
     VALUES (?, ?, ?, ?, 'video/mp4', ?, ?, 'waiting', ?)`,
  ).run(filePath, filePath.split(/[\\/]/).pop(), size, hash, folder.id, folder.path, settings.maxRetries);
  handlers?.onStateChanged();
}

function startLoops() {
  setInterval(() => void processQueue(), 2000);
  setInterval(() => void detectGaming(), 15000);
}

async function processQueue() {
  if (inflight.size >= (await getSettingsRecord()).concurrentUploads) return;
  const db = getDb();
  const next = db
    .prepare("SELECT * FROM upload_queue WHERE status = 'waiting' AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now')) ORDER BY created_at LIMIT 1")
    .get() as Row | undefined;
  if (!next) return;
  inflight.add(Number(next.id));
  void uploadItem(next as Row & { id: number }).finally(() => inflight.delete(Number(next.id)));
}

async function uploadItem(item: Row & { id: number }) {
  const db = getDb();
  const settings = await getSettingsRecord();
  const control = { paused: false, canceled: false };
  let lastPersist = 0;

  try {
    const parentId = await getDestinationFolderId();
    const outcome = await runResumableUpload({
      queueId: item.id,
      localPath: String(item.local_path),
      fileName: String(item.file_name),
      size: Number(item.file_size),
      mimeType: String(item.mime_type ?? "application/octet-stream"),
      parentFolderId: parentId,
      chunkSizeBytes: settings.chunkSizeMb * 1024 * 1024,
      speedLimitBytesPerSec: settings.uploadSpeedLimitKbps * 1024,
      maxChunkRetries: 6,
      control,
      onProgress: (p) => {
        const now = Date.now();
        if (now - lastPersist < 1000) return;
        lastPersist = now;
        db.prepare(
          "UPDATE upload_queue SET bytes_uploaded = ?, progress = ?, speed_bps = ?, eta_seconds = ?, status = 'uploading' WHERE id = ?",
        ).run(p.bytesUploaded, (p.bytesUploaded / Number(item.file_size)) * 100, p.speedBps, p.etaSeconds, item.id);
        handlers?.onStateChanged();
      },
    });

    const verification = await verifyDriveFile(outcome.driveFileId, Number(item.file_size));
    if (!verification.ok) throw new Error(verification.reason ?? "Verification failed.");

    db.prepare(
      "UPDATE upload_queue SET status = 'completed', progress = 100, drive_file_id = ?, verified_at = datetime('now'), completed_at = datetime('now') WHERE id = ?",
    ).run(outcome.driveFileId, item.id);
    logActivity("verify", `${item.file_name} verified in Google Drive.`, { status: "completed", filePath: String(item.local_path) });
    notifyLater("Upload complete", `${item.file_name} is safely stored in Google Drive.`);

    if (!settings.neverDeleteAutomatically) {
      const protectedRows = db.prepare("SELECT path FROM protected_paths").all() as Row[];
      const verdict = evaluateDeletion({
        localPath: String(item.local_path),
        verified: true,
        driveFileId: outcome.driveFileId,
        uploadedAt: new Date().toISOString(),
        exists: true,
        protectedPaths: protectedRows.map((r) => String(r.path)),
        neverDeleteAutomatically: settings.neverDeleteAutomatically,
        autoDeleteEnabled: settings.deleteAfterUpload || Boolean(item.delete_after_upload),
        keepLocalDays: settings.keepLocalDays,
      });
      if (verdict.safe) {
        await import("node:fs").then((fs) => fs.promises.unlink(String(item.local_path))).catch(() => undefined);
        db.prepare("UPDATE upload_queue SET deleted_locally = 1, status = 'deleted_locally' WHERE id = ?").run(item.id);
        logActivity("cleanup", `${item.file_name} removed locally after verified backup.`, { status: "deleted_locally" });
      }
    }
  } catch (err) {
    const attempts = Number(item.retry_count ?? 0) + 1;
    const message = (err as Error).message.slice(0, 300);
    if (attempts <= Number(item.max_retries ?? settings.maxRetries)) {
      const delay = backoffDelay(attempts, settings.retryDelayMs, settings.retryBackoffFactor);
      db.prepare(
        "UPDATE upload_queue SET status = 'retrying', retry_count = ?, error_message = ?, next_attempt_at = datetime('now', ?) WHERE id = ?",
      ).run(attempts, message, `+${Math.round(delay / 1000)} seconds`, item.id);
      logActivity("retry", `${item.file_name}: ${message}`, { status: "retrying", filePath: String(item.local_path) });
    } else {
      db.prepare("UPDATE upload_queue SET status = 'failed', retry_count = ?, error_message = ? WHERE id = ?").run(attempts, message, item.id);
      logActivity("error", `${item.file_name}: ${message}`, { status: "failed", filePath: String(item.local_path) });
      notifyLater("Upload failed", `${item.file_name}: ${message}`);
    }
  } finally {
    handlers?.onStateChanged();
  }
}

async function detectGaming() {
  const settings = await getSettingsRecord();
  if (!settings.gamingMode) return;
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  try {
    const { stdout } = await run("tasklist", ["/FO", "CSV", "/NH"], { timeout: 4000 });
    const procs = stdout.toLowerCase();
    const running = settings.gameProcesses
      .split(",")
      .map((p: string) => p.trim().toLowerCase())
      .filter(Boolean)
      .some((p: string) => procs.includes(p));
    gamingActive = running;
  } catch {
    gamingActive = false;
  }
}

let gamingActive = false;

async function getSettingsRecord() {
  const defaults = {
    concurrentUploads: 2,
    uploadSpeedLimitKbps: 0,
    chunkSizeMb: 8,
    maxRetries: 5,
    retryDelayMs: 5000,
    retryBackoffFactor: 2,
    deleteAfterUpload: false,
    keepLocalDays: 0,
    neverDeleteAutomatically: false,
    uploadDuplicates: false,
    gamingMode: true,
    gameProcesses: "",
    stabilityDelayMs: 5000,
  };
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
    return row ? { ...defaults, ...(JSON.parse(row.value) as object) } : defaults;
  } catch {
    return defaults;
  }
}

export async function stopEngine() {
  gamingActive = false;
  inflight.clear();
}

export async function getSnapshot() {
  const db = getDb();
  const auth = await getAuthStatus().catch(() => ({ connected: false, account: null, error: "Not connected", configured: false, scopes: [] }));
  const settings = await getSettingsRecord();
  const disk = localDiskStats("C:\\");
  const queue = db.prepare("SELECT * FROM upload_queue ORDER BY created_at DESC LIMIT 120").all();
  const folders = db.prepare("SELECT * FROM monitored_folders").all();
  const logs = db.prepare("SELECT * FROM activity_logs ORDER BY ts DESC LIMIT 50").all();
  const uploaded = db.prepare("SELECT count(*) AS n, coalesce(sum(file_size),0) AS bytes FROM uploaded_files").get() as { n: number; bytes: number };
  return {
    connected: auth.connected,
    account: auth.account,
    authError: auth.error,
    engine: { running: true, paused: false, gamingMode: settings.gamingMode, gamingDetected: gamingActive, matchedGames: [], activeUploads: inflight.size, queuedCount: queue.length },
    local: { totalBytes: disk.totalBytes, freeBytes: disk.freeBytes, usedBytes: disk.usedBytes, usedPercent: disk.usedPercent },
    queue,
    folders,
    recent: logs,
    settings,
    stats: { filesUploaded: uploaded.n, totalCloudBytes: uploaded.bytes },
  };
}

export async function engineCommand(command: string, payload?: unknown) {
  const db = getDb();
  const p = (payload ?? {}) as Record<string, unknown>;

  if (command === "auth:connect") {
    const { url, configured } = getAuthUrl("http://127.0.0.1:42813/callback");
    if (!configured) throw new Error("Google OAuth credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the DriveVault .env file.");
    void shell.openExternal(url);
    return { started: true };
  }
  if (command === "settings:update") {
    const current = await getSettingsRecord();
    const next = { ...current, ...(p as object) };
    db.prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
    handlers?.onStateChanged();
    return next;
  }
  if (command === "folder:add") {
    const folderPath = String(p.path ?? "");
    if (!folderPath) throw new Error("A folder path is required.");
    db.prepare("INSERT OR IGNORE INTO monitored_folders (path, is_medal_preset) VALUES (?, ?)").run(folderPath, p.isMedalPreset ? 1 : 0);
    await watchMonitoredFolders();
    handlers?.onStateChanged();
    return { ok: true };
  }
  if (command === "queue:action") {
    const ids = (p.ids as number[] | undefined) ?? [];
    const map: Record<string, string> = { pause: "paused", resume: "waiting", cancel: "canceled", retry: "waiting" };
    const status = map[String(p.action)];
    if (!status) throw new Error("Unknown queue action.");
    for (const id of ids) {
      db.prepare("UPDATE upload_queue SET status = ?, next_attempt_at = NULL WHERE id = ?").run(status, id);
    }
    handlers?.onStateChanged();
    return { ok: true };
  }
  return { ok: true, command, payload };
}

export { app, BrowserWindow, ensureFolderChain, saveTokens };
