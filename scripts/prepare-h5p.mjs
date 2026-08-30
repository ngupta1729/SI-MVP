// Extract every data/*.h5p as an H5P player-library bundle into public/h5p/<host>/
// so h5p-standalone can render the twin's generated content.
//
//   node scripts/prepare-h5p.mjs
//
// A .h5p file is a zip: h5p.json (metadata + mainLibrary) at the root, and one
// folder per bundled library. The bundle's own content/ is irrelevant here — the
// app writes the twin's content.json into public/h5p/_render/<id>/ at request time
// and points the player's librariesPath at the extracted bundle.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const outDir = path.join(root, "public", "h5p");

const HOST_BY_LIBRARY = {
  "H5P.Summary": "summary",
  "H5P.SingleChoiceSet": "single-choice-set",
  "H5P.QuestionSet": "question-set",
  "H5P.Crossword": "crossword",
  "H5P.DragText": "drag-text",
  "H5P.Dialogcards": "dialog-cards",
  "H5P.InteractiveBook": "interactive-book",
};

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  // frame assets for h5p-standalone
  const hs = path.join(root, "node_modules", "h5p-standalone", "dist");
  await fs.rm(path.join(outDir, "_assets"), { recursive: true, force: true });
  await fs.cp(hs, path.join(outDir, "_assets"), { recursive: true });

  let files = [];
  try {
    files = (await fs.readdir(dataDir)).filter((f) =>
      f.toLowerCase().endsWith(".h5p"),
    );
  } catch {
    /* no data dir */
  }
  if (files.length === 0) {
    console.log("No .h5p library bundles in data/. Live preview will be disabled.");
    return;
  }

  const hosts = [];
  for (const file of files) {
    const zip = new AdmZip(path.join(dataDir, file));
    const h5pJson = JSON.parse(zip.readAsText("h5p.json"));
    const mainLibrary = h5pJson.mainLibrary;
    const host = HOST_BY_LIBRARY[mainLibrary] ?? mainLibrary.toLowerCase();
    const target = path.join(outDir, host);
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    zip.extractAllTo(target, true);
    hosts.push({ host, mainLibrary });
    console.log(`${file}  ->  libraries for ${mainLibrary}  at public/h5p/${host}/`);
  }

  await fs.writeFile(
    path.join(outDir, "_hosts.json"),
    JSON.stringify(hosts, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
