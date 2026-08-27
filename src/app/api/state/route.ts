import { buildSnapshot } from "@/lib/snapshot";
import { ensureEngineStarted } from "@/lib/engine";

export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const FALLBACK_SNAPSHOT = {
  authError: "Dashboard is loading, please wait...",
  connected: false,
  drive: { connected: false, limitBytes: 0, usageBytes: 0, remainingBytes: 0 },
  local: { freeBytes: 0, totalBytes: 0, usedBytes: 0, usedPercent: 0 },
  engine: { running: false, paused: false, gamingModeActive: false, matchedGames: [], activeUploads: 0, watchedFolders: 0 },
  folders: [],
  queue: [],
  recent: [],
  currentUpload: null,
  stats: { filesUploaded: 0, totalCloudBytes: 0, uploadedToday: 0, uploadedTodayBytes: 0, uploadedWeek: 0, uploadedWeekBytes: 0, spaceFreedBytes: 0, potentialFreeBytes: 0, failed: 0 },
  settings: { gamingMode: true, gamingModeAction: "pause", gameProcesses: "", storageThresholdPercent: 90, keepLocalDays: 7, deleteAfterUpload: false, neverDeleteAutomatically: true, uploadSpeedLimitKbps: 0, concurrentUploads: 4, chunkSizeMb: 64, maxRetries: 5, retryDelayMs: 5000, retryBackoffFactor: 2, stabilityDelayMs: 2000, hashBeforeUpload: true, uploadDuplicates: false, notifications: true, notifyOnComplete: true, notifyOnFail: true, notifyStorageLow: true, notifyQueueEmpty: true, enginePaused: false, theme: "dark", compactMode: false },
  notifications: [],
  account: null,
};

export async function GET() {
  try {
    // Start engine in background (don't block)
    ensureEngineStarted().catch(() => {});

    // Build snapshot with 8 second timeout
    const snapshot = await withTimeout(buildSnapshot(), 8000, FALLBACK_SNAPSHOT as any);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Snapshot error:", err);
    return Response.json(FALLBACK_SNAPSHOT, { headers: { "Cache-Control": "no-store" } });
  }
}

