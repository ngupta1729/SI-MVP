import { NextRequest, NextResponse } from "next/server";
import { analyzeSource, recommendActivities } from "@/lib/twin";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";

/** Stage 1 — source read-back + activity recommendations. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { source: TwinSource; intent: ImportIntent };
  if (!body?.source?.value) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  const analysis = await analyzeSource(body.source);
  const recommendations = recommendActivities(analysis, body.intent);
  return NextResponse.json({ analysis, recommendations });
}
