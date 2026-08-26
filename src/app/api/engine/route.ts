import { z } from "zod";
import { engineStatus, pauseEngine, refreshWatchers, resumeEngine, startEngine, stopEngine } from "@/lib/engine";
import { logActivity } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["start", "stop", "pause", "resume", "refresh", "status"]) });

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid engine action." }, { status: 400 });

  switch (parsed.data.action) {
    case "start":
      return Response.json(await startEngine());
    case "stop":
      await stopEngine();
      return Response.json(engineStatus());
    case "pause":
      await pauseEngine();
      return Response.json(engineStatus());
    case "resume":
      await resumeEngine();
      return Response.json(engineStatus());
    case "refresh":
      await refreshWatchers();
      await logActivity("watch", "Folder watchers refreshed.", { status: "info" });
      return Response.json(engineStatus());
    default:
      return Response.json(engineStatus());
  }
}

export async function GET() {
  return Response.json(engineStatus());
}
