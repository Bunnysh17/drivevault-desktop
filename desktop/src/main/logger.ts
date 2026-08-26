import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./database";

const SENSITIVE = /(ya29\.[A-Za-z0-9_\-.]+|1\/\/[A-Za-z0-9_\-]{20,})/g;

/** Never log OAuth tokens or credentials. */
function scrub(input: string) {
  return input.replace(SENSITIVE, "[redacted]");
}

export function logActivity(
  eventType: string,
  message: string,
  opts: { filePath?: string; status?: string; errorCode?: string; meta?: Record<string, unknown> } = {},
) {
  const safe = scrub(message).slice(0, 1000);
  try {
    getDb()
      .prepare(
        "INSERT INTO activity_logs (event_type, file_path, status, error_code, message, meta) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(eventType, opts.filePath ?? null, opts.status ?? null, opts.errorCode ?? null, safe, opts.meta ? JSON.stringify(opts.meta) : null);
  } catch {
    /* logging must never crash the app */
  }
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()}\t${eventType}\t${opts.status ?? "-"}\t${opts.errorCode ?? "-"}\t${opts.filePath ?? "-"}\t${safe}\n`;
    fs.appendFileSync(path.join(dir, `drivevault-${new Date().toISOString().slice(0, 10)}.log`), line);
  } catch {
    /* ignore */
  }
}

export function exportLogs(): string {
  const rows = getDb().prepare("SELECT * FROM activity_logs ORDER BY ts DESC LIMIT 5000").all() as Record<string, unknown>[];
  const header = "timestamp\tevent\tstatus\tcode\tfile\tmessage\n";
  return (
    header +
    rows
      .map((r) => [r.ts, r.event_type, r.status ?? "-", r.error_code ?? "-", r.file_path ?? "-", r.message].join("\t"))
      .join("\n") +
    "\n"
  );
}
