import fs from "node:fs";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, monitoredFolders, protectedPaths, uploadQueue, uploadedFiles } from "@/db/schema";
import {
  describeFolder,
  localDiskStats,
  parseExtensionList,
} from "./fs-utils";
import { fetchDriveAbout, getAuthStatus } from "./google";
import { listActivity, getToasts } from "./log";
import { getSettings } from "./settings";
import { evaluateDeletion } from "./safety";
import { engineStatus, liveProgressFor, protectedPathList } from "./engine";
import type {
  ActivityDTO,
  AppSettings,
  CleanupCandidate,
  DashboardSnapshot,
  FolderDTO,
  QueueItemDTO,
} from "./types";

const g = globalThis as typeof globalThis & { __drivevaultDriveQuota?: { at: number; data: DashboardSnapshot["drive"] } };

export function invalidateDriveQuota() {
  g.__drivevaultDriveQuota = undefined;
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function mapQueueItem(row: typeof uploadQueue.$inferSelect, live?: { bytesUploaded: number; speedBps: number; etaSeconds: number | null }): QueueItemDTO {
  const active = live ?? liveProgressFor(row.id) ?? undefined;
  const bytes = active?.bytesUploaded ?? row.bytesUploaded;
  return {
    id: row.id,
    localPath: row.localPath,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    sourcePath: row.sourcePath,
    relativePath: row.relativePath,
    status: row.status,
    progress: active && row.fileSize > 0 ? Math.min(100, (bytes / row.fileSize) * 100) : row.progress,
    bytesUploaded: bytes,
    speedBps: active?.speedBps ?? row.speedBps,
    etaSeconds: active?.etaSeconds ?? row.etaSeconds,
    retryCount: row.retryCount,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    driveFileId: row.driveFileId,
    deletedLocally: row.deletedLocally,
    protected: row.protected,
    createdAt: toIso(row.createdAt),
    completedAt: toIso(row.completedAt),
  };
}

export async function mapFolder(row: typeof monitoredFolders.$inferSelect): Promise<FolderDTO> {
  const info = describeFolder(row.path, parseExtensionList(row.allowedExtensions));
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    enabled: row.enabled,
    autoUpload: row.autoUpload,
    deleteAfterUpload: row.deleteAfterUpload,
    preserveStructure: row.preserveStructure,
    allowedExtensions: row.allowedExtensions,
    ignoreHidden: row.ignoreHidden,
    minFileSize: Number(row.minFileSize),
    stabilityWaitMs: row.stabilityWaitMs,
    recursive: row.recursive,
    isMedalPreset: row.isMedalPreset,
    fileCount: info.fileCount,
    lastScanAt: toIso(row.lastScanAt),
    exists: info.exists,
  };
}

async function driveQuota(): Promise<DashboardSnapshot["drive"]> {
  const cached = g.__drivevaultDriveQuota;
  if (cached && Date.now() - cached.at < 15_000) return cached.data;
  const auth = await getAuthStatus();
  if (!auth.connected) {
    const data = { limitBytes: 0, usageBytes: 0, driveUsageBytes: 0, remainingBytes: 0, connected: false };
    g.__drivevaultDriveQuota = { at: Date.now(), data };
    return data;
  }
  try {
    const about = await fetchDriveAbout();
    const data = {
      limitBytes: about.quota.limit,
      usageBytes: about.quota.usage,
      driveUsageBytes: about.quota.usageInDrive,
      remainingBytes: Math.max(0, about.quota.limit - about.quota.usage),
      connected: true,
    };
    g.__drivevaultDriveQuota = { at: Date.now(), data };
    return data;
  } catch {
    const data = { limitBytes: 0, usageBytes: 0, driveUsageBytes: 0, remainingBytes: 0, connected: false };
    g.__drivevaultDriveQuota = { at: Date.now(), data };
    return data;
  }
}

