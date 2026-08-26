import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { monitoredFolders, uploadQueue, uploadedFiles } from "@/db/schema";
import { enqueueFile, processQueue, refreshWatchers } from "@/lib/engine";
import { formatBytes } from "@/lib/format";
import { describeFolder, isExtensionAllowed, normalizePath, parseExtensionList } from "@/lib/fs-utils";
import { logActivity } from "@/lib/log";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  formattedSize: string;
  modifiedAt: string;
  extension: string;
  isVideo: boolean;
  status?: "uploaded" | "queued" | "ready";
}

function getSystemLocations() {
  const home = os.homedir();
  const candidates = [
    { label: "Medal Clips", path: path.join(home, "Videos", "Medal") },
    { label: "Videos", path: path.join(home, "Videos") },
    { label: "Captures / Gaming", path: path.join(home, "Videos", "Captures") },
    { label: "Downloads", path: path.join(home, "Downloads") },
    { label: "Documents", path: path.join(home, "Documents") },
    { label: "Desktop", path: path.join(home, "Desktop") },
    { label: "Pictures", path: path.join(home, "Pictures") },
    { label: "Local Disk (C:)", path: "C:\\" },
    { label: "Drive (D:)", path: "D:\\" },
  ];

  return candidates.filter((c) => {
    try {
      return fs.existsSync(c.path);
    } catch {
      return false;
    }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetPath = url.searchParams.get("path");

  const systemLocations = getSystemLocations();

  if (!targetPath) {
    return Response.json({
      locations: systemLocations,
      currentPath: null,
      parentPath: null,
      items: [],
    });
  }

  const normalized = normalizePath(targetPath);
  if (!fs.existsSync(normalized)) {
    return Response.json({ error: "Folder does not exist on this PC.", locations: systemLocations }, { status: 404 });
  }

  const isDirectory = fs.statSync(normalized).isDirectory();
  if (!isDirectory) {
    return Response.json({ error: "Specified path is not a folder.", locations: systemLocations }, { status: 400 });
  }

  const entries = fs.readdirSync(normalized, { withFileTypes: true });
  const parent = path.dirname(normalized);
  const parentPath = parent !== normalized ? parent : null;

  // Query database to check which files are already queued or uploaded
  const existingQueue = await db
    .select({ localPath: uploadQueue.localPath, status: uploadQueue.status })
    .from(uploadQueue)
    .where(eq(uploadQueue.sourcePath, normalized));

  const existingUploaded = await db
    .select({ localPath: uploadedFiles.localPath })
    .from(uploadedFiles);

  const queueMap = new Map(existingQueue.map((q) => [normalizePath(q.localPath), q.status]));
  const uploadedSet = new Set(existingUploaded.map((u) => normalizePath(u.localPath)));

  const videoExts = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v", ".flv", ".wmv"]);

  const items: FsItem[] = [];

  for (const ent of entries) {
    if (ent.name.startsWith(".") || ent.name.startsWith("$")) continue;
    const fullPath = normalizePath(path.join(normalized, ent.name));
    try {
      const stat = fs.statSync(fullPath);
      const isDir = stat.isDirectory();
      const ext = path.extname(ent.name).toLowerCase();
      const isVideo = videoExts.has(ext);

      let status: "uploaded" | "queued" | "ready" = "ready";
      if (uploadedSet.has(fullPath)) {
        status = "uploaded";
      } else if (queueMap.has(fullPath)) {
        status = "queued";
      }

      items.push({
        name: ent.name,
        path: fullPath,
        isDir,
        size: isDir ? 0 : stat.size,
        formattedSize: isDir ? "--" : formatBytes(stat.size),
        modifiedAt: stat.mtime.toISOString(),
        extension: ext,
        isVideo,
        status: isDir ? undefined : status,
      });
    } catch {
      // Skip inaccessible or locked files
    }
  }

  // Sort directories first, then videos/files by modified date descending
  items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
  });

  const filesOnly = items.filter((i) => !i.isDir);
  const totalSizeBytes = filesOnly.reduce((acc, f) => acc + f.size, 0);
  const videoCount = filesOnly.filter((f) => f.isVideo).length;

  return Response.json({
    locations: systemLocations,
    currentPath: normalized,
    parentPath,
    itemCount: items.length,
    fileCount: filesOnly.length,
    videoCount,
    totalSizeBytes,
    formattedTotalSize: formatBytes(totalSizeBytes),
    items,
  });
}

