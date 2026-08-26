import { driveRequest } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || id.length > 200) return Response.json({ error: "Invalid Drive file id." }, { status: 400 });
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const rawName = url.searchParams.get("name");

  try {
    const res = await driveRequest("GET", `/files/${encodeURIComponent(id)}`, {
      query: { alt: "media", supportsAllDrives: true },
      headers: request.headers.get("range") ? { Range: request.headers.get("range")! } : undefined,
      timeoutMs: 600_000,
    });
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => "")).slice(0, 240);
      return Response.json({ error: `Google Drive returned HTTP ${res.status}${detail ? `: ${detail}` : "."}` }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("content-type") ?? "application/octet-stream");
    const length = res.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    const contentRange = res.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    const acceptRanges = res.headers.get("accept-ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    if (download) {
      const cleanName = rawName ? rawName.replace(/["\r\n\/\\]/g, "_") : `drive_file_${id}`;
      const encodedName = encodeURIComponent(cleanName);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${cleanName}"; filename*=UTF-8''${encodedName}`
      );
    } else {
      headers.set("Content-Disposition", "inline");
    }

    headers.set("Cache-Control", "private, max-age=300");
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
