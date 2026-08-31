import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { eventsLog as LOG } from "@/lib/server-paths";

export const runtime = "nodejs";

// MVP: append review-stage feedback to a JSONL log. This is the eval stream —
// approve-without-edit rate, regenerate adjustments, discard reasons, edit
// magnitude, per content type / source kind / intent.

export async function POST(req: NextRequest) {
  const event = await req.json();
  const line =
    JSON.stringify({ ...event, at: new Date().toISOString() }) + "\n";
  try {
    await fs.appendFile(LOG, line, "utf8");
  } catch (e) {
    console.error("review-event append failed:", e);
  }
  return NextResponse.json({ ok: true });
}
