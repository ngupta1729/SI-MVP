// Loads captured real Smart Import outputs for calibration + source matching.
// prepare-h5p.mjs extracts each data/*.h5p into public/h5p/_samples/<name>/,
// copies an optional data/<file>.source.txt sidecar next to it, and writes a
// manifest at public/h5p/_samples/manifest.json.

import { promises as fs } from "node:fs";
import path from "node:path";

export interface CalibrationSample {
  name: string;
  mainLibrary: string;
  contentType: string; // machine name, e.g. "H5P.SingleChoiceSet"
  sourceHint: string;
  renderHost: string;
  contentJson: unknown;
  /** The original source text this sample was generated from, if captured. */
  sourceText: string;
}

const SAMPLES_DIR = path.join(process.cwd(), "public", "h5p", "_samples");

export async function loadCalibrationSamples(): Promise<CalibrationSample[]> {
  try {
    const manifestRaw = await fs.readFile(
      path.join(SAMPLES_DIR, "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as Array<{
      name: string;
      mainLibrary: string;
      sourceHint: string;
      renderHost: string;
    }>;
    const out: CalibrationSample[] = [];
    for (const entry of manifest) {
      const contentRaw = await fs.readFile(
        path.join(SAMPLES_DIR, entry.name, "content", "content.json"),
        "utf8",
      );
      let sourceText = "";
      try {
        sourceText = await fs.readFile(
          path.join(SAMPLES_DIR, entry.name, "source.txt"),
          "utf8",
        );
      } catch {
        /* no sidecar captured */
      }
      out.push({
        ...entry,
        contentType: entry.mainLibrary.split(" ")[0],
        contentJson: JSON.parse(contentRaw),
        sourceText,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// --- source similarity -------------------------------------------------------

function tokenSet(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter(
      (w) => w.length >= 4,
    ),
  );
}

export function similarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter); // Jaccard
}
