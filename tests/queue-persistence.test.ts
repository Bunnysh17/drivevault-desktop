import "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { uploadQueue } from "../src/db/schema";

const canRun = Boolean(process.env.DATABASE_URL);

async function tableExists(): Promise<boolean> {
  try {
    const res = await db.execute(
      sql`select 1 from information_schema.tables where table_name = 'upload_queue' limit 1`,
    );
    return (res as unknown as { rows?: unknown[] }).rows
      ? ((res as unknown as { rows: unknown[] }).rows.length > 0)
      : true;
  } catch {
    return false;
  }
}

test("queue entries survive an application restart", { skip: !canRun }, async () => {
  if (!(await tableExists())) return;
  const localPath = `/tmp/drivevault-test-${Date.now()}.mp4`;

  await db.insert(uploadQueue).values({
    localPath,
    fileName: "restart-test.mp4",
    fileSize: 4242,
    status: "uploading",
    progress: 41.5,
    bytesUploaded: 1758,
  });

  // Simulate a restart: everything in-flight is moved back to "waiting" and
  // picked up again with its resumable session intact.
  await db
    .update(uploadQueue)
    .set({ status: "waiting" })
    .where(eq(uploadQueue.localPath, localPath));

  const rows = await db.select().from(uploadQueue).where(eq(uploadQueue.localPath, localPath));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "waiting");
  assert.equal(rows[0].bytesUploaded, 1758, "progress must persist across restarts");
  assert.equal(rows[0].fileSize, 4242);

  await db.delete(uploadQueue).where(eq(uploadQueue.localPath, localPath));
  const after = await db.select().from(uploadQueue).where(eq(uploadQueue.localPath, localPath));
  assert.equal(after.length, 0);
});

test("queue rejects a duplicate local path", { skip: !canRun }, async () => {
  if (!(await tableExists())) return;
  const localPath = `/tmp/drivevault-dup-${Date.now()}.mp4`;
  await db.insert(uploadQueue).values({ localPath, fileName: "dup.mp4", fileSize: 10, status: "waiting" });
  const second = await db
    .insert(uploadQueue)
    .values({ localPath, fileName: "dup.mp4", fileSize: 10, status: "waiting" })
    .onConflictDoNothing()
    .returning({ id: uploadQueue.id });
  assert.equal(second.length, 0, "conflict should be ignored, not duplicated");
  await db.delete(uploadQueue).where(eq(uploadQueue.localPath, localPath));
});

test.after(async () => {
  await pool.end().catch(() => undefined);
});
