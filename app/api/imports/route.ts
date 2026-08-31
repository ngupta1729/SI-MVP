import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { importsLog as LOG } from "@/lib/server-paths";

export const runtime = "nodejs";

// Persisted import records — one appended line per finish (and per rename).
// GET dedupes by id (last line wins) so this stays an append-only log, like
// .review-events.jsonl next to it.

export async function POST(req: NextRequest) {
  const record = await req.json();
  const line = JSON.stringify({ ...record, savedAt: new Date().toISOString() }) + "\n";
  try {
    await fs.appendFile(LOG, line, "utf8");
  } catch (e) {
    console.error("imports append failed:", e);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  let raw = "";
  try {
    raw = await fs.readFile(LOG, "utf8");
  } catch {
    return NextResponse.json(id ? { import: null } : { imports: [] });
  }

  const byId = new Map<string, { id: string; createdAt: number }>();
  for (const l of raw.split("\n")) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      if (r?.id) byId.set(r.id, r);
    } catch {
      /* skip a corrupt line */
    }
  }
  const list = [...byId.values()].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );

  if (id) return NextResponse.json({ import: list.find((r) => r.id === id) ?? null });
  return NextResponse.json({ imports: list });
}
