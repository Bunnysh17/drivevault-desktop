import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

const SETTINGS_KEY = "app";

type Cache = { value: AppSettings; loadedAt: number };
const g = globalThis as typeof globalThis & { __drivevaultSettings?: Cache };

export function clampSettings(input: Partial<AppSettings>): Partial<AppSettings> {
  const out: Record<string, unknown> = { ...input };
  const num = (key: keyof AppSettings, min: number, max: number) => {
    const v = out[key as string];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key as string] = Math.min(max, Math.max(min, Math.round(v)));
    } else if (v !== undefined) {
      delete out[key as string];
    }
  };
  num("concurrentUploads", 1, 8);
  num("uploadSpeedLimitKbps", 0, 1_000_000);
  num("chunkSizeMb", 1, 64);
  num("maxRetries", 0, 20);
  num("retryDelayMs", 500, 600_000);
  num("retryBackoffFactor", 1, 5);
  num("stabilityDelayMs", 500, 600_000);
  num("minFileSizeMb", 0, 100_000);
  num("keepLocalDays", 0, 3650);
  num("storageThresholdPercent", 50, 99);
  return out as Partial<AppSettings>;
}

export async function getSettings(): Promise<AppSettings> {
  if (g.__drivevaultSettings && Date.now() - g.__drivevaultSettings.loadedAt < 1500) {
    return g.__drivevaultSettings.value;
  }
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
    const stored = (rows[0]?.value ?? {}) as Partial<AppSettings>;
    const value: AppSettings = { ...DEFAULT_SETTINGS, ...stored };
    g.__drivevaultSettings = { value, loadedAt: Date.now() };
    return value;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function invalidateSettingsCache() {
  g.__drivevaultSettings = undefined;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...clampSettings(patch) };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
  g.__drivevaultSettings = { value: next, loadedAt: Date.now() };
  return next;
}

export async function resetSettings(): Promise<AppSettings> {
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: DEFAULT_SETTINGS, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: DEFAULT_SETTINGS, updatedAt: new Date() },
    });
  g.__drivevaultSettings = { value: { ...DEFAULT_SETTINGS }, loadedAt: Date.now() };
  return { ...DEFAULT_SETTINGS };
}
