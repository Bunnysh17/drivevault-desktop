import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { protectedPaths, uploadQueue } from "@/db/schema";
import { protectedList } from "@/lib/snapshot";
import { isPathProtected } from "@/lib/safety";
import { protectedPathList } from "@/lib/engine";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  path: z.string().min(1).max(1000),
  kind: z.enum(["file", "folder", "name"]).default("file"),
  note: z.string().max(300).optional(),
});

export async function GET() {
  return Response.json({ items: await protectedList() });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid protected entry." }, { status: 400 });

  await db
    .insert(protectedPaths)
    .values({ path: parsed.data.path, kind: parsed.data.kind, note: parsed.data.note ?? null })
    .onConflictDoNothing();

  // Mark any queued items living under a newly protected path.
  const list = await protectedPathList();
  const queued = await db.select().from(uploadQueue);
  for (const item of queued) {
    if (isPathProtected(item.localPath, list) && !item.protected) {
      await db.update(uploadQueue).set({ protected: true }).where(eq(uploadQueue.id, item.id));
    }
  }

  await logActivity("cleanup", `Protected: ${parsed.data.path} will never be deleted automatically.`, {
    status: "info",
    filePath: parsed.data.path,
    notify: true,
  });
  return Response.json({ items: await protectedList() });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const path = url.searchParams.get("path");
  if (id && Number.isInteger(id)) {
    await db.delete(protectedPaths).where(eq(protectedPaths.id, id));
  } else if (path) {
    await db.delete(protectedPaths).where(sql`lower(${protectedPaths.path}) = lower(${path})`);
  } else {
    return Response.json({ error: "Provide ?id= or ?path=" }, { status: 400 });
  }
  return Response.json({ items: await protectedList() });
}
