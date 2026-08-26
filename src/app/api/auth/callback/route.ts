import { db } from "@/db";
import { secureVault } from "@/db/schema";
import { describeGoogleError, fetchDriveAbout, getOAuthConfig, saveTokens, SCOPES } from "@/lib/google";
import { logActivity } from "@/lib/log";
import { refreshWatchers, setPaused } from "@/lib/engine";
import { invalidateDriveQuota } from "@/lib/snapshot";
import { getDestinationFolderId } from "@/lib/drive-folders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error || !code) {
    await logActivity("auth", `Google sign-in was cancelled or refused (${error ?? "no code returned"}).`, {
      status: "failed",
      errorCode: "AUTH_DENIED",
      notify: true,
    });
    return Response.redirect(`${origin}/settings?auth=denied`);
  }

  try {
    const cfg = getOAuthConfig(origin);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed: HTTP ${tokenRes.status} ${text.slice(0, 200)}`);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };
    await saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      scope: tokens.scope ?? SCOPES.join(" "),
      token_type: tokens.token_type ?? "Bearer",
    });

    invalidateDriveQuota();
    const about = await fetchDriveAbout();
    await getDestinationFolderId();
    await setPaused(false);
    await refreshWatchers();
    await logActivity(
      "auth",
      `Connected to Google Drive as ${about.account.email ?? "your account"}. Uploads are ready.`,
      { status: "connected", notify: true },
    );
    return Response.redirect(`${origin}/settings?auth=connected`);
  } catch (err) {
    const d = describeGoogleError(err);
    await db.delete(secureVault);
    await logActivity("auth", `Could not connect Google Drive: ${d.message}`, {
      status: "failed",
      errorCode: d.code,
      notify: true,
    });
    return Response.redirect(`${origin}/settings?auth=failed`);
  }
}
