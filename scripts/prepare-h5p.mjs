// Fetch H5P library bundles from the content-type hub and extract them so
// h5p-standalone can render the twin's generated content.
//
//   node scripts/prepare-h5p.mjs
//
// Each hub package (https://api.h5p.org/v1/content-types/<MachineName>) is a
// full .h5p structure: h5p.json + content/content.json (a working example we
// keep as a structure reference) + one folder per bundled library.
//
// Any *.h5p file dropped in data/ is also extracted (manual override / capture).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const outDir = path.join(root, "public", "h5p");

// machineName -> render-host folder under public/h5p/
const HUB_TYPES = {
  "H5P.SingleChoiceSet": "single-choice-set",
  "H5P.Summary": "summary",
  "H5P.QuestionSet": "question-set",
  "H5P.Dialogcards": "dialog-cards",
  "H5P.DragText": "drag-text",
  "H5P.Crossword": "crossword",
  "H5P.Accordion": "accordion",
};

async function extractTo(zip, host) {
  const target = path.join(outDir, host);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  zip.extractAllTo(target, true);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  // frame assets for h5p-standalone
  const hs = path.join(root, "node_modules", "h5p-standalone", "dist");
  await fs.rm(path.join(outDir, "_assets"), { recursive: true, force: true });
  await fs.cp(hs, path.join(outDir, "_assets"), { recursive: true });

  const prepared = [];

  for (const [machineName, host] of Object.entries(HUB_TYPES)) {
    try {
      const res = await fetch(
        `https://api.h5p.org/v1/content-types/${machineName}`,
      );
      if (!res.ok) throw new Error(`hub ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const zip = new AdmZip(buf);
      await extractTo(zip, host);
      prepared.push({ machineName, host });
      console.log(`  ${machineName}  ->  public/h5p/${host}/`);
    } catch (e) {
      console.warn(`  skip ${machineName}: ${e.message}`);
    }
  }

  // manual .h5p overrides in data/
  let files = [];
  try {
    files = (await fs.readdir(dataDir)).filter((f) =>
      f.toLowerCase().endsWith(".h5p"),
    );
  } catch {
    /* no data dir */
  }
  for (const file of files) {
    const zip = new AdmZip(path.join(dataDir, file));
    const h5pJson = JSON.parse(zip.readAsText("h5p.json"));
    const host = HUB_TYPES[h5pJson.mainLibrary] ?? h5pJson.mainLibrary.toLowerCase();
    await extractTo(zip, host);
    console.log(`  data/${file}  ->  public/h5p/${host}/  (override)`);
  }

  await fs.writeFile(
    path.join(outDir, "_hosts.json"),
    JSON.stringify(prepared, null, 2),
  );
  console.log(`\n${prepared.length} content types prepared.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
