"use client";

/** Small typed helpers for renderer-side API calls (mirrors the IPC bridge). */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export function detectMedalCandidates() {
  return fetch("/api/folders", { method: "PUT" })
    .then((r) => r.json())
    .then((d) => ({ detected: (d.detected ?? []) as { path: string; exists: boolean; fileCount: number; writable: boolean }[] }))
    .catch(() => ({ detected: [] as { path: string; exists: boolean; fileCount: number; writable: boolean }[] }));
}

export function fetchCleanup() {
  return getJson<{
    candidates: {
      queueId: number;
      localPath: string;
      fileName: string;
      fileSize: number;
      uploadedAt: string;
      driveFileId: string;
      verified: boolean;
      protected: boolean;
      safe: boolean;
      reason: string;
      exists: boolean;
      keepLocalUntil: string | null;
    }[];
    safeBytes: number;
    totalBytes: number;
    neverDeleteAutomatically: boolean;
  }>("/api/cleanup");
}

export function fetchDriveFolders() {
  return getJson<{ connected: boolean; folders: { id: string; name: string; isRoot: boolean }[] }>("/api/drive");
}

export function fetchDriveFiles(trash = false, parent?: string) {
  const params = new URLSearchParams();
  if (trash) params.set("trash", "1");
  if (parent) params.set("parent", parent);
  return getJson<{ files: { id: string; name: string; size: number; mimeType: string; modifiedTime: string | null; trashed: boolean; webViewLink: string | null; parents: string[]; isFolder: boolean }[] }>(
    `/api/drive/files${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export function fetchLogsPage(kind: string, page: number, limit = 50) {
  return getJson<{
    items: {
      id: number;
      ts?: string;
      eventType?: string;
      filePath?: string | null;
      status?: string | null;
      errorCode?: string | null;
      message?: string;
      fileName?: string;
      localPath?: string;
      fileSize?: number;
      drivePath?: string | null;
      uploadedAt?: string;
      verifiedAt?: string | null;
      deletedLocallyAt?: string | null;
    }[];
    total: number;
    page: number;
    limit: number;
  }>(`/api/logs?kind=${kind}&page=${page}&limit=${limit}`);
}

export function fetchProtected() {
  return getJson<{ items: { id: number; path: string; kind: string; note: string | null; createdAt: string | null }[] }>("/api/protected");
}
