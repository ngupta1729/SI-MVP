"use client";

// A finished Smart Import, persisted server-side (.imports.jsonl via /api/imports)
// so its receipt survives "Start another import" and a page reload. This is the
// "occasional lookup" store — reached from a content item's `from:` tag.

import type { ImportIntent, SourceAnalysis } from "./types";

export interface ImportRecordSource {
  kind: "text" | "url";
  /** The ACTUAL pasted text or URL — the receipt is self-contained. */
  value: string;
  wordCount?: number;
  readbackKind?: SourceAnalysis["kind"];
}

export interface ImportItemDecision {
  itemId: string;
  /** Final content type (after any remix). */
  contentType: string;
  kept: boolean;
  edited: boolean;
  /** JSON length delta of the edit, same formula finishCreate already uses. */
  charsDelta?: number;
  /** 0 = never refined. */
  refineAttempts: number;
  /** Steers applied, in order, e.g. ["harder", "simpler"]. */
  refineSteers: string[];
  remixCount: number;
  /** Original content type, if this item was remixed into another. */
  remixFrom?: string;
  discarded: boolean;
  discardReason?: string;
}

export interface ImportKeptItem {
  id: string;
  title: string;
  contentType: string;
  concepts: string[];
  /** Edits baked in. */
  contentJson: unknown;
  /** Player paths — valid for the current import; stale for older ones (item ids collide). */
  render: { librariesPath: string; h5pJsonPath: string };
  hostPrepared: boolean;
}

export interface ImportOutcome {
  generated: number;
  kept: number;
  edited: number;
  refined: number;
  remixed: number;
  discarded: number;
}

export interface ImportRecord {
  /** === the session importId, shared with the review_event stream. */
  id: string;
  /** Topic-based auto-name: stem + " · " + YYYY-MM-DD. */
  name: string;
  createdAt: number;
  source: ImportRecordSource;
  intent: ImportIntent;
  promptPresetId: string | null;
  engine: string;
  model: string | null;
  /** Anonymous per-browser id (localStorage), shared with the review_event stream. */
  sessionId?: string;
  /** Which UI shape produced this import. */
  uiVariant?: "wizard" | "workspace";
  outcome: ImportOutcome;
  /** One per generated item — kept and discarded. */
  decisions: ImportItemDecision[];
  /** Kept items only, with enough to re-render. */
  items: ImportKeptItem[];
}

export async function fetchImports(): Promise<ImportRecord[]> {
  try {
    const r = await fetch("/api/imports");
    return r.ok ? ((await r.json()).imports ?? []) : [];
  } catch {
    return [];
  }
}

export function saveImport(record: ImportRecord): void {
  fetch("/api/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  }).catch(() => {});
}

/** The receipt's "Intent" line. */
export function intentLabel(i: ImportIntent): string {
  if (i.authoringMode !== "brief") return i.prompt || "(defaults)";
  const filled = (i.briefFields ?? [])
    .filter((f) => f.label.trim() && f.value.trim())
    .map((f) => `${f.label.trim()}: ${f.value.trim()}`);
  filled.push(`${i.emphasis} emphasis`, `${i.volume} volume`);
  return `Brief — ${filled.join(" · ")}`;
}
