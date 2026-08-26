import { db } from "@/db";
import { sql } from "drizzle-orm";
import { engineStatus } from "@/lib/engine";
import { getAuthStatus } from "@/lib/google";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const health: Record<string, unknown> = { ok: true, ts: new Date().toISOString() };
  try {
    await db.execute(sql`select 1`);
    health.db = "ok";
  } catch {
    health.ok = false;
    health.db = "error";
    return Response.json(health, { status: 500 });
  }
  try {
    health.engine = engineStatus();
    const auth = await getAuthStatus();
    health.connected = auth.connected;
    health.configured = auth.configured;
    const settings = await getSettings();
    health.onboarded = settings.onboardingComplete;
  } catch (err) {
    health.ok = false;
    health.detail = (err as Error).message;
  }
  return Response.json(health, { headers: { "Cache-Control": "no-store" } });
}
