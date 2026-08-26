import { z } from "zod";
import { describeGoogleError, driveRequest, fetchDriveAbout, getAuthStatus } from "@/lib/google";
import { FOLDER_MIME, listSelectableFolders, resolveFolderName, clearFolderCache } from "@/lib/drive-folders";
import { updateSettings } from "@/lib/settings";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthStatus();
  if (!auth.connected) return Response.json({ connected: false, folders: [], quota: null });
  try {
    const [folders, about] = await Promise.all([listSelectableFolders(), fetchDriveAbout()]);
    return Response.json({ connected: true, folders, quota: about.quota });
  } catch (err) {
    return Response.json({ connected: true, folders: [], error: (err as Error).message }, { status: 502 });
  }
}

const bodySchema = z.object({
  folderId: z.string().min(1).max(200).optional(),
  folderName: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid destination payload." }, { status: 400 });

  await clearFolderCache();

  if (!parsed.data.folderId) {
    // "Let DriveVault create its own folder": create/refresh DriveVault in My Drive root.
    const name = parsed.data.folderName || "DriveVault";
    const listRes = await driveRequest("GET", "/files", {
      query: {
        q: `mimeType='${FOLDER_MIME}' and name='${name}' and 'root' in parents and trashed = false`,
        fields: "files(id,name)",
        supportsAllDrives: true,
      },
    });
    const listData = (await listRes.json().catch(() => ({}))) as { files?: { id: string }[] };
    let id = listData.files?.[0]?.id;
    if (!id) {
      const createRes = await driveRequest("POST", "/files", {
        query: { fields: "id", supportsAllDrives: true },
        body: { name, mimeType: FOLDER_MIME },
      });
      if (!createRes.ok) throw describeGoogleError(new Error(`HTTP ${createRes.status} ${await createRes.text().catch(() => "")}`));
      id = ((await createRes.json()) as { id: string }).id;
    }
    const settings = await updateSettings({ defaultDriveFolderId: id, defaultDriveFolderName: name });
    await logActivity("auth", `Backup destination set to the "${name}" folder in Google Drive.`, { status: "info", notify: true });
    return Response.json({ settings, destination: { id, name } });
  }

  const name = await resolveFolderName(parsed.data.folderId);
  const settings = await updateSettings({
    defaultDriveFolderId: parsed.data.folderId,
    defaultDriveFolderName: name,
  });
  await logActivity("auth", `Backup destination set to "${name}" in Google Drive.`, { status: "info", notify: true });
  return Response.json({ settings, destination: { id: parsed.data.folderId, name } });
}
