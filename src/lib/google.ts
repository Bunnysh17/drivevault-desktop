import { OAuth2Client } from "google-auth-library";
import { db } from "@/db";
import { secureVault, uploadedFiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { open, seal } from "./crypto";
import { logActivity } from "./log";

/** Full Drive access is required for the in-app file browser and trash controls. */
export const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

const TOKEN_KEY = "google_tokens";
const PROFILE_KEY = "google_profile";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;
}

export function getOAuthConfig(origin?: string): OAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const base =
    process.env.GOOGLE_REDIRECT_URI ??
    process.env.APP_BASE_URL ??
    origin ??
    "http://localhost:3000";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    ? process.env.GOOGLE_REDIRECT_URI
    : `${base.replace(/\/$/, "")}/api/auth/callback`;
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) };
}

function makeClient(cfg = getOAuthConfig()) {
  return new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export function getAuthUrl(origin?: string, state = "drivevault"): { url: string; configured: boolean } {
  const cfg = getOAuthConfig(origin);
  if (!cfg.configured) return { url: "", configured: false };
  const client = makeClient(cfg);
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent select_account",
    include_granted_scopes: true,
    state,
  });
  return { url, configured: true };
}

async function vaultGet(key: string): Promise<unknown | null> {
  const rows = await db.select().from(secureVault).where(eq(secureVault.key, key));
  const raw = rows[0]?.ciphertext;
  if (!raw) return null;
  const plain = open(raw);
  if (!plain) return null;
  try {
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

async function vaultSet(key: string, value: unknown) {
  const sealedValue = seal(JSON.stringify(value));
  await db
    .insert(secureVault)
    .values({ key, ciphertext: sealedValue, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: secureVault.key,
      set: { ciphertext: sealedValue, updatedAt: new Date() },
    });
}

export interface StoredTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
}

export async function saveTokens(tokens: StoredTokens) {
  const existing = (await vaultGet(TOKEN_KEY)) as StoredTokens | null;
  const merged: StoredTokens = {
    ...(existing ?? {}),
    ...tokens,
    refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
  };
  await vaultSet(TOKEN_KEY, merged);
}

export async function getTokens(): Promise<StoredTokens | null> {
  return (await vaultGet(TOKEN_KEY)) as StoredTokens | null;
}

export async function clearTokens() {
  await db.delete(secureVault).where(eq(secureVault.key, TOKEN_KEY));
  await db.delete(secureVault).where(eq(secureVault.key, PROFILE_KEY));
}

export interface AccountProfile {
  email: string | null;
  name: string | null;
  picture: string | null;
}

export async function saveProfile(profile: AccountProfile) {
  await vaultSet(PROFILE_KEY, profile);
}

export async function getProfile(): Promise<AccountProfile | null> {
  return (await vaultGet(PROFILE_KEY)) as AccountProfile | null;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** Human-readable, never a raw stack trace. */
export function describeGoogleError(err: unknown): { code: string; message: string; retryable: boolean } {
  const anyErr = err as {
    code?: number | string;
    status?: number;
    message?: string;
    errors?: { reason?: string; message?: string }[];
    response?: { status?: number };
  };
  const status = anyErr?.response?.status ?? anyErr?.status ?? (typeof anyErr?.code === "number" ? anyErr.code : undefined);
  const reason = anyErr?.errors?.[0]?.reason;
  const raw = String(anyErr?.message ?? err ?? "Unknown error");

  if (status === 401 || reason === "authError" || /invalid.?credential|unauthor/i.test(raw)) {
    return {
      code: "AUTH_EXPIRED",
      message: "Your Google session expired. Reconnect your Google account to continue backing up.",
      retryable: false,
    };
  }
  if (status === 403 && (reason === "storageQuotaExceeded" || /quota/i.test(raw))) {
    return {
      code: "DRIVE_QUOTA",
      message: "Your Google Drive storage is full. Uploads are paused until you free space in Drive.",
      retryable: false,
    };
  }
  if (status === 403) {
    return { code: "FORBIDDEN", message: "Google Drive denied this request. Check that DriveVault still has access.", retryable: false };
  }
  if (status === 404) {
    return { code: "NOT_FOUND", message: "The Google Drive folder no longer exists. A new one will be created.", retryable: true };
  }
  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return { code: "RATE_LIMITED", message: "Google rate-limited this upload. DriveVault will back off and retry automatically.", retryable: true };
  }
  if (status && status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: "Google Drive returned a temporary server error (HTTP " + status + "). Retrying with backoff.",
      retryable: true,
    };
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|socket hang up|network|fetch failed/i.test(raw)) {
    return {
      code: "NETWORK",
      message: "Upload paused because the internet connection was lost. It will automatically retry.",
      retryable: true,
    };
  }
  return { code: "UNKNOWN", message: raw.slice(0, 300), retryable: true };
}

