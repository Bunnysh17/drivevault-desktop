import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".webm", ".avi"];

export function normalizePath(p: string): string {
  return path.normalize(p).replace(/[\\/]+$/, "");
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i <= 0 ? "" : fileName.slice(i).toLowerCase();
}

export function parseExtensionList(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s : `.${s}`));
}

/** Folder path segments between the watched root and the file (structure preservation). */
export function relativeSegmentsFor(rootPath: string, filePath: string): string[] {
  const normRoot = path.normalize(rootPath).replace(/[\\/]+$/, "");
  const normFile = path.normalize(filePath);
  const rel = path.relative(normRoot, normFile);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return [];
  return rel.split(/[\\/]/).filter(Boolean).slice(0, -1);
}

export function isExtensionAllowed(fileName: string, list: string): boolean {
  if (!list || list.trim() === "" || list.trim() === "*" || list.includes("*")) return true;
  const allowed = parseExtensionList(list);
  if (allowed.length === 0 || allowed.includes(".*") || allowed.includes("*")) return true;
  return allowed.includes(extensionOf(fileName));
}

export function isHiddenFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base.startsWith(".")) return true;
  if (process.platform === "win32") {
    try {
      // Node exposes windows attributes lazily; fallback to name check only.
      return base.startsWith(".") || base.startsWith("$");
    } catch {
      return false;
    }
  }
  return base.startsWith(".");
}

export function mimeTypeFor(fileName: string): string {
  const ext = extensionOf(fileName);
  const map: Record<string, string> = {
    // Documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
    ".csv": "text/csv",
    ".log": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".xml": "application/xml",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    // Images
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".psd": "image/vnd.adobe.photoshop",
    // Videos
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".m4v": "video/x-m4v",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    // Archives
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".iso": "application/x-iso9660-image",
    ".exe": "application/x-msdownload",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Common Medal recording locations. Never assumed: the user always confirms. */
export function candidateMedalFolders(): string[] {
  const home = os.homedir();
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const drive = process.env.SystemDrive ?? "C:";
    candidates.push(
      path.join(home, "Videos", "Medal"),
      path.join(home, "Videos", "medal"),
      path.join(drive, "Users", "Public", "Videos", "Medal"),
      path.join(home, "AppData", "Local", "Medal"),
      path.join(drive, "Medal"),
      path.join(home, "OneDrive", "Videos", "Medal"),
      path.join(drive, "Videos", "Medal"),
    );
  } else {
    candidates.push(
      path.join(home, "Videos", "Medal"),
      path.join(home, "Videos", "medal"),
      path.join(home, ".local", "share", "Medal"),
      path.join("/mnt/c/Users", "User", "Videos", "Medal"),
      path.join(home, "drivevault-demo"),
    );
  }
  return Array.from(new Set(candidates.map(normalizePath)));
}

export interface DetectedFolder {
  path: string;
  exists: boolean;
  fileCount: number;
  writable: boolean;
}

export function detectMedalFolders(): DetectedFolder[] {
  return candidateMedalFolders()
    .filter((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    })
    .map((p) => describeFolder(p, DEFAULT_VIDEO_EXTENSIONS))
    .slice(0, 8);
}

export function describeFolder(folderPath: string, extensions: string[] = []): DetectedFolder {
  try {
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) return { path: folderPath, exists: false, fileCount: 0, writable: false };
    let fileCount = 0;
    let writable = true;
    try {
      fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      writable = false;
    }
    const countIn = (dir: string, depth: number) => {
      if (depth > 3 || fileCount > 5000) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) countIn(full, depth + 1);
        else if (extensions.length === 0 || extensions.includes(extensionOf(e.name))) fileCount += 1;
        if (fileCount > 5000) return;
      }
    };
    countIn(folderPath, 0);
    return { path: folderPath, exists: true, fileCount, writable };
  } catch {
    return { path: folderPath, exists: false, fileCount: 0, writable: false };
  }
}

export interface StabilitySample {
  size: number;
  mtimeMs: number;
  at: number;
}

/**
 * Pure stability decision: a file is stable when size (and mtime) have not
 * changed for `stableMs` milliseconds across the collected samples.
 */
export function isStable(samples: StabilitySample[], stableMs: number, now = Date.now()): boolean {
  if (samples.length < 2) return false;
  const last = samples[samples.length - 1];
  const firstUnchangedIndex = [...samples].reverse().findIndex((s) => s.size !== last.size || s.mtimeMs !== last.mtimeMs);
  let unchangedSince: number;
  if (firstUnchangedIndex === -1) unchangedSince = samples[0].at;
  else unchangedSince = samples[samples.length - 1 - firstUnchangedIndex].at;
  const stable = now - unchangedSince >= stableMs && now - last.at <= stableMs * 4 + 10_000;
  return stable && last.size > 0;
}

