import { z } from "zod";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredFolders } from "@/db/schema";
import { describeFolder, detectMedalFolders, normalizePath, parseExtensionList } from "@/lib/fs-utils";
import { mapFolder } from "@/lib/snapshot";
import { refreshWatchers, scanFolderExisting, processQueue } from "@/lib/engine";
import { ensureFolderChain, getDestinationFolderId } from "@/lib/drive-folders";
import path from "node:path";
import { logActivity } from "@/lib/log";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(monitoredFolders).orderBy(monitoredFolders.createdAt);
  return Response.json({ folders: await Promise.all(rows.map(mapFolder)) });
}

const addSchema = z.object({
  path: z.string().min(1).max(1000).optional(),
  id: z.coerce.number().int().positive().optional(),
  action: z.enum(["update", "scan", "test", "add"]).optional(),
  changes: z.record(z.string(), z.unknown()).optional(),
  label: z.string().max(120).nullish(),
  autoUpload: z.boolean().optional(),
  deleteAfterUpload: z.boolean().optional(),
  preserveStructure: z.boolean().optional(),
  allowedExtensions: z.string().max(500).optional(),
  ignoreHidden: z.boolean().optional(),
  minFileSizeMb: z.coerce.number().min(0).max(100000).optional(),
  stabilityWaitMs: z.coerce.number().min(0).max(600000).optional(),
  recursive: z.boolean().optional(),
  isMedalPreset: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid folder payload." }, { status: 400 });
  }

  // Handle action dispatch if sent to POST instead of PATCH
  if (parsed.data.id && (parsed.data.action === "scan" || parsed.data.action === "test")) {
    const rows = await db.select().from(monitoredFolders).where(eq(monitoredFolders.id, parsed.data.id));
    const folder = rows[0];
    if (!folder) return Response.json({ error: "Folder not found." }, { status: 404 });

    if (parsed.data.action === "test") {
      const info = describeFolder(folder.path, parseExtensionList(folder.allowedExtensions));
      await db.update(monitoredFolders).set({ lastScanAt: new Date(), fileCount: info.fileCount }).where(eq(monitoredFolders.id, folder.id));
      return Response.json({
        ok: info.exists,
        exists: info.exists,
        writable: info.writable,
        fileCount: info.fileCount,
        message: info.exists
          ? `Folder is readable with ${info.fileCount} matching file(s)${info.writable ? "." : " (read-only)."}.`
          : "Folder is not accessible. Check that the drive is connected and the path is correct.",
      });
    }

    if (parsed.data.action === "scan") {
      await scanFolderExisting(folder.id);
      return Response.json({ ok: true, message: `Scanning ${folder.path} for existing files…` });
    }
  }

  if (!parsed.data.path) {
    return Response.json({ error: "Folder path is required." }, { status: 400 });
  }

  const settings = await getSettings();
  const folderPath = normalizePath(parsed.data.path);
  const info = describeFolder(folderPath);
  if (!info.exists) {
    return Response.json({ error: `That folder does not exist on this PC: ${folderPath}` }, { status: 400 });
  }

  const inserted = await db
    .insert(monitoredFolders)
    .values({
      path: folderPath,
      label: parsed.data.label ?? null,
      enabled: parsed.data.enabled ?? true,
      autoUpload: parsed.data.autoUpload ?? true,
      deleteAfterUpload: parsed.data.deleteAfterUpload ?? false,
      preserveStructure: parsed.data.preserveStructure ?? settings.preserveStructure,
      allowedExtensions: parsed.data.allowedExtensions ?? settings.allowedExtensions,
      ignoreHidden: parsed.data.ignoreHidden ?? settings.ignoreHidden,
      minFileSize: Math.round((parsed.data.minFileSizeMb ?? settings.minFileSizeMb) * 1024 * 1024),
      stabilityWaitMs: parsed.data.stabilityWaitMs ?? settings.stabilityDelayMs,
      recursive: parsed.data.recursive ?? true,
      isMedalPreset: parsed.data.isMedalPreset ?? false,
      fileCount: info.fileCount,
      lastScanAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) return Response.json({ error: "That folder is already monitored." }, { status: 409 });

  // Automatically create the dedicated named folder inside Google Drive!
  try {
    const rootId = await getDestinationFolderId();
    const folderName = parsed.data.label || path.basename(folderPath) || "Folder";
    await ensureFolderChain(rootId, [folderName]);
  } catch {}

  await refreshWatchers();

  // Automatically scan & enqueue existing files immediately so upload starts on bind!
  try {
    await scanFolderExisting(inserted[0].id);
    void processQueue();
  } catch (err) {
    console.error("Auto scan on bind error:", err);
  }

  await logActivity("folder", `Now watching ${folderPath} (${info.fileCount} matching file(s)). Auto-backup started.`, {
    status: "info",
    filePath: folderPath,
    notify: true,
  });
  return Response.json({ folder: await mapFolder(inserted[0]) });
}

const patchSchema = z.object({
  id: z.coerce.number().int().positive(),
  action: z.enum(["update", "scan", "test"]).default("update"),
  changes: z
    .object({
      enabled: z.boolean().optional(),
      autoUpload: z.boolean().optional(),
      deleteAfterUpload: z.boolean().optional(),
      preserveStructure: z.boolean().optional(),
      allowedExtensions: z.string().max(500).optional(),
      ignoreHidden: z.boolean().optional(),
      minFileSizeMb: z.coerce.number().min(0).max(100000).optional(),
      stabilityWaitMs: z.coerce.number().min(0).max(600000).optional(),
      recursive: z.boolean().optional(),
      label: z.string().max(120).nullable().optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid folder request." }, { status: 400 });

  const rows = await db.select().from(monitoredFolders).where(eq(monitoredFolders.id, parsed.data.id));
  const folder = rows[0];
  if (!folder) return Response.json({ error: "Folder not found." }, { status: 404 });

  if (parsed.data.action === "test") {
    const info = describeFolder(folder.path, parseExtensionList(folder.allowedExtensions));
    await db.update(monitoredFolders).set({ lastScanAt: new Date(), fileCount: info.fileCount }).where(eq(monitoredFolders.id, folder.id));
    return Response.json({
      ok: info.exists,
      exists: info.exists,
      writable: info.writable,
      fileCount: info.fileCount,
      message: info.exists
        ? `Folder is readable with ${info.fileCount} matching file(s)${info.writable ? "." : " (read-only)."}.`
        : "Folder is not accessible. Check that the drive is connected and the path is correct.",
    });
  }

  if (parsed.data.action === "scan") {
    await scanFolderExisting(folder.id);
    void processQueue();
    return Response.json({ ok: true, message: `Scanning ${folder.path} and starting backup…` });
  }

  const c = parsed.data.changes ?? {};
  const updated = await db
    .update(monitoredFolders)
    .set({
      enabled: c.enabled,
      autoUpload: c.autoUpload,
      deleteAfterUpload: c.deleteAfterUpload,
      preserveStructure: c.preserveStructure,
      allowedExtensions: c.allowedExtensions,
      ignoreHidden: c.ignoreHidden,
      minFileSize: c.minFileSizeMb !== undefined ? Math.round(c.minFileSizeMb * 1024 * 1024) : undefined,
      stabilityWaitMs: c.stabilityWaitMs,
      recursive: c.recursive,
      label: c.label,
    })
    .where(eq(monitoredFolders.id, folder.id))
    .returning();
  await refreshWatchers();
  return Response.json({ folder: await mapFolder(updated[0]) });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const unbindAll = url.searchParams.get("all") === "1" || url.searchParams.get("id") === "all";

  if (unbindAll) {
    await db.delete(monitoredFolders);
    await refreshWatchers();
    await logActivity("folder", "Unbound all monitored folders.", { status: "info", notify: true });
    return Response.json({ ok: true, message: "All folders unbound." });
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "A valid folder id is required." }, { status: 400 });
  const rows = await db.select().from(monitoredFolders).where(eq(monitoredFolders.id, id));
  if (!rows[0]) return Response.json({ error: "Folder not found." }, { status: 404 });
  await db.delete(monitoredFolders).where(eq(monitoredFolders.id, id));
  await refreshWatchers();
  await logActivity("folder", `Stopped watching ${rows[0].path}.`, { status: "info", filePath: rows[0].path });
  return Response.json({ ok: true });
}

/** Medal preset support: never assumes a path, only suggests candidates. */
export async function PUT() {
  const detected = detectMedalFolders();
  const generic = describeFolder(normalizePath(fs.existsSync("/tmp") ? "/tmp" : "."));
  return Response.json({ detected, probe: generic });
}
