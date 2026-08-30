// Structure reference for the model engine — the real example content.json that
// ships inside each H5P content-type hub package (extracted by prepare-h5p.mjs
// into public/h5p/<host>/content/content.json). Used as the format the model
// must match. No topic content flows through: the twin generates from the
// educator's source.

import { promises as fs } from "node:fs";
import path from "node:path";
import { contentType } from "./h5p/contentTypes";

const cache = new Map<string, string>();

/** A trimmed real example content.json for `contentTypeName`, or "" if unavailable. */
export async function structureRef(contentTypeName: string): Promise<string> {
  if (cache.has(contentTypeName)) return cache.get(contentTypeName)!;
  const host = contentType(contentTypeName)?.renderHost;
  if (!host) return "";
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "h5p", host, "content", "content.json"),
      "utf8",
    );
    // keep it bounded — the model needs the shape, not every locale string
    const trimmed = JSON.stringify(JSON.parse(raw)).slice(0, 4000);
    cache.set(contentTypeName, trimmed);
    return trimmed;
  } catch {
    cache.set(contentTypeName, "");
    return "";
  }
}
