// Server-only. Rolls up .imports.jsonl + .review-events.jsonl into eval + feedback
// metrics for the /dashboard page. Pure functions + a thin fs reader; no React.

import { promises as fs } from "node:fs";
import type { ImportRecord, ImportItemDecision } from "./import-records";
import { contentType } from "./h5p/contentTypes";
import { importsLog as IMPORTS_LOG, eventsLog as EVENTS_LOG } from "./server-paths";

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
/** Fired when the educator leaves the flow before creating anything. */
export interface AbandonEvent {
  kind: "abandon";
  importId: string;
  /** Which stage they left from — the survey's first question is step-specific. */
  step: "configure" | "activities" | "review";
  /** The picked "what stopped you?" option, if any. */
  reason?: string;
  /** "Has this put you off?" — No | A bit | Yes. */
  putOff?: string;
  comment?: string;
  sessionId?: string;
  uiVariant?: UiVariant;
  at: string;
}
export type ReviewEvent = ReviewActionEvent | ReviewSummaryEvent | AbandonEvent;
export const isActionEvent = (e: ReviewEvent): e is ReviewActionEvent =>
  "action" in e;
export const isAbandonEvent = (e: ReviewEvent): e is AbandonEvent =>
  (e as AbandonEvent).kind === "abandon";

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

export interface ExperienceMetrics {
  /** How many finished imports carry a survey answer. */
  ratingN: number;
  ratingAvg: number | null;
  /** Counts by star, index 1..5 (index 0 unused). */
  ratingDist: number[];
  again: { likely: number; maybe: number; unlikely: number; unanswered: number };
  comments: Array<{
    text: string;
    rating: number;
    again: string | null;
    importName: string;
    at: string;
  }>;
  /** How many finished imports carry step timings. */
  timedN: number;
  medianBuildMs: number | null;
  medianReviewMs: number | null;
  medianTotalMs: number | null;
  /** Abandon survey — people who left the flow, grouped by the step they left from. */
  abandon: {
    total: number;
    byStep: Array<{
      step: "configure" | "activities" | "review";
      count: number;
      reasons: CountRow[];
      putOff: { no: number; abit: number; yes: number; unanswered: number };
      comments: Array<{ text: string; reason: string | null; at: string }>;
    }>;
  };
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
  experience: ExperienceMetrics;
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

const ABANDON_STEPS = ["configure", "activities", "review"] as const;

function computeAbandon(
  events: ReviewEvent[],
): ExperienceMetrics["abandon"] {
  const evs = events.filter(isAbandonEvent);
  const byStep = ABANDON_STEPS.map((step) => {
    const forStep = evs.filter((e) => e.step === step);
    const putOff = { no: 0, abit: 0, yes: 0, unanswered: 0 };
    for (const e of forStep) {
      const p = (e.putOff ?? "").toLowerCase();
      if (p === "no") putOff.no++;
      else if (p === "a bit") putOff.abit++;
      else if (p === "yes") putOff.yes++;
      else putOff.unanswered++;
    }
    return {
      step,
      count: forStep.length,
      reasons: tally(
        forStep.map((e) => e.reason).filter((r): r is string => !!r),
      ),
      putOff,
      comments: forStep
        .filter((e) => e.comment?.trim())
        .map((e) => ({
          text: e.comment!.trim(),
          reason: e.reason ?? null,
          at: e.at,
        }))
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  });
  return { total: evs.length, byStep };
}

function computeExperience(
  recs: ImportRecord[],
  events: ReviewEvent[],
): ExperienceMetrics {
  const rated = recs.filter((r) => r.feedback);
  const ratings = rated.map((r) => r.feedback!.rating).filter((n) => n > 0);
  const ratingDist = [0, 0, 0, 0, 0, 0];
  for (const n of ratings) if (n >= 1 && n <= 5) ratingDist[n]++;

  const again = { likely: 0, maybe: 0, unlikely: 0, unanswered: 0 };
  for (const r of rated) {
    const a = r.feedback!.again;
    if (a === "likely") again.likely++;
    else if (a === "maybe") again.maybe++;
    else if (a === "unlikely") again.unlikely++;
    else again.unanswered++;
  }

  const comments = rated
    .filter((r) => r.feedback!.comment.trim())
    .map((r) => ({
      text: r.feedback!.comment.trim(),
      rating: r.feedback!.rating,
      again: r.feedback!.again,
      importName: r.name,
      at: new Date(r.feedback!.submittedAt).toISOString(),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const builds = recs.map((r) => r.buildMs).filter((n): n is number => n != null);
  const reviews = recs
    .map((r) => r.reviewMs)
    .filter((n): n is number => n != null);
  const totals = recs
    .filter((r) => r.buildMs != null || r.reviewMs != null)
    .map((r) => (r.buildMs ?? 0) + (r.reviewMs ?? 0));

  return {
    ratingN: ratings.length,
    ratingAvg: ratings.length
      ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) /
        10
      : null,
    ratingDist,
    again,
    comments,
    timedN: totals.length,
    medianBuildMs: median(builds),
    medianReviewMs: median(reviews),
    medianTotalMs: median(totals),
    abandon: computeAbandon(events),
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
    experience: computeExperience(withDec, events),
    variantSplit,
    gate: { outcome, byContentType, bySourceKind, byEngine },
    feedback: { refineSteers, discardReasons, attemptLoops },
    recentImports,
    neverFinished,
    sessions,
  };
}
