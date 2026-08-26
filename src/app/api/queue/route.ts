import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { uploadQueue } from "@/db/schema";
import { cancelAllItems, cancelItem, pauseItem, resumeItem, retryItem, processQueue, pauseEngine, resumeEngine } from "@/lib/engine";
import { mapQueueItem } from "@/lib/snapshot";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500) || 500, 10000);
  const status = url.searchParams.get("status");
  const rows = status
    ? await db.select().from(uploadQueue).where(eq(uploadQueue.status, status)).orderBy(desc(uploadQueue.createdAt)).limit(limit)
    : await db.select().from(uploadQueue).orderBy(desc(uploadQueue.createdAt)).limit(limit);
  return Response.json({ items: rows.map((r) => mapQueueItem(r)) });
}

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "retry", "retry-all", "pause-all", "resume-all", "clear-completed", "cancel-all", "clear-all"]),
  ids: z.array(z.number().int().positive()).max(10000).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid queue action." }, { status: 400 });

  const { action, ids } = parsed.data;

  if (action === "cancel-all" || action === "clear-all") {
    const removed = await cancelAllItems();
    return Response.json({ ok: true, removed });
  }

  if (action === "retry-all") {
    await db
      .update(uploadQueue)
      .set({ status: "waiting", retryCount: 0, nextAttemptAt: null, errorMessage: null, errorCode: null, updatedAt: new Date() })
      .where(inArray(uploadQueue.status, ["retrying", "failed", "paused"]));
    void processQueue();
    return Response.json({ ok: true });
  }

  if (action === "pause-all") {
    await pauseEngine();
    return Response.json({ ok: true });
  }

  if (action === "resume-all") {
    await resumeEngine();
    return Response.json({ ok: true });
  }

  if (action === "clear-completed") {
    const removed = await db
      .delete(uploadQueue)
      .where(inArray(uploadQueue.status, ["completed", "deleted_locally", "canceled", "skipped"]))
      .returning({ id: uploadQueue.id });
    return Response.json({ ok: true, removed: removed.length });
  }

  if (!ids || ids.length === 0) return Response.json({ error: "No queue items selected." }, { status: 400 });

  for (const id of ids) {
    if (action === "pause") await pauseItem(id);
    if (action === "resume") await resumeItem(id);
    if (action === "cancel") await cancelItem(id);
    if (action === "retry") await retryItem(id);
  }
  void processQueue();
  return Response.json({ ok: true, affected: ids.length });
}
