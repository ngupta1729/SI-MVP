// Writable paths for server-side file IO. Vercel's filesystem is read-only
// except os.tmpdir(); local dev keeps the .jsonl logs in the project root so
// /dashboard shows data accumulated across dev sessions.

import os from "node:os";
import path from "node:path";

const onVercel = !!process.env.VERCEL;

/** Per-item H5P render staging — always tmp (ephemeral; the client re-stages on Play). */
export const renderDir = path.join(os.tmpdir(), "si-render");

export const eventsLog = onVercel
  ? path.join(os.tmpdir(), "si-review-events.jsonl")
  : path.join(process.cwd(), ".review-events.jsonl");

export const importsLog = onVercel
  ? path.join(os.tmpdir(), "si-imports.jsonl")
  : path.join(process.cwd(), ".imports.jsonl");
