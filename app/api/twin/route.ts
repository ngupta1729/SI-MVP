import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runTwin } from "@/lib/twin";
import { contentType } from "@/lib/h5p/contentTypes";
import type { ImportIntent, TwinSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const RENDER_DIR = path.join(process.cwd(), "public", "h5p", "_render");

/**
 * Materialise each generated item into public/h5p/_render/<id>/ so
 * h5p-standalone can load it: our content.json + the host's h5p.json,
 * with libraries served from the extracted real export.
 */
async function materialise(id: string, host: string, contentJson: unknown) {
  const hostDir = path.join(process.cwd(), "public", "h5p", host);
  const dest = path.join(RENDER_DIR, id);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.join(dest, "content"), { recursive: true });

  let h5pJson = "{}";
  try {
    h5pJson = await fs.readFile(path.join(hostDir, "h5p.json"), "utf8");
  } catch {
    /* host not prepared yet */
  }
  await fs.writeFile(path.join(dest, "h5p.json"), h5pJson);
  await fs.writeFile(
    path.join(dest, "content", "content.json"),
    JSON.stringify(contentJson),
  );
  return { librariesPath: `/h5p/${host}`, h5pJsonPath: `/h5p/_render/${id}` };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { source: TwinSource; intent: ImportIntent };
  if (!body?.source?.value || !body?.intent?.contentTypes?.length) {
    return NextResponse.json(
      { error: "source and at least one content type are required" },
      { status: 400 },
    );
  }

  const result = await runTwin(body.source, body.intent);

  const items = [];
  for (const item of result.items) {
    const def = contentType(item.contentType);
    const host = def?.renderHost ?? "summary";
    const render = await materialise(item.id, host, item.contentJson);
    items.push({ ...item, render, hostPrepared: await hostExists(host) });
  }

  return NextResponse.json({
    ...result,
    items,
    model:
      result.engine === "model"
        ? process.env.TWIN_MODEL || "gpt-4o-mini"
        : null,
  });
}

async function hostExists(host: string) {
  try {
    await fs.access(path.join(process.cwd(), "public", "h5p", host, "h5p.json"));
    return true;
  } catch {
    return false;
  }
}
