import { activityPage, uploadedFilesPage } from "@/lib/snapshot";
import { exportLogs } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "activity";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 500);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const offset = (page - 1) * limit;

  if (url.searchParams.get("export") === "1") {
    const data = await exportLogs();
    return new Response(data.content, {
      headers: {
        "Content-Type": "text/tab-separated-values; charset=utf-8",
        "Content-Disposition": `attachment; filename="${data.filename}"`,
      },
    });
  }

  if (kind === "uploaded") {
    const { rows, total } = await uploadedFilesPage(limit, offset);
    return Response.json({
      items: rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        localPath: r.localPath,
        fileSize: r.fileSize,
        driveFileId: r.driveFileId,
        drivePath: r.drivePath,
        uploadedAt: r.uploadedAt.toISOString(),
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        deletedLocallyAt: r.deletedLocallyAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    });
  }

  const { rows, total } = await activityPage(limit, offset);
  return Response.json({ items: rows, total, page, limit });
}
