// Server-only. Rolls up .imports.jsonl + .review-events.jsonl into eval + feedback
// metrics for the /dashboard page. Pure functions + a thin fs reader; no React.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImportRecord, ImportItemDecision } from "./import-records";
import { contentType } from "./h5p/contentTypes";

const IMPORTS_LOG = path.join(process.cwd(), ".imports.jsonl");
const EVENTS_LOG = path.join(process.cwd(), ".review-events.jsonl");

export type UiVariant = "wizard" | "workspace";

export interface ReviewActionEvent {
  importId: string;
  engine?: string;
  sourceKind?: "Pasted Text" | "Wikipedia";
  readbackKind?: string;
  sourceLength?: number;
  intent?: Record<string, unknown>;
  contentType?: string;
  action: "refine" | "remix" | "discard" | "edit" | "regenerate";
  itemId?: string;
  reason?: string;
  toType?: string;
  attempt?: number;
  charsDelta?: number;
  sessionId?: string;
  uiVariant?: UiVariant;
  at: string;
}
export interface ReviewSummaryEvent {
  importId: string;
  summary: {
    generated: number;
    created: number;
    edited: number;
    refined: number;
    remixed: number;
    discarded: number;
  };
  sessionId?: string;
  uiVariant?: UiVariant;
  at: string;
}
export type ReviewEvent = ReviewActionEvent | ReviewSummaryEvent;
export const isActionEvent = (e: ReviewEvent): e is ReviewActionEvent =>
  "action" in e;

/* ------------------------------- IO ------------------------------- */

export function parseJsonl<T = unknown>(raw: string): T[] {
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* skip a corrupt / partial line */
    }
  }
  return out;
}

/** Last line wins by `id`, newest first — same rule as app/api/imports/route.ts. */
export function dedupeImports(raw: string): ImportRecord[] {
  const byId = new Map<string, ImportRecord>();
  for (const r of parseJsonl<ImportRecord>(raw)) {
    if (r && typeof r.id === "string") byId.set(r.id, r);
  }
  return [...byId.values()].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
}

export async function readImports(): Promise<ImportRecord[]> {
  try {
    return dedupeImports(await fs.readFile(IMPORTS_LOG, "utf8"));
  } catch {
    return [];
  }
}

export async function readEvents(): Promise<ReviewEvent[]> {
  try {
    return parseJsonl<ReviewEvent>(await fs.readFile(EVENTS_LOG, "utf8")).filter(
      (e) => e && typeof (e as ReviewEvent).importId === "string",
    );
  } catch {
    return [];
  }
}

/* --------------------------- metric types --------------------------- */

export interface CountRow {
  label: string;
  count: number;
}
export interface NamedRate {
  label: string;
  clean: number;
  total: number;
  rate: number | null;
}

export interface Headline {
  imports: number;
  activitiesCreated: number;
  approveWithoutEditRate: number | null;
  approveWithoutEditN: number;
  medianEditChars: number | null;
  editedCount: number;
  refineActions: number;
  discards: number;
}

export interface OutcomeBreakdown {
  total: number;
  cleanKeep: number;
  edited: number;
  refined: number;
  remixed: number;
  discarded: number;
}

export interface ContentTypeRow {
  contentType: string;
  label: string;
  generated: number;
  kept: number;
  cleanApprove: number;
  cleanApprovePct: number | null;
  refined: number;
  remixed: number;
  discarded: number;
}

export interface AttemptLoopRow {
  importName: string;
  contentType: string;
  sourceKind: string;
  refineAttempts: number;
  steers: string[];
}

export interface RecentImportRow {
  id: string;
  name: string;
  savedAt: string;
  engine: string;
  model: string | null;
  sourceKind: string;
  wordCount: number | null;
  generated: number;
  kept: number;
  summary: string;
  uiVariant: UiVariant | null;
}

export interface NeverFinishedRow {
  importId: string;
  events: number;
  lastAction: string;
  at: string;
}

export interface SessionRow {
  sessionId: string;
  short: string;
  imports: number;
  activitiesCreated: number;
  variants: UiVariant[];
  firstAt: string;
  lastAt: string;
  spanMinutes: number;
}

export interface VariantSplit {
  variant: UiVariant;
  headline: Headline;
}

export interface DashboardMetrics {
  generatedAt: string;
  empty: boolean;
  fileState: {
    importsFound: boolean;
    eventsFound: boolean;
    importCount: number;
    eventCount: number;
  };
  headline: Headline;
  variantSplit: VariantSplit[];
  gate: {
    outcome: OutcomeBreakdown;
    byContentType: ContentTypeRow[];
    bySourceKind: NamedRate[];
    byEngine: NamedRate[];
  };
  feedback: {
    refineSteers: CountRow[];
    discardReasons: CountRow[];
    attemptLoops: AttemptLoopRow[];
  };
  recentImports: RecentImportRow[];
  neverFinished: NeverFinishedRow[];
  sessions: SessionRow[];
}

