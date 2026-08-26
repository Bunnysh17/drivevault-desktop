import { z } from "zod";
import { getSettings, resetSettings, updateSettings } from "@/lib/settings";
import { logActivity } from "@/lib/log";
import { refreshWatchers } from "@/lib/engine";

export const dynamic = "force-dynamic";

const settingsSchema = z
  .object({
    startWithWindows: z.boolean().optional(),
    minimizeToTray: z.boolean().optional(),
    launchMinimized: z.boolean().optional(),
    notifications: z.boolean().optional(),
    notifyOnComplete: z.boolean().optional(),
    notifyOnFail: z.boolean().optional(),
    notifyQueueEmpty: z.boolean().optional(),
    notifyStorageLow: z.boolean().optional(),
    concurrentUploads: z.number().int().min(1).max(8).optional(),
    uploadSpeedLimitKbps: z.number().min(0).max(1000000).optional(),
    chunkSizeMb: z.number().int().min(1).max(64).optional(),
    maxRetries: z.number().int().min(0).max(20).optional(),
    retryDelayMs: z.number().min(500).max(600000).optional(),
    retryBackoffFactor: z.number().min(1).max(5).optional(),
    defaultDriveFolderId: z.string().max(200).optional(),
    defaultDriveFolderName: z.string().max(200).optional(),
    preserveStructure: z.boolean().optional(),
    uploadDuplicates: z.boolean().optional(),
    stabilityDelayMs: z.number().min(500).max(600000).optional(),
    allowedExtensions: z.string().max(500).optional(),
    ignoreHidden: z.boolean().optional(),
    minFileSizeMb: z.number().min(0).max(100000).optional(),
    hashBeforeUpload: z.boolean().optional(),
    deleteAfterUpload: z.boolean().optional(),
    askBeforeDeleting: z.boolean().optional(),
    keepLocalDays: z.number().int().min(0).max(3650).optional(),
    storageThresholdPercent: z.number().int().min(50).max(99).optional(),
    gamingMode: z.boolean().optional(),
    gameProcesses: z.string().max(1000).optional(),
    gamingModeAction: z.enum(["pause", "slow"]).optional(),
    theme: z.enum(["dark", "light", "ocean", "forest", "neon", "system", "celestial", "emerald", "butterfly", "firefly"]).optional(),
    compactMode: z.boolean().optional(),
    neverDeleteAutomatically: z.boolean().optional(),
    onboardingComplete: z.boolean().optional(),
    enginePaused: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  return Response.json({ settings: await getSettings() });
}

export async function PUT(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings payload.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const settings = await updateSettings(parsed.data);
  await refreshWatchers();
  return Response.json({ settings });
}

export const POST = PUT;
export const PATCH = PUT;

export async function DELETE() {
  const settings = await resetSettings();
  await logActivity("settings", "Settings restored to recommended defaults.", { status: "info", notify: true });
  return Response.json({ settings });
}