/**
 * Returns an authorized OAuth2 client, refreshing the access token when needed.
 * Throws AuthError('NOT_CONNECTED') when the user has not linked an account.
 */
export async function getOAuthClient(): Promise<OAuth2Client> {
  const cfg = getOAuthConfig();
  if (!cfg.configured) {
    throw new AuthError("OAUTH_NOT_CONFIGURED", "Google OAuth credentials are not configured on this machine.");
  }
  const tokens = await getTokens();
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new AuthError("NOT_CONNECTED", "No Google account connected.");
  }
  const client = makeClient(cfg);
  client.setCredentials(tokens as never);
  client.on("tokens", (next) => {
    void saveTokens(next as StoredTokens).catch(() => undefined);
  });

  const expired = !tokens.expiry_date || tokens.expiry_date - Date.now() < 60_000;
  if (expired) {
    if (!tokens.refresh_token) throw new AuthError("NOT_CONNECTED", "Google session expired. Please reconnect.");
    try {
      const refreshed = await client.refreshAccessToken();
      await saveTokens(refreshed.credentials as StoredTokens);
      client.setCredentials(refreshed.credentials);
    } catch (err) {
      const d = describeGoogleError(err);
      if (d.code === "AUTH_EXPIRED") {
        await clearTokens();
        void logActivity("auth", "Google session expired and could not be refreshed. Reconnect required.", {
          status: "disconnected",
          errorCode: "AUTH_EXPIRED",
          notify: true,
        });
      }
      throw new AuthError(d.code, d.message);
    }
  }
  return client;
}

/** Back-compat alias for code paths that referred to the SDK client. */
export function getDriveClient() {
  return getOAuthClient();
}

/**
 * Returns a valid access token for raw Drive REST / resumable requests.
 * Tokens never leave the main/server process.
 */
export async function getAccessToken(): Promise<{ token: string; expiresAt: number | null }> {
  const client = await getOAuthClient();
  const expired =
    !client.credentials.expiry_date || client.credentials.expiry_date - Date.now() < 120_000;
  if (expired) {
    const refreshed = await client.refreshAccessToken();
    await saveTokens(refreshed.credentials as StoredTokens);
    client.setCredentials(refreshed.credentials);
  }
  const res = await client.getAccessToken();
  if (!res.token) throw new AuthError("NOT_CONNECTED", "Google session expired. Please reconnect your account.");
  return { token: res.token, expiresAt: client.credentials.expiry_date ?? null };
}

export async function getAuthStatus(): Promise<{
  connected: boolean;
  configured: boolean;
  account: AccountProfile | null;
  error: string | null;
  scopes: string[];
}> {
  const cfg = getOAuthConfig();
  const tokens = await getTokens().catch(() => null);
  const profile = await getProfile().catch(() => null);
  if (!tokens) {
    return {
      connected: false,
      configured: cfg.configured,
      account: profile,
      error: cfg.configured ? null : "Google OAuth credentials are not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      scopes: SCOPES,
    };
  }
  return {
    connected: true,
    configured: cfg.configured,
    account: profile,
    error: null,
    scopes: SCOPES,
  };
}

