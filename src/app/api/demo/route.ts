import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredFolders } from "@/db/schema";
import { refreshWatchers, scanFolderExisting } from "@/lib/engine";
import { logActivity } from "@/lib/log";
import { normalizePath } from "@/lib/fs-utils";

export const dynamic = "force-dynamic";

/**
 * Creates a local sample recording folder so every part of the pipeline
 * (watcher → stability → queue → resumable upload → cleanup) can be exercised
 * without waiting for a real Medal recording.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const count = Math.min(Number(url.searchParams.get("count") ?? 3) || 3, 10);

  const demoRoot = normalizePath(path.join(os.homedir(), "drivevault-demo", "Medal"));
  fs.mkdirSync(path.join(demoRoot, "2026", "August", "Gaming"), { recursive: true });

  const created: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const target = path.join(demoRoot, "2026", "August", "Gaming", `Gaming_Clip_2026-08-2${i}_demo.mp4`);
    if (fs.existsSync(target)) {
      created.push(target);
      continue;
    }
    // 6 MB of pseudo-video data per file.
    const size = 6 * 1024 * 1024;
    const fd = fs.openSync(target, "w");
    const chunk = Buffer.alloc(1024 * 1024, 7);
    for (let written = 0; written < size; written += chunk.length) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    created.push(target);
  }

  const rows = await db
    .insert(monitoredFolders)
    .values({
      path: demoRoot,
      label: "Demo recordings",
      enabled: true,
      autoUpload: true,
      deleteAfterUpload: false,
      preserveStructure: true,
      isMedalPreset: false,
      lastScanAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: monitoredFolders.id });

  const folderId = rows[0]?.id ?? (await db.select().from(monitoredFolders).where(eq(monitoredFolders.path, demoRoot)))[0]?.id;
  await refreshWatchers();
  if (folderId) await scanFolderExisting(folderId);
  await logActivity("engine", `Created ${created.length} sample recording(s) in ${demoRoot}.`, {
    status: "info",
    notify: true,
  });

  return Response.json({ ok: true, folder: demoRoot, files: created, folderId });
}
