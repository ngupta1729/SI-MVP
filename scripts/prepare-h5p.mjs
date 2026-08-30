// Extract every data/*.h5p into public/h5p/ so h5p-standalone can render it,
// and register each as a calibration sample.
//
//   node scripts/prepare-h5p.mjs
//
// A .h5p file is a zip: h5p.json (metadata + mainLibrary) at the root,
// content/content.json (the payload), and one folder per bundled library.
// We extract the whole thing to two places:
//   public/h5p/<renderHost>/     -> render host for a content type (libraries live here)
//   public/h5p/_samples/<name>/  -> kept as calibration ground truth
//
// renderHost mapping is derived from h5p.json's mainLibrary.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const outDir = path.join(root, "public", "h5p");
const samplesDir = path.join(outDir, "_samples");

const HOST_BY_LIBRARY = {
  "H5P.Summary": "summary",
  "H5P.SingleChoiceSet": "single-choice-set",
  "H5P.TrueFalse": "true-false",
  "H5P.Flashcards": "flashcards",
  "H5P.QuestionSet": "question-set",
  "H5P.Column": "column",
  "H5P.InteractiveBook": "interactive-book",
  "H5P.CoursePresentation": "course-presentation",
};

async function main() {
  await fs.mkdir(samplesDir, { recursive: true });

  // frame assets for h5p-standalone
  const hs = path.join(root, "node_modules", "h5p-standalone", "dist");
  await fs.cp(hs, path.join(outDir, "_assets"), { recursive: true });

  let files = [];
  try {
    files = (await fs.readdir(dataDir)).filter((f) => f.toLowerCase().endsWith(".h5p"));
  } catch {
    /* no data dir */
  }

  if (files.length === 0) {
    console.log("No .h5p files in data/ yet. Drop a real Smart Import export there and re-run.");
    await fs.writeFile(path.join(samplesDir, "manifest.json"), "[]");
    return;
  }

  const manifest = [];
  for (const file of files) {
    const name = file.replace(/\.h5p$/i, "").replace(/[^a-z0-9-_]/gi, "-");
    const zip = new AdmZip(path.join(dataDir, file));
    const h5pJson = JSON.parse(zip.readAsText("h5p.json"));
    const mainLibrary = h5pJson.mainLibrary;
    const host = HOST_BY_LIBRARY[mainLibrary] ?? name.toLowerCase();

    for (const target of [path.join(outDir, host), path.join(samplesDir, name)]) {
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(target, { recursive: true });
      zip.extractAllTo(target, true);
    }

    // optional source sidecar: data/<file>.source.txt -> _samples/<name>/source.txt
    const sidecar = path.join(dataDir, file.replace(/\.h5p$/i, ".source.txt"));
    try {
      await fs.copyFile(sidecar, path.join(samplesDir, name, "source.txt"));
      console.log(`  + captured source sidecar for ${name}`);
    } catch {
      /* no sidecar */
    }

    manifest.push({
      name,
      mainLibrary: `${mainLibrary} ${h5pJson.preloadedDependencies?.find((d) => d.machineName === mainLibrary)?.majorVersion ?? ""}.${h5pJson.preloadedDependencies?.find((d) => d.machineName === mainLibrary)?.minorVersion ?? ""}`.trim(),
      sourceHint: h5pJson.title ?? name,
      renderHost: host,
    });
    console.log(`extracted ${file}  ->  main=${mainLibrary}  host=public/h5p/${host}/`);
  }

  await fs.writeFile(
    path.join(samplesDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`\nwrote manifest with ${manifest.length} sample(s).`);
  console.log("Reconcile these library versions into lib/h5p/contentTypes.ts if they differ.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
