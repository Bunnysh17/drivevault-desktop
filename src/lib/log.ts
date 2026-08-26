import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import fs from "node:fs";
import path from "node:path";
import { desc } from "drizzle-orm";
import type { ActivityDTO, ToastDTO } from "./types";

export type LogEvent =
  | "auth"
  | "folder"
  | "watch"
  | "queue"
  | "upload"
  | "verify"
  | "retry"
  | "error"
  | "cleanup"
  | "storage"
  | "settings"
  | "engine"
  | "drive";

const MAX_TOASTS = 40;
const g = globalThis as typeof globalThis & {
  __drivevaultToasts?: ToastDTO[];
  __drivevaultLogLock?: Promise<void>;
};

const LOG_DIR = path.join(process.cwd(), ".drivevault", "logs");

function toastList(): ToastDTO[] {
  g.__drivevaultToasts ??= [];
  return g.__drivevaultToasts;
}

/** Never log tokens or secrets: strip anything that looks like a credential. */
function scrub(input: unknown): unknown {
  if (typeof input !== "string") return input;
  return input
    .replace(/(ya29\.[A-Za-z0-9_\-.]+)/g, "ya29.***")
    .replace(/([A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{20,})/g, "jwt.***")
    .replace(/([?&](access_token|refresh_token|code|client_secret)=)[^&\s]+/gi, "$1***");
}

export async function logActivity(
  eventType: LogEvent,
  message: string,
  opts: {
    filePath?: string | null;
    status?: string | null;
    errorCode?: string | null;
    meta?: Record<string, unknown>;
    notify?: boolean;
    level?: ToastDTO["level"];
  } = {},
): Promise<void> {
  const row = {
    eventType,
    message: String(scrub(message)).slice(0, 1000),
    filePath: opts.filePath ? String(opts.filePath).slice(0, 1000) : null,
    status: opts.status ?? null,
    errorCode: opts.errorCode ?? null,
    meta: (opts.meta ?? null) as Record<string, unknown> | null,
  };

  try {
    await db.insert(activityLogs).values(row);
  } catch {
    /* logging must never crash the app */
  }

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const line = `${new Date().toISOString()}\t${eventType}\t${row.status ?? "-"}\t${
      row.errorCode ?? "-"
    }\t${row.filePath ?? "-"}\t${row.message}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `drivevault-${day}.log`), line);
  } catch {
    /* ignore filesystem log failures */
  }

  if (opts.notify) {
    pushToast({
      title: STATUS_TITLE[opts.status ?? ""] ?? TITLE_BY_EVENT[eventType] ?? "DriveVault",
      body: row.message,
      level: opts.level ?? levelForStatus(opts.status),
    });
  }
}

function levelForStatus(status?: string | null): ToastDTO["level"] {
  if (!status) return "info";
  if (["completed", "connected", "uploaded"].includes(status)) return "success";
  if (["failed", "error", "disconnected"].includes(status)) return "error";
  if (["retrying", "warning", "paused"].includes(status)) return "warn";
  return "info";
}

const TITLE_BY_EVENT: Record<string, string> = {
  auth: "Google Drive",
  upload: "Upload",
  verify: "Verified",
  retry: "Retrying upload",
  cleanup: "Storage cleanup",
  storage: "Storage",
  error: "Something went wrong",
};

const STATUS_TITLE: Record<string, string> = {
  completed: "Upload complete",
  failed: "Upload failed",
  retrying: "Retrying upload",
  deleted_locally: "Local copy removed",
};

export function pushToast(t: Omit<ToastDTO, "id" | "createdAt">) {
  const list = toastList();
  const now = Date.now();
  // Deduplicate: ignore if identical message was pushed in the last 15 seconds
  const duplicate = list.find((existing) => existing.body === t.body && now - new Date(existing.createdAt).getTime() < 15_000);
  if (duplicate) return;

  list.unshift({
    ...t,
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  if (list.length > MAX_TOASTS) list.length = MAX_TOASTS;
}

export function getToasts(): ToastDTO[] {
  const now = Date.now();
  // Filter out any stale toast older than 4 seconds so old toasts never replay on refresh
  const list = toastList().filter((t) => now - new Date(t.createdAt).getTime() < 4_000);
  g.__drivevaultToasts = list;
  return list;
}

export function clearToasts() {
  g.__drivevaultToasts = [];
}

export async function listActivity(limit = 50, offset = 0): Promise<ActivityDTO[]> {
  const rows = await db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.ts))
    .limit(Math.min(limit, 500))
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts.toISOString(),
    eventType: r.eventType,
    filePath: r.filePath,
    status: r.status,
    errorCode: r.errorCode,
    message: r.message,
  }));
}

export async function exportLogs(): Promise<{ filename: string; content: string }> {
  const rows = await db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.ts))
    .limit(5000);
  const header = "timestamp\tevent\tstatus\tcode\tfile\tmessage\n";
  const body = rows
    .map((r) =>
      [r.ts.toISOString(), r.eventType, r.status ?? "-", r.errorCode ?? "-", r.filePath ?? "-", r.message]
        .join("\t"),
    )
    .join("\n");
  return { filename: `drivevault-logs-${Date.now()}.tsv`, content: header + body + "\n" };
}
