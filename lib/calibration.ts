// Loads captured real Smart Import outputs for calibration.
// prepare-h5p.mjs extracts each data/*.h5p into public/h5p/_samples/<name>/
// and writes a manifest at public/h5p/_samples/manifest.json.

import { promises as fs } from "node:fs";
import path from "node:path";

export interface CalibrationSample {
  name: string;
  mainLibrary: string;
  sourceHint: string;
  contentJson: unknown;
}

const SAMPLES_DIR = path.join(process.cwd(), "public", "h5p", "_samples");

export async function loadCalibrationSamples(): Promise<CalibrationSample[]> {
  try {
    const manifestRaw = await fs.readFile(
      path.join(SAMPLES_DIR, "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as {
      name: string;
      mainLibrary: string;
      sourceHint: string;
    }[];
    const out: CalibrationSample[] = [];
    for (const entry of manifest) {
      const contentRaw = await fs.readFile(
        path.join(SAMPLES_DIR, entry.name, "content", "content.json"),
        "utf8",
      );
      out.push({ ...entry, contentJson: JSON.parse(contentRaw) });
    }
    return out;
  } catch {
    return [];
  }
}
