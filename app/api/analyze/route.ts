import { NextRequest, NextResponse } from "next/server";
import { analyzeSource } from "@/lib/twin";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";

/** Stage 1 — source read-back + activity recommendations (both from one pass). */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { source: TwinSource; intent: ImportIntent };
  if (!body?.source?.value) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  const analysis = await analyzeSource(body.source, body.intent);
  return NextResponse.json({
    analysis,
    recommendations: analysis.recommendations,
  });
}
