import { z } from "zod";
import { getAuthStatus, getAuthUrl, revokeAccess } from "@/lib/google";
import { logActivity } from "@/lib/log";
import { clearToasts } from "@/lib/log";
import { setPaused } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "status";

  if (action === "connect") {
    const { url: authUrl, configured } = getAuthUrl(new URL(request.url).origin);
    if (!configured) {
      return Response.json(
        {
          configured: false,
          error:
            "Google OAuth is not configured. Create credentials in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Desktop app / Web application), then set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and restart DriveVault.",
        },
        { status: 400 },
      );
    }
    return Response.json({ configured: true, url: authUrl });
  }

  const status = await getAuthStatus();
  return Response.json(status);
}

const disconnectSchema = z.object({ revoke: z.boolean().optional() });

export async function DELETE(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = disconnectSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.revoke !== false) {
    await revokeAccess().catch(() => undefined);
  }
  await setPaused(true);
  clearToasts();
  await logActivity("auth", "Google account disconnected. Uploads are paused until you reconnect.", {
    status: "disconnected",
    notify: true,
  });
  return Response.json({ ok: true });
}
