import { z } from "zod";
import { listDriveVaultFiles, permanentlyDeleteDriveFile, setDriveFileTrashed, renameDriveFile, createDriveFolder } from "@/lib/google";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const includeTrash = params.get("trash") === "1";
  const parentId = params.get("parent") || undefined;
  try {
    return Response.json({ files: await listDriveVaultFiles(includeTrash, parentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

const bodySchema = z.object({
  id: z.string().min(1).max(200).optional(),
  ids: z.array(z.string().min(1).max(200)).optional(),
  action: z.enum(["trash", "restore", "delete", "rename", "create_folder"]),
  name: z.string().min(1).max(500).optional(),
  parentId: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid Drive file action." }, { status: 400 });

  if (parsed.data.action === "create_folder") {
    if (!parsed.data.name?.trim()) {
      return Response.json({ error: "Folder name is required." }, { status: 400 });
    }
    try {
      const folder = await createDriveFolder(parsed.data.name.trim(), parsed.data.parentId);
      await logActivity("drive", `Created new Google Drive folder "${folder.name}".`, { status: "info" });
      return Response.json({ ok: true, folder });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 502 });
    }
  }
  
  const targetIds = parsed.data.ids && parsed.data.ids.length > 0 
    ? parsed.data.ids 
    : parsed.data.id 
      ? [parsed.data.id] 
      : [];

  if (targetIds.length === 0) {
    return Response.json({ error: "No target file id(s) provided." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "delete") {
      let deletedCount = 0;
      for (const fileId of targetIds) {
        try {
          await permanentlyDeleteDriveFile(fileId);
          deletedCount++;
        } catch {
          // continue with others
        }
      }
      await logActivity("drive", `Permanently deleted ${deletedCount} file(s) from Drive.`, { status: "deleted" });
      return Response.json({ ok: true, count: deletedCount });
    } else if (parsed.data.action === "rename") {
      if (!parsed.data.id) return Response.json({ error: "Single file ID is required for rename." }, { status: 400 });
      if (!parsed.data.name?.trim()) return Response.json({ error: "New file name is required." }, { status: 400 });
      await renameDriveFile(parsed.data.id, parsed.data.name.trim());
      await logActivity("drive", `Renamed Drive file to "${parsed.data.name.trim()}".`, { status: "info" });
      return Response.json({ ok: true, name: parsed.data.name?.trim() });
    } else {
      const isTrash = parsed.data.action === "trash";
      let processedCount = 0;
      for (const fileId of targetIds) {
        try {
          await setDriveFileTrashed(fileId, isTrash);
          processedCount++;
        } catch {
          // continue
        }
      }
      await logActivity(
        "drive",
        `Drive ${isTrash ? "moved to bin" : "restored"} for ${processedCount} file(s).`,
        { status: isTrash ? "deleted" : "info" }
      );
      return Response.json({ ok: true, count: processedCount });
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}