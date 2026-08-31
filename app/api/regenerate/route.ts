import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { regenerateItem } from "@/lib/twin";
import { contentType } from "@/lib/h5p/contentTypes";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function renderPlan(id: string, host: string) {
  let h5pJson = "{}";
  try {
    h5pJson = await fs.readFile(
      path.join(process.cwd(), "public", "h5p", host, "h5p.json"),
      "utf8",
    );
  } catch {
    /* host not prepared */
  }
  return {
    librariesPath: `/h5p/${host}`,
    h5pJsonPath: `/api/h5p-render/${id}`,
    h5pJson,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    source: TwinSource;
    intent: ImportIntent;
    contentType: string;
    adjustment: string;
    itemId: string;
    attempt?: number;
  };
  if (!body?.source?.value || !body?.contentType) {
    return NextResponse.json({ error: "source and contentType required" }, { status: 400 });
  }

  const item = await regenerateItem(
    body.source,
    body.intent,
    body.contentType,
    body.adjustment,
    body.attempt ?? 1,
  );
  if (!item) {
    return NextResponse.json({ error: "regeneration produced nothing" }, { status: 502 });
  }

  const def = contentType(body.contentType);
  const host = def?.renderHost ?? "single-choice-set";
  const id = body.itemId; // keep the same id so it slots back into the list
  const render = await renderPlan(id, host);
  const hostPrepared = await fs
    .access(path.join(process.cwd(), "public", "h5p", host, "h5p.json"))
    .then(() => true)
    .catch(() => false);

  return NextResponse.json({ item: { ...item, id, render, hostPrepared } });
}