export async function POST(request: Request) {
  let body: { action: string; path: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { action, path: targetPath, label } = body;
  if (!targetPath) return Response.json({ error: "Path is required." }, { status: 400 });

  const normalized = normalizePath(targetPath);
  if (!fs.existsSync(normalized)) {
    return Response.json({ error: "File or directory does not exist." }, { status: 404 });
  }

  if (action === "bindAndSyncFolder") {
    const settings = await getSettings();
    const info = describeFolder(normalized);

    // 1. Insert or get folder
    const existing = await db.select().from(monitoredFolders).where(eq(monitoredFolders.path, normalized));
    let folderId: number;
    let folderRow = existing[0];

    if (!folderRow) {
      const inserted = await db
        .insert(monitoredFolders)
        .values({
          path: normalized,
          label: label || path.basename(normalized),
          enabled: true,
          autoUpload: true,
          deleteAfterUpload: false,
          preserveStructure: settings.preserveStructure,
          allowedExtensions: settings.allowedExtensions,
          ignoreHidden: true,
          minFileSize: 0,
          stabilityWaitMs: 2000,
          recursive: true,
          fileCount: info.fileCount,
          lastScanAt: new Date(),
        })
        .returning();
      folderRow = inserted[0];
    }
    folderId = folderRow.id;

    // 2. Refresh watchers
    await refreshWatchers();

    // 3. Scan & enqueue existing files immediately
    let queued = 0;
    const allowed = parseExtensionList(folderRow.allowedExtensions);
    const files = fs.readdirSync(normalized, { withFileTypes: true });

    for (const file of files) {
      if (file.isFile()) {
        const filePath = normalizePath(path.join(normalized, file.name));
        if (isExtensionAllowed(file.name, folderRow.allowedExtensions)) {
          const res = await enqueueFile(folderRow, filePath, { skipStability: true });
          if (res.queued) queued++;
        }
      }
    }

    // Trigger upload loop
    void processQueue();

    await logActivity("folder", `Bound "${normalized}" and queued ${queued} file(s) for immediate sync.`, {
      status: "info",
      filePath: normalized,
      notify: true,
    });

    return Response.json({
      ok: true,
      folderId,
      queued,
      message: `Folder bound successfully! ${queued} file(s) queued for sync.`,
    });
  }

  if (action === "syncSingleFile") {
    const dir = path.dirname(normalized);
    const fileName = path.basename(normalized);

    // Get or create temporary monitored folder entry for this directory
    let folderRow = (await db.select().from(monitoredFolders).where(eq(monitoredFolders.path, dir)))[0];
    if (!folderRow) {
      const settings = await getSettings();
      const inserted = await db
        .insert(monitoredFolders)
        .values({
          path: dir,
          label: path.basename(dir),
          enabled: true,
          autoUpload: true,
          deleteAfterUpload: false,
          preserveStructure: false,
          allowedExtensions: settings.allowedExtensions,
          ignoreHidden: true,
          minFileSize: 0,
          stabilityWaitMs: 1000,
          recursive: false,
          fileCount: 1,
          lastScanAt: new Date(),
        })
        .returning();
      folderRow = inserted[0];
      await refreshWatchers();
    }

    const res = await enqueueFile(folderRow, normalized, { skipStability: true });
    void processQueue();

    if (!res.queued) {
      return Response.json({ ok: false, error: res.reason });
    }

    await logActivity("queue", `Single file "${fileName}" sent to upload queue for immediate sync.`, {
      status: "info",
      filePath: normalized,
      notify: true,
    });

    return Response.json({ ok: true, message: `"${fileName}" is now syncing to Google Drive!` });
  }

  return Response.json({ error: "Unsupported action." }, { status: 400 });
}