/* ----------------------------- helpers ----------------------------- */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
const rate = (clean: number, total: number) => (total ? clean / total : null);

const isCleanKeep = (d: ImportItemDecision) =>
  d.kept &&
  !d.edited &&
  (d.refineAttempts ?? 0) === 0 &&
  (d.remixCount ?? 0) === 0;

function bucket(
  d: ImportItemDecision,
): "cleanKeep" | "edited" | "refined" | "remixed" | "discarded" {
  if (d.discarded || !d.kept) return "discarded";
  if ((d.remixCount ?? 0) > 0) return "remixed";
  if ((d.refineAttempts ?? 0) > 0) return "refined";
  if (d.edited) return "edited";
  return "cleanKeep";
}

const sourceLabel = (kind: string | undefined) =>
  kind === "url" ? "Wikipedia URL" : kind === "text" ? "Pasted text" : (kind ?? "—");

function decisionSourceKind(rec: ImportRecord): string {
  return sourceLabel(rec.source?.kind);
}

function tally(values: string[]): CountRow[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function computeHeadline(recs: ImportRecord[]): Headline {
  const decs = recs.flatMap((r) => r.decisions ?? []);
  const kept = decs.filter((d) => d.kept);
  const edited = decs.filter((d) => d.edited && d.charsDelta != null);
  return {
    imports: recs.length,
    activitiesCreated: recs.reduce((s, r) => s + (r.outcome?.kept ?? 0), 0),
    approveWithoutEditN: kept.length,
    approveWithoutEditRate: rate(kept.filter(isCleanKeep).length, kept.length),
    editedCount: edited.length,
    medianEditChars: median(edited.map((d) => Math.abs(d.charsDelta as number))),
    refineActions: decs.reduce((s, d) => s + (d.refineAttempts ?? 0), 0),
    discards: recs.reduce((s, r) => s + (r.outcome?.discarded ?? 0), 0),
  };
}

/* --------------------------- computeMetrics --------------------------- */

export function computeMetrics(
  imports: ImportRecord[],
  events: ReviewEvent[],
): DashboardMetrics {
  const empty = imports.length === 0 && events.length === 0;
  const withDec = imports.map((r) => ({ ...r, decisions: r.decisions ?? [] }));
  const allDec = withDec.flatMap((r) =>
    r.decisions.map((d) => ({ rec: r, d })),
  );

  // gate.outcome
  const outcome: OutcomeBreakdown = {
    total: allDec.length,
    cleanKeep: 0,
    edited: 0,
    refined: 0,
    remixed: 0,
    discarded: 0,
  };
  for (const { d } of allDec) outcome[bucket(d)]++;

  // gate.byContentType
  const ctMap = new Map<string, ContentTypeRow>();
  for (const { d } of allDec) {
    const key = d.contentType || "(unknown)";
    let row = ctMap.get(key);
    if (!row) {
      row = {
        contentType: key,
        label: contentType(key)?.label ?? key,
        generated: 0,
        kept: 0,
        cleanApprove: 0,
        cleanApprovePct: null,
        refined: 0,
        remixed: 0,
        discarded: 0,
      };
      ctMap.set(key, row);
    }
    row.generated++;
    if (d.kept) row.kept++;
    if (isCleanKeep(d)) row.cleanApprove++;
    if ((d.refineAttempts ?? 0) > 0) row.refined++;
    if ((d.remixCount ?? 0) > 0) row.remixed++;
    if (d.discarded || !d.kept) row.discarded++;
  }
  const byContentType = [...ctMap.values()]
    .map((r) => ({ ...r, cleanApprovePct: rate(r.cleanApprove, r.generated) }))
    .sort((a, b) => b.generated - a.generated);

  // clean-approve rate grouped
  const groupRate = (
    keyOf: (r: ImportRecord) => string,
    labelOf: (k: string) => string,
  ): NamedRate[] => {
    const g = new Map<string, { clean: number; total: number }>();
    for (const { rec, d } of allDec) {
      if (!d.kept) continue;
      const k = keyOf(rec);
      const e = g.get(k) ?? { clean: 0, total: 0 };
      e.total++;
      if (isCleanKeep(d)) e.clean++;
      g.set(k, e);
    }
    return [...g.entries()]
      .map(([k, v]) => ({
        label: labelOf(k),
        clean: v.clean,
        total: v.total,
        rate: rate(v.clean, v.total),
      }))
      .sort((a, b) => b.total - a.total);
  };
  const bySourceKind = groupRate((r) => r.source?.kind ?? "?", sourceLabel);
  const byEngine = groupRate(
    (r) => r.engine ?? "?",
    (k) => (k === "?" ? "—" : k),
  );

  // feedback
  const refineSteers = tally(allDec.flatMap(({ d }) => d.refineSteers ?? []));
  const discardReasons = tally(
    allDec
      .filter(({ d }) => d.discarded)
      .map(({ d }) => d.discardReason || "(no reason given)"),
  );
  const attemptLoops: AttemptLoopRow[] = allDec
    .filter(({ d }) => (d.refineAttempts ?? 0) >= 3)
    .map(({ rec, d }) => ({
      importName: rec.name,
      contentType: contentType(d.contentType)?.label ?? d.contentType,
      sourceKind: decisionSourceKind(rec),
      refineAttempts: d.refineAttempts,
      steers: d.refineSteers ?? [],
    }))
    .sort((a, b) => b.refineAttempts - a.refineAttempts);

  // variant split
  const variantSplit: VariantSplit[] = (["wizard", "workspace"] as const)
    .map((v) => ({
      variant: v,
      recs: withDec.filter((r) => r.uiVariant === v),
    }))
    .filter((g) => g.recs.length > 0)
    .map((g) => ({ variant: g.variant, headline: computeHeadline(g.recs) }));

  // recent imports
  const recentImports: RecentImportRow[] = [...withDec]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 12)
    .map((r) => {
      const o = r.outcome ?? { generated: 0, kept: 0 };
      const parts: string[] = [];
      if (o.kept) parts.push(`${o.kept} kept`);
      if (o.edited) parts.push(`${o.edited} edited`);
      if (o.refined) parts.push(`${o.refined} refined`);
      if (o.remixed) parts.push(`${o.remixed} remixed`);
      if (o.discarded) parts.push(`${o.discarded} discarded`);
      return {
        id: r.id,
        name: r.name,
        savedAt:
          (r as ImportRecord & { savedAt?: string }).savedAt ??
          new Date(r.createdAt ?? 0).toISOString(),
        engine: r.engine ?? "—",
        model: r.model ?? null,
        sourceKind: decisionSourceKind(r),
        wordCount: r.source?.wordCount ?? null,
        generated: o.generated ?? 0,
        kept: o.kept ?? 0,
        summary: parts.join(" · ") || "—",
        uiVariant: (r.uiVariant as UiVariant) ?? null,
      };
    });

  // never finished — event importIds absent from .imports.jsonl
  const finished = new Set(imports.map((r) => r.id));
  const evByImport = new Map<string, ReviewEvent[]>();
  for (const e of events) {
    if (!evByImport.has(e.importId)) evByImport.set(e.importId, []);
    evByImport.get(e.importId)!.push(e);
  }
  const neverFinished: NeverFinishedRow[] = [...evByImport.entries()]
    .filter(([id]) => !finished.has(id) && UUID_RE.test(id))
    .map(([id, evs]) => {
      const sorted = [...evs].sort((a, b) => a.at.localeCompare(b.at));
      const last = sorted[sorted.length - 1];
      return {
        importId: id,
        events: evs.length,
        lastAction: isActionEvent(last) ? last.action : "summary",
        at: last.at,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  // sessions — only rows carrying sessionId
  const withSession = withDec.filter((r) => r.sessionId);
  const sessMap = new Map<string, ImportRecord[]>();
  for (const r of withSession) {
    const k = r.sessionId as string;
    if (!sessMap.has(k)) sessMap.set(k, []);
    sessMap.get(k)!.push(r);
  }
  const sessionEventAt = new Map<string, string[]>();
  for (const e of events) {
    if (!e.sessionId) continue;
    if (!sessionEventAt.has(e.sessionId)) sessionEventAt.set(e.sessionId, []);
    sessionEventAt.get(e.sessionId)!.push(e.at);
  }
  const sessions: SessionRow[] = [...sessMap.entries()]
    .map(([sid, recs]) => {
      const times = [
        ...recs.map((r) => new Date(r.createdAt ?? 0).toISOString()),
        ...(sessionEventAt.get(sid) ?? []),
      ]
        .filter(Boolean)
        .sort();
      const firstAt = times[0] ?? "";
      const lastAt = times[times.length - 1] ?? "";
      const span =
        firstAt && lastAt
          ? Math.round(
              (Date.parse(lastAt) - Date.parse(firstAt)) / 60000,
            )
          : 0;
      return {
        sessionId: sid,
        short: sid.slice(0, 8),
        imports: recs.length,
        activitiesCreated: recs.reduce(
          (s, r) => s + (r.outcome?.kept ?? 0),
          0,
        ),
        variants: [
          ...new Set(
            recs.map((r) => r.uiVariant).filter(Boolean) as UiVariant[],
          ),
        ],
        firstAt,
        lastAt,
        spanMinutes: span,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return {
    generatedAt: new Date().toISOString(),
    empty,
    fileState: {
      importsFound: imports.length > 0,
      eventsFound: events.length > 0,
      importCount: imports.length,
      eventCount: events.length,
    },
    headline: computeHeadline(withDec),
    variantSplit,
    gate: { outcome, byContentType, bySourceKind, byEngine },
    feedback: { refineSteers, discardReasons, attemptLoops },
    recentImports,
    neverFinished,
    sessions,
  };
}
