import { NextRequest, NextResponse } from "next/server";
import { refineElement, refineQuestion, type SubQType } from "@/lib/twin";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Rewrite one field of one question (stem / option), or regenerate a whole
 *  sub-question of a composite activity. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    target: "stem" | "option" | "question";
    source: TwinSource;
    intent: ImportIntent;
    activityLabel: string;
    ask: string;
    // stem/option
    question?: string;
    siblings?: string[];
    current?: string;
    isCorrect?: boolean;
    // question
    currentStem?: string;
    currentOptions?: { text: string; correct: boolean }[];
    siblingStems?: string[];
    toType?: SubQType;
  };
  if (!body?.ask && !(body?.target === "question" && body?.toType)) {
    return NextResponse.json({ error: "ask required" }, { status: 400 });
  }

  if (body.target === "question") {
    const q = await refineQuestion({
      source: body.source,
      intent: body.intent,
      activityLabel: body.activityLabel,
      currentStem: body.currentStem ?? "",
      currentOptions: body.currentOptions ?? [],
      siblingStems: body.siblingStems ?? [],
      ask: body.ask,
      toType: body.toType,
    });
    if (!q) return NextResponse.json({ error: "no result" }, { status: 502 });
    return NextResponse.json({ question: q });
  }

  if (body.current == null) {
    return NextResponse.json({ error: "current required" }, { status: 400 });
  }
  const value = await refineElement({
    source: body.source,
    intent: body.intent,
    activityLabel: body.activityLabel,
    question: body.question ?? "",
    siblings: body.siblings ?? [],
    target: body.target,
    current: body.current,
    isCorrect: body.isCorrect,
    ask: body.ask,
  });
  if (value == null) {
    return NextResponse.json({ error: "no result" }, { status: 502 });
  }
  return NextResponse.json({ value });
}
