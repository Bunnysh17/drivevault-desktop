import { z } from "zod";
import { db } from "@/db";
import { monitoredFolders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { describeFolder, normalizePath } from "@/lib/fs-utils";
import { updateSettings } from "@/lib/settings";
import { refreshWatchers, scanFolderExisting } from "@/lib/engine";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({
  folders: z.array(z.string().min(1).max(1000)).max(20).default([]),
  deleteAfterUpload: z.boolean().default(false),
  autoUpload: z.boolean().default(true),
  preserveStructure: z.boolean().default(true),
  notifications: z.boolean().default(true),
  gamingMode: z.boolean().default(true),
  uploadExisting: z.boolean().default(false),
  medalPreset: z.boolean().default(false),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid onboarding payload." }, { status: 400 });

  const created: { id: number; path: string; exists: boolean }[] = [];
  for (const folderPath of parsed.data.folders) {
    const normalized = normalizePath(folderPath);
    const info = describeFolder(normalized);
    if (!info.exists) {
      created.push({ id: 0, path: normalized, exists: false });
      continue;
    }
    const rows = await db
      .insert(monitoredFolders)
      .values({
        path: normalized,
        label: null,
        enabled: true,
        autoUpload: parsed.data.autoUpload,
        deleteAfterUpload: parsed.data.deleteAfterUpload,
        preserveStructure: parsed.data.preserveStructure,
        isMedalPreset: parsed.data.medalPreset,
        lastScanAt: new Date(),
        fileCount: info.fileCount,
      })
      .onConflictDoNothing()
      .returning({ id: monitoredFolders.id, path: monitoredFolders.path });
    if (rows[0]) {
      created.push({ id: rows[0].id, path: rows[0].path, exists: true });
      if (parsed.data.uploadExisting) {
        void scanFolderExisting(rows[0].id).catch(() => undefined);
      }
    } else {
      const existing = await db.select().from(monitoredFolders).where(eq(monitoredFolders.path, normalized));
      created.push({ id: existing[0]?.id ?? 0, path: normalized, exists: true });
    }
  }

  const settings = await updateSettings({
    deleteAfterUpload: parsed.data.deleteAfterUpload,
    preserveStructure: parsed.data.preserveStructure,
    notifications: parsed.data.notifications,
    gamingMode: parsed.data.gamingMode,
    onboardingComplete: true,
  });

  await refreshWatchers();
  await logActivity("engine", "Setup finished. DriveVault is protecting your files.", { status: "info", notify: true });
  return Response.json({ ok: true, created, settings });
}
