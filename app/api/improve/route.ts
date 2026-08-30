import { NextRequest, NextResponse } from "next/server";
import { improvePrompt } from "@/lib/twin";

export const runtime = "nodejs";

/** Stage 1 — rewrite a rough prompt to prompt-engineering best practice. */
export async function POST(req: NextRequest) {
  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  const improved = await improvePrompt(prompt);
  return NextResponse.json({ improved });
}
