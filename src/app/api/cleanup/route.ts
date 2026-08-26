import { z } from "zod";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploadedFiles } from "@/db/schema";
import { cleanupCandidates } from "@/lib/snapshot";
import { evaluateDeletion, isPathProtected } from "@/lib/safety";
import { getSettings } from "@/lib/settings";
import { protectedPathList } from "@/lib/engine";
import { logActivity } from "@/lib/log";
import { safeUnlink } from "@/lib/fs-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  const candidates = await cleanupCandidates(settings);
  const protectedRows = await protectedPathList();
  const safeBytes = candidates.filter((c) => c.safe).reduce((a, c) => a + c.fileSize, 0);
  return Response.json({
    candidates,
    safeBytes,
    totalBytes: candidates.reduce((a, c) => a + c.fileSize, 0),
    protectedCount: protectedRows.length,
    neverDeleteAutomatically: settings.neverDeleteAutomatically,
    askBeforeDeleting: settings.askBeforeDeleting,
  });
}

const deleteSchema = z.object({
  paths: z.array(z.string().min(1).max(1000)).max(200).optional(),
  all: z.boolean().optional(),
  confirm: z.boolean(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid delete request." }, { status: 400 });

  const settings = await getSettings();
  if (settings.neverDeleteAutomatically) {
    return Response.json(
      { error: "The global safety switch 'Never delete local files automatically' is enabled. Turn it off to free space manually." },
      { status: 409 },
    );
  }
  if (!parsed.data.confirm) {
    return Response.json({ error: "Deletion requires explicit confirmation." }, { status: 428 });
  }

  const candidates = await cleanupCandidates(settings);
  const targets = parsed.data.all ? candidates : candidates.filter((c) => parsed.data.paths?.includes(c.localPath));
  if (targets.length === 0) return Response.json({ error: "No eligible files selected." }, { status: 400 });

  const protectedRows = await protectedPathList();
  let deleted = 0;
  let freed = 0;
  const skipped: string[] = [];

  for (const target of targets) {
    // Re-validate protection + verification right before touching the disk.
    const row = await db.select().from(uploadedFiles).where(eq(uploadedFiles.localPath, target.localPath));
    const record = row[0];
    const verdict = evaluateDeletion({
      localPath: target.localPath,
      verified: Boolean(record?.verifiedAt && record?.driveFileId),
      driveFileId: record?.driveFileId ?? null,
      uploadedAt: record?.uploadedAt.toISOString() ?? null,
      exists: fs.existsSync(target.localPath),
      protectedPaths: protectedRows,
      neverDeleteAutomatically: settings.neverDeleteAutomatically,
      autoDeleteEnabled: true,
      keepLocalDays: settings.keepLocalDays,
    });
    if (!verdict.safe || isPathProtected(target.localPath, protectedRows)) {
      skipped.push(`${target.fileName}: ${verdict.reason}`);
      continue;
    }
    const res = safeUnlink(target.localPath);
    if (res.ok) {
      deleted += 1;
      freed += target.fileSize;
      await db
        .update(uploadedFiles)
        .set({ deletedLocallyAt: new Date() })
        .where(eq(uploadedFiles.localPath, target.localPath));
    } else {
      skipped.push(`${target.fileName}: ${res.error ?? "could not be removed"}`);
    }
  }

  await logActivity(
    "cleanup",
    `Freed ${(freed / 1048576).toFixed(1)} MB by removing ${deleted} verified-backed-up file(s).${skipped.length ? ` Skipped ${skipped.length} file(s).` : ""}`,
    { status: "deleted_locally", notify: true },
  );

  return Response.json({ ok: true, deleted, freedBytes: freed, skipped: skipped.slice(0, 10) });
}
