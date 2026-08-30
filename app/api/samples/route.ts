import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

/** Lists the captured real Smart Import exports available for side-by-side comparison. */
export async function GET() {
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "h5p",
    "_samples",
    "manifest.json",
  );
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as {
      name: string;
      mainLibrary: string;
      sourceHint: string;
      renderHost: string;
    }[];
    return NextResponse.json({
      samples: manifest.map((m) => ({
        ...m,
        h5pJsonPath: `/h5p/_samples/${m.name}`,
      })),
    });
  } catch {
    return NextResponse.json({ samples: [] });
  }
}