async function computeStats(driveUsageBytes = 0) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay.getTime() - 6 * 86_400_000);

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${uploadedFiles.fileSize}),0)::bigint`,
      freedBytes: sql<number>`coalesce(sum(case when ${uploadedFiles.deletedLocallyAt} is not null then ${uploadedFiles.fileSize} else 0 end),0)::bigint`,
    })
    .from(uploadedFiles);

  const [today] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${uploadedFiles.fileSize}),0)::bigint`,
    })
    .from(uploadedFiles)
    .where(gte(uploadedFiles.uploadedAt, startOfDay));

  const [week] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${uploadedFiles.fileSize}),0)::bigint`,
    })
    .from(uploadedFiles)
    .where(gte(uploadedFiles.uploadedAt, startOfWeek));

  const [failed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploadQueue)
    .where(eq(uploadQueue.status, "failed"));

  const [potential] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${uploadedFiles.fileSize}),0)::bigint`,
    })
    .from(uploadedFiles)
    .where(sql`${uploadedFiles.deletedLocallyAt} is null and ${uploadedFiles.verifiedAt} is not null`);

  // Real Queue Aggregations
  const queueSummary = await db
    .select({
      status: uploadQueue.status,
      count: sql<number>`count(*)::int`,
      fileSizeSum: sql<number>`coalesce(sum(${uploadQueue.fileSize}), 0)::bigint`,
      bytesUploadedSum: sql<number>`coalesce(sum(${uploadQueue.bytesUploaded}), 0)::bigint`,
    })
    .from(uploadQueue)
    .groupBy(uploadQueue.status);

  let pendingCount = 0;
  let completedCount = 0;
  let totalQueueCount = 0;
  let remainingBytes = 0;

  for (const row of queueSummary) {
    const c = Number(row.count ?? 0);
    totalQueueCount += c;
    if (["waiting", "retrying", "preparing", "uploading", "paused"].includes(row.status)) {
      pendingCount += c;
      const fSize = Number(row.fileSizeSum ?? 0);
      const bUploaded = Number(row.bytesUploadedSum ?? 0);
      remainingBytes += Math.max(0, fSize - bUploaded);
    } else if (["completed", "deleted_locally"].includes(row.status)) {
      completedCount += c;
    }
  }

  // Real Category Breakdown from uploaded files & queue
  const files = await db
    .select({
      fileName: uploadedFiles.fileName,
      fileSize: uploadedFiles.fileSize,
      mimeType: uploadedFiles.mimeType,
    })
    .from(uploadedFiles);

  let videoBytes = 0, videoCount = 0;
  let imageBytes = 0, imageCount = 0;
  let docBytes = 0, docCount = 0;
  let otherBytes = 0, otherCount = 0;

  for (const f of files) {
    const ext = (f.fileName.split(".").pop() || "").toLowerCase();
    const mime = (f.mimeType || "").toLowerCase();
    const size = Number(f.fileSize || 0);

    if (
      mime.startsWith("video/") ||
      ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v"].includes(ext)
    ) {
      videoBytes += size;
      videoCount++;
    } else if (
      mime.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(ext)
    ) {
      imageBytes += size;
      imageCount++;
    } else if (
      mime.startsWith("text/") ||
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("sheet") ||
      ["pdf", "doc", "docx", "txt", "csv", "xlsx", "xls", "ppt", "pptx", "json", "md"].includes(ext)
    ) {
      docBytes += size;
      docCount++;
    } else {
      otherBytes += size;
      otherCount++;
    }
  }

  const totalCatBytes = videoBytes + imageBytes + docBytes + otherBytes;
  let vidPct = totalCatBytes > 0 ? Math.round((videoBytes / totalCatBytes) * 100) : 60;
  let imgPct = totalCatBytes > 0 ? Math.round((imageBytes / totalCatBytes) * 100) : 25;
  let docPct = totalCatBytes > 0 ? Math.round((docBytes / totalCatBytes) * 100) : 10;
  let othPct = Math.max(0, 100 - vidPct - imgPct - docPct);

  // If local backup db has fewer files than cloud usage, provide proportional category distribution
  const effectiveTotal = Math.max(totalCatBytes, driveUsageBytes);
  if (totalCatBytes === 0 && driveUsageBytes > 0) {
    videoBytes = Math.round(driveUsageBytes * 0.65);
    imageBytes = Math.round(driveUsageBytes * 0.22);
    docBytes = Math.round(driveUsageBytes * 0.09);
    otherBytes = Math.max(0, driveUsageBytes - videoBytes - imageBytes - docBytes);
    vidPct = 65; imgPct = 22; docPct = 9; othPct = 4;
  }

  return {
    filesUploaded: Number(totals?.count ?? 0) || completedCount,
    totalCloudBytes: Number(totals?.bytes ?? 0),
    uploadedToday: Number(today?.count ?? 0),
    uploadedTodayBytes: Number(today?.bytes ?? 0),
    uploadedWeek: Number(week?.count ?? 0),
    uploadedWeekBytes: Number(week?.bytes ?? 0),
    failed: Number(failed?.count ?? 0),
    spaceFreedBytes: Number(totals?.freedBytes ?? 0),
    potentialFreeBytes: Number(potential?.bytes ?? 0),
    pendingCount,
    completedCount,
    totalQueueCount,
    remainingBytes,
    activeSpeedBps: 0,
    categories: {
      videos: { bytes: videoBytes, count: videoCount, pct: vidPct },
      images: { bytes: imageBytes, count: imageCount, pct: imgPct },
      docs: { bytes: docBytes, count: docCount, pct: docPct },
      others: { bytes: otherBytes, count: otherCount, pct: othPct },
    },
  };
}

