import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { regenerateItem } from "@/lib/twin";
import { contentType } from "@/lib/h5p/contentTypes";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const RENDER_DIR = path.join(process.cwd(), "public", "h5p", "_render");

async function materialise(id: string, host: string, contentJson: unknown) {
  const hostDir = path.join(process.cwd(), "public", "h5p", host);
  const dest = path.join(RENDER_DIR, id);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.join(dest, "content"), { recursive: true });
  let h5pJson = "{}";
  try {
    h5pJson = await fs.readFile(path.join(hostDir, "h5p.json"), "utf8");
  } catch {
    /* host not prepared */
  }
  await fs.writeFile(path.join(dest, "h5p.json"), h5pJson);
  await fs.writeFile(
    path.join(dest, "content", "content.json"),
    JSON.stringify(contentJson),
  );
  return { librariesPath: `/h5p/${host}`, h5pJsonPath: `/h5p/_render/${id}` };
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
  const render = await materialise(id, host, item.contentJson);
  const hostPrepared = await fs
    .access(path.join(process.cwd(), "public", "h5p", host, "h5p.json"))
    .then(() => true)
    .catch(() => false);

  return NextResponse.json({ item: { ...item, id, render, hostPrepared } });
}
