import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderDir } from "@/lib/server-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

type Ctx = { params: Promise<{ id: string; path?: string[] }> };

/**
 * Stage the generated H5P for an item into tmp so h5p-standalone can fetch it.
 * The client calls this on mount (it holds contentJson), which self-heals a
 * cold start between Generate and Play.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  let body: { h5pJson?: string; contentJson?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const dest = path.join(renderDir, id);
  await fs.mkdir(path.join(dest, "content"), { recursive: true });
  await fs.writeFile(
    path.join(dest, "h5p.json"),
    typeof body.h5pJson === "string" && body.h5pJson ? body.h5pJson : "{}",
  );
  await fs.writeFile(
    path.join(dest, "content", "content.json"),
    JSON.stringify(body.contentJson ?? {}),
  );
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, path: parts } = await ctx.params;
  if (!ID_RE.test(id) || !parts || !parts.length) {
    return new NextResponse("not found", { status: 404 });
  }
  const rel = parts.join("/");
  if (rel.includes("..") || path.isAbsolute(rel)) {
    return new NextResponse("bad path", { status: 400 });
  }
  const file = path.join(renderDir, id, rel);
  try {
    const buf = await fs.readFile(file);
    return new NextResponse(buf, {
      headers: {
        "content-type": rel.endsWith(".json")
          ? "application/json; charset=utf-8"
          : "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
