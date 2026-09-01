import { NextRequest, NextResponse } from "next/server";
import { refineElement } from "@/lib/twin";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Rewrite one field of one question — a stem or a single answer option. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    source: TwinSource;
    intent: ImportIntent;
    activityLabel: string;
    question: string;
    siblings: string[];
    target: "stem" | "option";
    current: string;
    isCorrect?: boolean;
    ask: string;
  };
  if (!body?.ask || body.current == null) {
    return NextResponse.json({ error: "ask and current required" }, { status: 400 });
  }
  const value = await refineElement(body);
  if (value == null) {
    return NextResponse.json({ error: "no result" }, { status: 502 });
  }
  return NextResponse.json({ value });
}
