import { buildSnapshot } from "@/lib/snapshot";
import { ensureEngineStarted } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureEngineStarted().catch((e) => console.warn("Engine start warning:", e));
    const snapshot = await buildSnapshot();
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Snapshot error:", err);
    try {
      const snapshot = await buildSnapshot();
      return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({
        authError: (err as Error).message ?? "System initializing...",
        connected: false,
        drive: { connected: false, limitBytes: 0, usageBytes: 0, remainingBytes: 0 },
        local: { freeBytes: 0, totalBytes: 0, usedBytes: 0, usedPercent: 0 },
        engine: { running: false, paused: false, gamingModeActive: false, matchedGames: [], activeUploads: 0, watchedFolders: 0 },
        folders: [],
        queue: [],
        recent: [],
        currentUpload: null,
        stats: { filesUploaded: 0, totalCloudBytes: 0, uploadedToday: 0, uploadedTodayBytes: 0, uploadedWeek: 0, uploadedWeekBytes: 0, spaceFreedBytes: 0, potentialFreeBytes: 0, failed: 0 },
        settings: { gamingMode: true, gamingModeAction: "pause", gameProcesses: "", storageThresholdPercent: 90, keepLocalDays: 7, deleteAfterUpload: false, neverDeleteAutomatically: true, uploadSpeedLimitKbps: 0, concurrentUploads: 2, chunkSizeMb: 8, maxRetries: 5, retryDelayMs: 5000, retryBackoffFactor: 2, stabilityDelayMs: 3000, hashBeforeUpload: true, uploadDuplicates: false, notifications: true, notifyOnComplete: true, notifyOnFail: true, notifyStorageLow: true, notifyQueueEmpty: true, enginePaused: false, theme: "dark", compactMode: false },
        notifications: [],
        account: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }
  }
}
