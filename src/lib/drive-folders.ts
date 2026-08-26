import { db } from "@/db";
import { driveFolders } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { describeGoogleError, driveRequest, AuthError } from "./google";
import { logActivity } from "./log";
import path from "node:path";
import { getSettings } from "./settings";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Local path -> Drive path segments (relative to the monitored folder). */
export function relativeSegments(rootPath: string, filePath: string): string[] {
  const rel = path.relative(rootPath, filePath);
  if (!rel || rel.startsWith("..")) return [];
  return rel.split(path.sep).filter(Boolean).slice(0, -1);
}

function pathKey(parentId: string, name: string) {
  return `${parentId}/${name.toLowerCase()}`;
}

async function cachedFolder(key: string) {
  const rows = await db.select().from(driveFolders).where(eq(driveFolders.pathKey, key));
  return rows[0] ?? null;
}

export async function isRemoteFolderValid(id: string): Promise<boolean> {
  if (!id || id === "root") return true;
  try {
    const res = await driveRequest("GET", `/files/${id}`, {
      query: { supportsAllDrives: true, fields: "id,trashed" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { id?: string; trashed?: boolean };
    return Boolean(data.id && !data.trashed);
  } catch {
    return false;
  }
}

async function createRemoteFolder(name: string, parentId: string): Promise<string> {
  const safeParentId = parentId === "root" || !parentId ? [] : [parentId];
  const body = {
    name,
    mimeType: FOLDER_MIME,
    parents: safeParentId,
  };
  const res = await driveRequest("POST", "/files", {
    query: { supportsAllDrives: true, fields: "id,name,parents" },
    body,
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
  const data = (await res.json()) as { id: string };
  const id = data.id;
  await db
    .insert(driveFolders)
    .values({ driveFolderId: id, parentId: parentId || "root", name, pathKey: pathKey(parentId || "root", name) })
    .onConflictDoNothing();
  return id;
}

async function findRemoteFolder(name: string, parentId: string): Promise<string | null> {
  const escapedName = name.replace(/'/g, "\\'");
  const q = `'${parentId || "root"}' in parents and mimeType='${FOLDER_MIME}' and name='${escapedName}' and trashed = false`;
  const res = await driveRequest("GET", "/files", {
    query: { q, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: "files(id,name)", pageSize: 5 },
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function forgetFolder(id: string) {
  await db.delete(driveFolders).where(eq(driveFolders.driveFolderId, id));
}

export async function forgetFolderByKey(key: string) {
  await db.delete(driveFolders).where(eq(driveFolders.pathKey, key));
}

/** Ensures a nested folder chain exists in Drive, validating remote existence and healing on 404. */
export async function ensureFolderChain(parentId: string, segments: string[]): Promise<string> {
  let current = parentId || "root";

  // Validate initial parent
  if (current !== "root" && !(await isRemoteFolderValid(current))) {
    await forgetFolder(current);
    current = await getDestinationFolderId();
  }

  for (const segment of segments.filter(Boolean)) {
    const key = pathKey(current, segment);
    const cached = await cachedFolder(key);
    let validCachedId: string | null = null;
    
    if (cached) {
      if (await isRemoteFolderValid(cached.driveFolderId)) {
        validCachedId = cached.driveFolderId;
      } else {
        await forgetFolder(cached.driveFolderId);
        await forgetFolderByKey(key);
      }
    }

    if (validCachedId) {
      current = validCachedId;
      continue;
    }

    let found = await findRemoteFolder(segment, current);
    if (!found) {
      try {
        found = await createRemoteFolder(segment, current);
      } catch (err) {
        const d = describeGoogleError(err);
        if (d.code === "NOT_FOUND" || String(err).includes("404")) {
          await forgetFolder(current);
          const rootId = await getDestinationFolderId();
          current = rootId;
          found = (await findRemoteFolder(segment, current)) ?? (await createRemoteFolder(segment, current));
        } else {
          throw err;
        }
      }
    }
    await db
      .insert(driveFolders)
      .values({ driveFolderId: found, parentId: current, name: segment, pathKey: key })
      .onConflictDoNothing();
    current = found;
  }
  return current;
}

export async function getDestinationFolderId(): Promise<string> {
  const settings = await getSettings();
  if (settings.defaultDriveFolderId && settings.defaultDriveFolderId !== "root") {
    if (await isRemoteFolderValid(settings.defaultDriveFolderId)) {
      return settings.defaultDriveFolderId;
    }
  }
  if (settings.defaultDriveFolderId === "root") return "root";

  const rootName = settings.defaultDriveFolderName || "DriveVault";
  const key = pathKey("root", rootName);
  const cached = await cachedFolder(key);
  if (cached && (await isRemoteFolderValid(cached.driveFolderId))) {
    return cached.driveFolderId;
  }
  if (cached) {
    await forgetFolder(cached.driveFolderId);
    await forgetFolderByKey(key);
  }
  const found = (await findRemoteFolder(rootName, "root")) ?? (await createRemoteFolder(rootName, "root"));
  await db
    .insert(driveFolders)
    .values({ driveFolderId: found, parentId: "root", name: rootName, pathKey: key })
    .onConflictDoNothing();
  return found;
}

export async function destinationPathFor(segments: string[]): Promise<string> {
  const settings = await getSettings();
  const base = settings.defaultDriveFolderId === "root" ? "My Drive" : settings.defaultDriveFolderName || "DriveVault";
  return [base, ...segments].join("/");
}

export interface DriveFolderOption {
  id: string;
  name: string;
  parent: string | null;
  isRoot: boolean;
}

/** Lists folders the user can pick as the backup destination. */
export async function listSelectableFolders(): Promise<DriveFolderOption[]> {
  const res = await driveRequest("GET", "/files", {
    query: {
      q: `mimeType='${FOLDER_MIME}' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id,name,parents)",
      pageSize: 100,
      orderBy: "name",
    },
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
  const data = (await res.json()) as { files?: { id: string; name?: string; parents?: string[] }[] };
  const files = data.files ?? [];
  return [
    { id: "root", name: "My Drive (root)", parent: null, isRoot: true },
    ...files.map((f) => ({
      id: f.id,
      name: f.name ?? "Untitled",
      parent: f.parents?.[0] ?? null,
      isRoot: false,
    })),
  ];
}

export async function resolveFolderName(folderId: string): Promise<string> {
  if (!folderId || folderId === "root") return "My Drive";
  try {
    const res = await driveRequest("GET", `/files/${folderId}`, {
      query: { supportsAllDrives: true, fields: "id,name" },
    });
    if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status}`));
    const data = (await res.json()) as { name?: string };
    return data.name ?? folderId;
  } catch (err) {
    void logActivity("error", `Could not resolve Drive folder ${folderId}: ${describeGoogleError(err).message}`, {
      status: "warning",
    });
    return folderId;
  }
}

export async function cachedFolderCount(): Promise<number> {
  const rows = await db.select().from(driveFolders);
  return rows.length;
}

export async function clearFolderCache(parentId?: string) {
  if (parentId) await db.delete(driveFolders).where(eq(driveFolders.parentId, parentId));
  else await db.delete(driveFolders);
}

export async function getCachedFolderByKey(key: string) {
  const rows = await db.select().from(driveFolders).where(and(eq(driveFolders.pathKey, key)));
  return rows[0] ?? null;
}

export { AuthError };