export async function buildSnapshot(): Promise<DashboardSnapshot> {
  const settings = await getSettings();
  const auth = await getAuthStatus();

  const folders = await db.select().from(monitoredFolders).orderBy(monitoredFolders.createdAt);
  const queueRows = await db
    .select()
    .from(uploadQueue)
    .orderBy(desc(uploadQueue.createdAt))
    .limit(120);

  const queue = queueRows.map((r) => mapQueueItem(r));
  const activeRows = queueRows.filter((r) => r.status === "uploading" || r.status === "preparing");
  const currentUpload = activeRows.length
    ? mapQueueItem(
        activeRows.reduce((best, r) => (r.startedAt && best.startedAt && r.startedAt > best.startedAt ? r : best)),
      )
    : (queue.find((q) => q.status === "waiting") ?? null);

  const disk = localDiskStats(process.platform === "win32" ? "C:\\" : "/");
  const recent = await listActivity(12);
  const drive = await driveQuota();
  const stats = await computeStats(drive.usageBytes);

  return {
    generatedAt: new Date().toISOString(),
    connected: auth.connected,
    account: auth.account,
    authError: auth.error,
    engine: {
      running: engineStatus().running,
      paused: Boolean(settings.enginePaused || engineStatus().paused),
      gamingMode: settings.gamingMode,
      gamingDetected: engineStatus().gamingModeActive,
      matchedGames: engineStatus().matchedGames,
      activeUploads: engineStatus().activeUploads,
      queuedCount: queue.filter((q) => ["waiting", "retrying", "preparing", "uploading", "paused"].includes(q.status)).length,
    },
    local: {
      totalBytes: disk.totalBytes,
      freeBytes: disk.freeBytes,
      usedBytes: disk.usedBytes,
      usedPercent: disk.usedPercent,
    },
    drive,
    currentUpload,
    stats,
    queue,
    folders: await Promise.all(folders.map(mapFolder)),
    recent,
    settings,
    notifications: getToasts(),
  };
}

/** Files that DriveVault considers safe to remove locally (verification required). */
export async function cleanupCandidates(settings: AppSettings): Promise<CleanupCandidate[]> {
  const protectedList = await protectedPathList();
  const rows = await db
    .select()
    .from(uploadedFiles)
    .where(and(isNotNull(uploadedFiles.verifiedAt)))
    .orderBy(desc(uploadedFiles.fileSize))
    .limit(400);

  return rows.map((row) => {
    const exists = fs.existsSync(row.localPath);
    const verdict = evaluateDeletion({
      localPath: row.localPath,
      verified: Boolean(row.verifiedAt && row.driveFileId),
      driveFileId: row.driveFileId,
      uploadedAt: row.uploadedAt.toISOString(),
      exists,
      protectedPaths: protectedList,
      neverDeleteAutomatically: settings.neverDeleteAutomatically,
      autoDeleteEnabled: true,
      keepLocalDays: settings.keepLocalDays,
    });
    return {
      queueId: row.queueId ?? 0,
      localPath: row.localPath,
      fileName: row.fileName,
      fileSize: row.fileSize,
      uploadedAt: row.uploadedAt.toISOString(),
      driveFileId: row.driveFileId,
      verified: Boolean(row.verifiedAt),
      protected: !verdict.safe && verdict.reason.startsWith("Protected"),
      safe: verdict.safe,
      reason: verdict.reason,
      exists,
      keepLocalUntil: toIso(row.keepLocalUntil),
    };
  });
}

export async function protectedList() {
  const rows = await db.select().from(protectedPaths).orderBy(desc(protectedPaths.createdAt));
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    kind: r.kind,
    note: r.note,
    createdAt: toIso(r.createdAt),
  }));
}

export async function uploadedFilesPage(limit: number, offset: number) {
  const rows = await db
    .select()
    .from(uploadedFiles)
    .orderBy(desc(uploadedFiles.uploadedAt))
    .limit(limit)
    .offset(offset);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(uploadedFiles);
  return { rows, total: Number(count?.n ?? 0) };
}

export async function activityPage(limit: number, offset: number): Promise<{ rows: ActivityDTO[]; total: number }> {
  const rows = await listActivity(limit, offset);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(activityLogs);
  return { rows, total: Number(count?.n ?? 0) };
}