/* ------------------------------------------------------------------ */
/* Raw Google Drive REST helpers (no heavy googleapis SDK).            */
/* ------------------------------------------------------------------ */

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export async function driveRequest(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | boolean>; body?: unknown; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<Response> {
  const { token } = await getAccessToken();
  const url = new URL(`${DRIVE_API}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
  }
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...opts.headers,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });
}

export async function fetchDriveAbout() {
  const res = await driveRequest("GET", "/about", { query: { fields: "user,storageQuota" } });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
  const data = (await res.json()) as {
    user?: { emailAddress?: string; displayName?: string; photoLink?: string };
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  };
  const user = data.user;
  const quota = data.storageQuota;
  await saveProfile({
    email: user?.emailAddress ?? null,
    name: user?.displayName ?? null,
    picture: user?.photoLink ?? null,
  });
  return {
    account: {
      email: user?.emailAddress ?? null,
      name: user?.displayName ?? null,
      picture: user?.photoLink ?? null,
    },
    quota: {
      limit: Number(quota?.limit ?? 0),
      usage: Number(quota?.usage ?? 0),
      usageInDrive: Number(quota?.usageInDrive ?? 0),
    },
  };
}

export interface DriveVaultFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  modifiedTime: string | null;
  trashed: boolean;
  webViewLink: string | null;
  parents: string[];
  isFolder: boolean;
}

export async function listDriveVaultFiles(includeTrash = false, parentId?: string): Promise<DriveVaultFile[]> {
  const parentQuery = parentId ? `'${parentId === "root" ? "root" : parentId}' in parents and ` : "";
  const q = `${parentQuery}trashed = ${includeTrash ? "true" : "false"}`;
  const files: { id: string; name?: string; size?: string; mimeType?: string; modifiedTime?: string; trashed?: boolean; webViewLink?: string; parents?: string[] }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await driveRequest("GET", "/files", {
      query: {
        q,
        spaces: "drive",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        orderBy: "modifiedTime desc",
        pageSize: 1000,
        ...(pageToken ? { pageToken } : {}),
        fields: "nextPageToken,files(id,name,size,mimeType,modifiedTime,trashed,webViewLink,parents)",
      },
    });
    if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
    const data = (await res.json()) as { nextPageToken?: string; files?: typeof files };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files.map((file) => ({
    id: file.id,
    name: file.name ?? "Untitled",
    size: Number(file.size ?? 0),
    mimeType: file.mimeType ?? "application/octet-stream",
    modifiedTime: file.modifiedTime ?? null,
    trashed: Boolean(file.trashed),
    webViewLink: file.webViewLink ?? null,
    parents: file.parents ?? [],
    isFolder: file.mimeType === "application/vnd.google-apps.folder",
  }));
}

export async function setDriveFileTrashed(fileId: string, trashed: boolean) {
  const res = await driveRequest("PATCH", `/files/${encodeURIComponent(fileId)}`, {
    query: { supportsAllDrives: true, fields: "id,trashed" },
    body: { trashed },
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
}

export async function permanentlyDeleteDriveFile(fileId: string) {
  const res = await driveRequest("DELETE", `/files/${encodeURIComponent(fileId)}`, {
    query: { supportsAllDrives: true },
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
}

export async function renameDriveFile(fileId: string, newName: string) {
  const res = await driveRequest("PATCH", `/files/${encodeURIComponent(fileId)}`, {
    query: { supportsAllDrives: true, fields: "id,name" },
    body: { name: newName },
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));

  // Also update our database records to match the renamed file
  await db
    .update(uploadedFiles)
    .set({ fileName: newName })
    .where(eq(uploadedFiles.driveFileId, fileId))
    .catch(() => undefined);
}

export async function createDriveFolder(name: string, parentId?: string): Promise<{ id: string; name: string }> {
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId && parentId !== "root") {
    body.parents = [parentId];
  }
  const res = await driveRequest("POST", "/files", {
    query: { supportsAllDrives: true, fields: "id,name,mimeType" },
    body,
  });
  if (!res.ok) throw describeGoogleError(new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`));
  const data = (await res.json()) as { id: string; name: string };
  return { id: data.id, name: data.name };
}

export async function revokeAccess() {
  const tokens = await getTokens();
  if (tokens?.access_token || tokens?.refresh_token) {
    try {
      const client = makeClient();
      client.setCredentials(tokens as never);
      await client.revokeToken(tokens.access_token ?? tokens.refresh_token!);
    } catch {
      /* best effort */
    }
  }
  await clearTokens();
}