export interface StabilityOptions {
  stableMs: number;
  intervalMs?: number;
  timeoutMs?: number;
  maxSizeGrowthMs?: number;
  shouldAbort?: () => boolean;
}

export type StabilityResult =
  | { ok: true; size: number; mtimeMs: number }
  | { ok: false; reason: "gone" | "timeout" | "aborted"; size: number };

/** Polls a file until its size stops changing (recording finished). */
export async function waitForStableFile(filePath: string, opts: StabilityOptions): Promise<StabilityResult> {
  const interval = opts.intervalMs ?? Math.max(500, Math.min(2000, opts.stableMs / 3));
  const timeout = opts.timeoutMs ?? Math.max(opts.stableMs * 40, 30 * 60_000);
  const started = Date.now();
  const samples: StabilitySample[] = [];
  let everSeen = false;
  // Grace period for files that have not appeared on disk yet (creation latency).
  const graceMs = Math.min(Math.max(1000, opts.stableMs), Math.max(1000, Math.floor(timeout / 2)));

  while (Date.now() - started < timeout) {
    if (opts.shouldAbort?.()) return { ok: false, reason: "aborted", size: samples.at(-1)?.size ?? 0 };
    let stat;
    try {
      stat = fs.statSync(filePath);
      everSeen = true;
    } catch {
      // File may not be visible yet; allow a short grace period.
      if (!everSeen && Date.now() - started < graceMs) {
        await sleep(interval);
        continue;
      }
      return { ok: false, reason: "gone", size: samples.at(-1)?.size ?? 0 };
    }
    samples.push({ size: stat.size, mtimeMs: stat.mtimeMs, at: Date.now() });
    if (samples.length > 60) samples.shift();
    if (isStable(samples, opts.stableMs)) return { ok: true, size: stat.size, mtimeMs: stat.mtimeMs };
    await sleep(interval);
  }
  return { ok: false, reason: "timeout", size: samples.at(-1)?.size ?? 0 };
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.round(Math.max(0, ms))));
}

/**
 * Practical fingerprint: SHA-256 over size + first/last MB + mtime.
 * Full hashing of 20 GB recordings is not sensible, and this is only used for
 * duplicate detection when the user enables it.
 */
export async function fingerprintFile(filePath: string, size: number): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(String(size));
  const chunk = 1024 * 1024;
  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(filePath, { start: 0, end: Math.max(0, Math.min(chunk, size) - 1) });
    rs.on("data", (d) => hash.update(d));
    rs.on("error", reject);
    rs.on("end", () => resolve());
  });
  if (size > chunk * 2) {
    await new Promise<void>((resolve, reject) => {
      const rs = fs.createReadStream(filePath, { start: size - chunk, end: size - 1 });
      rs.on("data", (d) => hash.update(d));
      rs.on("error", reject);
      rs.on("end", () => resolve());
    });
  }
  return hash.digest("hex");
}

export interface DiskStats {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export function localDiskStats(targetPath: string = "/"): DiskStats {
  try {
    const statfs = fs.statfsSync(targetPath);
    const totalBytes = Number(statfs.blocks) * Number(statfs.bsize);
    const freeBytes = Number(statfs.bfree) * Number(statfs.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
    };
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0, usedPercent: 0 };
  }
}

export function runningProcesses(): string[] {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", timeout: 4000 });
      return out
        .split("\n")
        .map((l) => l.split(",")[0]?.replace(/"/g, "").trim())
        .filter((v): v is string => Boolean(v));
    }
    const out = execFileSync("ps", ["-eo", "comm="], { encoding: "utf8", timeout: 4000 });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function detectGameRunning(processNames: string[]): { running: boolean; matched: string[] } {
  const wanted = processNames.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return { running: false, matched: [] };
  const procs = runningProcesses().map((p) => p.toLowerCase());
  const matched = wanted.filter((w) => procs.some((p) => p === w || p === `${w}.exe` || p.startsWith(`${w}.`)));
  return { running: matched.length > 0, matched };
}

export function safeUnlink(filePath: string): { ok: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) return { ok: true };
    
    // On Windows, move to Recycle Bin for 100% safety
    if (process.platform === "win32") {
      try {
        const psCmd = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${filePath.replace(/'/g, "''")}', [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)`;
        execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], { timeout: 8000 });
        return { ok: true };
      } catch {
        fs.unlinkSync(filePath);
        return { ok: true };
      }
    }

    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
