"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_TYPES, CATEGORIES, contentType } from "@/lib/h5p/contentTypes";
import {
  INTENT_PRESETS,
  preset as findPreset,
  type IntentPreset,
} from "@/lib/intent-presets";
import { useTemplates, type SavedTemplate, type SavedBrief } from "@/lib/templates";
import {
  type ImportRecord,
  type ImportItemDecision,
  type ImportKeptItem,
  type ImportFeedback,
  fetchImports,
  saveImport,
  intentLabel,
} from "@/lib/import-records";
import type {
  BriefField,
  BriefFieldType,
  ImportIntent,
  TwinResult,
  SourceAnalysis,
  QuestionSignal,
} from "@/lib/types";
import { starterBrief, newBriefField, briefGoal, missingRequired } from "@/lib/brief";
import H5PRender from "@/components/H5PRender";

type Screen = "configure" | "activities" | "review" | "library";
type ShellNav = "my" | "smartimport" | "shared" | "all" | "trash";

// Mock pre-existing library content, to show new items land among everything else.
const MOCK_LIBRARY_ITEMS = [
  { title: "Cell structure — check", type: "Question Set", from: "Biology intro · 12 Aug", modified: "2 weeks ago" },
  { title: "Photosynthesis flashcards", type: "Dialog Cards", from: "built manually", modified: "3 weeks ago" },
  { title: "Ecosystem vocabulary", type: "Accordion", from: "Ecology import · 28 Jul", modified: "1 month ago" },
];
type SourceTab = "Pasted Text" | "Wikipedia";

type RenderedItem = TwinResult["items"][number] & {
  render: { librariesPath: string; h5pJsonPath: string; h5pJson: string };
  hostPrepared: boolean;
};
type ApiResult = Omit<TwinResult, "items"> & {
  items: RenderedItem[];
  model?: string | null;
};
interface Recommendation {
  name: string;
  recommended: boolean;
  reason: string;
  itemCount?: number;
}

/** Anonymous per-browser id — tags every review_event and ImportRecord for the dashboard. */
function getSessionId(): string {
  try {
    const k = "smartimport.sessionId.v1";
    let s = localStorage.getItem(k);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(k, s);
    }
    return s;
  } catch {
    return "no-storage";
  }
}

const DEFAULT_INTENT: ImportIntent = {
  authoringMode: "prompt",
  prompt: "",
  promptPresetId: null,
  emphasis: "balanced",
  volume: "standard",
  briefFields: starterBrief(),
  mode: "generate",
  contentTypes: [],
};

type ItemState =
  | "approved"
  | "editing"
  | "discarded"
  | "refining"
  | "remixing";

// Two demoable shapes of the whole flow. "wizard" = the current step-by-step
// modal; "workspace" = a full-screen 3-panel overlay. Picked via the A/B toggle.
type UiVariant = "wizard" | "workspace";
type ChatTurn = { role: "user" | "system"; text: string };

export default function Page() {
  const [screen, setScreen] = useState<Screen>("configure");
  const [sourceTab, setSourceTab] = useState<SourceTab>("Pasted Text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [wikiUrl, setWikiUrl] = useState("");
  const [intent, setIntent] = useState<ImportIntent>(DEFAULT_INTENT);

  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [analyzedKey, setAnalyzedKey] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<ApiResult | null>(null);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uiVariant, setUiVariant] = useState<UiVariant>("wizard");
  // per-activity refinement transcript, keyed by item id (workspace variant only)
  const [transcript, setTranscript] = useState<Record<string, ChatTurn[]>>({});

  // review-stage decision metadata that isn't otherwise kept in state:
  const [discardReason, setDiscardReason] = useState<Record<string, string>>({});
  const [refineSteers, setRefineSteers] = useState<Record<string, string[]>>({});
  const [remixFrom, setRemixFrom] = useState<Record<string, string>>({});

  // ---- the Manage Content shell — the app's home ----
  const [view, setView] = useState<"shell" | "flow">("shell");
  const [shellNav, setShellNav] = useState<ShellNav>("smartimport");
  const [allImports, setAllImports] = useState<ImportRecord[]>([]);
  const [siFilter, setSiFilter] = useState<string>(""); // "" all SI · "all"·id
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  // Set when the user asks to close the flow but has generated (unsaved) content.
  // Show the abandon survey once per session, when someone leaves after a real attempt.
  const [abandonSurvey, setAbandonSurvey] = useState(false);
  const [abandonAsked, setAbandonAsked] = useState(false);
  // Refining one already-created library item, outside the create flow —
  // the same Preview + Refine panels (Workspace B), without Setup/Activities.
  const [soloRefine, setSoloRefine] = useState<{
    recId: string;
    recName: string;
    itemId: string;
  } | null>(null);
  const [confirmSoloExit, setConfirmSoloExit] = useState(false);
  const [soloOpen, setSoloOpen] = useState<boolean[]>([true, true]);
  const [soloWorkTab, setSoloWorkTab] = useState<"chat" | "editor">("chat");
  // Wall-clock from starting the import to the generated set landing — i.e.
  // steps 1–2 (source + intent + choose activities + generate). Review/approve
  // time is deliberately excluded.
  const [flowStartedAt, setFlowStartedAt] = useState<number | null>(null);
  const [buildMs, setBuildMs] = useState<number | null>(null);
  // Timestamp the generated set landed — start of step 3 (review & approve).
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  useEffect(() => {
    fetchImports().then(setAllImports).catch(() => {});
  }, []);

  const activeSourceKey = `${sourceTab}::${sourceTab === "Wikipedia" ? wikiUrl : text}`;
  // Only ever show the read-back / recommendations computed for the source the
  // user is on right now. Switch tabs → it hides until it re-runs for that source.
  const analysisFresh = analyzedKey === activeSourceKey;
  const shownAnalysis = analysisFresh ? analysis : null;
  const shownRecs = analysisFresh ? recs : [];

  const recByName = useMemo(
    () => Object.fromEntries(shownRecs.map((r) => [r.name, r])),
    [shownRecs],
  );
  const source = () =>
    sourceTab === "Wikipedia"
      ? { kind: "url" as const, value: wikiUrl }
      : { kind: "text" as const, value: text };
  const MIN_SOURCE_CHARS = 120;
  const sourceReady =
    sourceTab === "Wikipedia"
      ? /^https?:\/\/\S+wikipedia\.org\/\S+/i.test(wikiUrl)
      : text.trim().length >= MIN_SOURCE_CHARS;

  /** Why "Choose activities" is disabled, in the user's terms (null = ready). */
  const sourceBlocker: string | null = sourceReady
    ? null
    : sourceTab === "Wikipedia"
      ? wikiUrl.trim()
        ? "That doesn't look like a Wikipedia article URL — it should start with https:// and point to wikipedia.org"
        : "Paste a Wikipedia article URL to continue"
      : text.trim().length === 0
        ? "Paste the source text you want to build activities from"
        : `Add a bit more source text — ${text.trim().length}/${MIN_SOURCE_CHARS} characters`;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function analyze() {
    if (!sourceReady) return;
    const key = activeSourceKey;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: source(), intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      setRecs(data.recommendations);
      setAnalyzedKey(key);
      const preChecked: string[] = (data.recommendations as Recommendation[])
        .filter((r) => r.recommended)
        .map((r) => r.name);
      setIntent((i) =>
        i.contentTypes.length
          ? i
          : {
              ...i,
              contentTypes: preChecked.length
                ? preChecked
                : ["H5P.SingleChoiceSet"],
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  // The read-back always reflects the CURRENTLY-selected source tab. Switching
  // tabs (or emptying the current one) drops the stale read-back; it re-runs,
  // debounced, once the active tab has a usable source. Whatever tab the user is
  // on when they hit "Choose activities" is the source that gets used.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (sourceReady) debounceRef.current = setTimeout(analyze, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceKey]);

  // A/B variant: ?ui= wins, else last choice from localStorage. One-shot sync on
  // mount from an external source — the setState here is intentional.
  useEffect(() => {
    let next: UiVariant | null = null;
    const q = new URLSearchParams(window.location.search).get("ui");
    if (q === "workspace" || q === "wizard") {
      next = q;
    } else {
      try {
        const s = localStorage.getItem("smartimport.uiVariant.v1");
        if (s === "workspace" || s === "wizard") next = s;
      } catch {
        /* storage unavailable */
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next && next !== "wizard") setUiVariant(next);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("smartimport.uiVariant.v1", uiVariant);
    } catch {
      /* storage unavailable */
    }
  }, [uiVariant]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const contentTypes = intent.contentTypes;
      const res = await fetch("/api/twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: source(), intent: { ...intent, contentTypes } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      setResult(data);
      setBuildMs(flowStartedAt ? Date.now() - flowStartedAt : null);
      setGeneratedAt(Date.now());
      setItemState(
        Object.fromEntries(
          data.items.map((i: RenderedItem) => [i.id, "approved" as ItemState]),
        ),
      );
      setSelected(data.items[0]?.id ?? null);
      setScreen("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  function setItem(id: string, s: ItemState) {
    setItemState((m) => ({ ...m, [id]: s }));
  }

  // One id per import session; carried on every review_event and the final record.
  // Fresh on "Start another import" (a plain useMemo would collide the 2nd import).
  const [importId, setImportId] = useState<string>(() => crypto.randomUUID());
  // Anonymous per-browser id — stable across imports, not reset in startAnother.
  const [sessionId] = useState<string>(() =>
    typeof window === "undefined" ? "" : getSessionId(),
  );
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [remixes, setRemixes] = useState<Record<string, number>>({});

  function logReviewEvent(ev: Record<string, unknown>) {
    const item = result?.items.find((i) => i.id === ev.itemId);
    fetch("/api/review-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        importId,
        sessionId,
        uiVariant,
        engine: result?.engine,
        sourceKind: sourceTab,
        readbackKind: shownAnalysis?.kind,
        sourceLength: shownAnalysis?.wordCount,
        intent: {
          mode: intent.mode,
          authoringMode: intent.authoringMode,
          preset: intent.promptPresetId ?? "scratch",
          emphasis: intent.emphasis,
          volume: intent.volume,
        },
        contentType: item?.contentType,
        ...ev,
      }),
    }).catch(() => {});
  }

  // Shared regenerate call for both Refine (same type, steered) and Remix (new type).
  // Returns the new item (or null) so the workspace chat can post an accurate turn.
  async function applyRegen(
    itemId: string,
    opts: {
      contentType: string;
      adjustment: string;
      attempt: number;
      busy: ItemState;
    },
  ): Promise<RenderedItem | null> {
    if (!result) return null;
    setItem(itemId, opts.busy);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: source(),
          intent,
          contentType: opts.contentType,
          adjustment: opts.adjustment,
          itemId,
          attempt: opts.attempt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult((r) =>
        r
          ? {
              ...r,
              items: r.items.map((i) => (i.id === itemId ? data.item : i)),
            }
          : r,
      );
      setEdits((e) => {
        const n = { ...e };
        delete n[itemId];
        return n;
      });
      setItem(itemId, "approved");
      return data.item as RenderedItem;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItem(itemId, "approved");
      return null;
    }
  }

  async function refineActivity(itemId: string, adjustment: string) {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return null;
    const attempt = (attempts[itemId] ?? 1) + 1;
    setAttempts((a) => ({ ...a, [itemId]: attempt }));
    setRefineSteers((s) => ({ ...s, [itemId]: [...(s[itemId] ?? []), adjustment] }));
    logReviewEvent({ action: "refine", itemId, reason: adjustment, attempt });
    return applyRegen(itemId, {
      contentType: item.contentType,
      adjustment,
      attempt,
      busy: "refining",
    });
  }

  async function remixActivity(itemId: string, toType: string) {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return null;
    const fromType = item.contentType;
    setRemixes((r) => ({ ...r, [itemId]: (r[itemId] ?? 0) + 1 }));
    setRemixFrom((m) => ({ ...m, [itemId]: m[itemId] ?? fromType }));
    logReviewEvent({ action: "remix", itemId, reason: fromType, toType });
    return applyRegen(itemId, {
      contentType: toType,
      adjustment: "remix:" + (item.concepts ?? []).join(", "),
      attempt: 1,
      busy: "remixing",
    });
  }

  function discardActivity(itemId: string, reason: string) {
    setItem(itemId, "discarded");
    setDiscardReason((m) => ({ ...m, [itemId]: reason }));
    logReviewEvent({ action: "discard", itemId, reason });
  }

  function finishCreate() {
    if (!result) return;
    // edit events: diff each edited item against its original
    for (const it of result.items) {
      if (itemState[it.id] === "discarded") continue;
      if (edits[it.id] && edits[it.id] !== it.contentJson) {
        logReviewEvent({
          action: "edit",
          itemId: it.id,
          charsDelta:
            JSON.stringify(edits[it.id]).length -
            JSON.stringify(it.contentJson).length,
        });
      }
    }
    const kept = result.items.filter((i) => itemState[i.id] !== "discarded");
    fetch("/api/review-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        importId,
        sessionId,
        uiVariant,
        summary: {
          generated: result.items.length,
          created: kept.length,
          edited: kept.filter((i) => edits[i.id] && edits[i.id] !== i.contentJson)
            .length,
          refined: Object.keys(attempts).length,
          remixed: Object.keys(remixes).length,
          discarded: result.items.length - kept.length,
        },
      }),
    }).catch(() => {});
    const stem =
      title.trim() ||
      (sourceTab === "Wikipedia"
        ? decodeURIComponent(wikiUrl.split("/wiki/")[1] ?? "").replace(/_/g, " ")
        : "") ||
      "Smart import";
    const label = `${stem} · ${new Date().toISOString().slice(0, 10)}`;

    const keptSet = new Set(kept.map((i) => i.id));
    const decisions: ImportItemDecision[] = result.items.map((it) => {
      const editedJson = !!edits[it.id] && edits[it.id] !== it.contentJson;
      return {
        itemId: it.id,
        contentType: it.contentType,
        kept: keptSet.has(it.id),
        edited: editedJson,
        charsDelta: editedJson
          ? JSON.stringify(edits[it.id]).length -
            JSON.stringify(it.contentJson).length
          : undefined,
        refineAttempts: attempts[it.id] ? attempts[it.id] - 1 : 0,
        refineSteers: refineSteers[it.id] ?? [],
        remixCount: remixes[it.id] ?? 0,
        remixFrom: remixFrom[it.id],
        discarded: !keptSet.has(it.id),
        discardReason: discardReason[it.id],
      };
    });
    const recordItems: ImportKeptItem[] = kept.map((i) => ({
      id: i.id,
      title: i.title,
      contentType: i.contentType,
      concepts: i.concepts,
      contentJson: edits[i.id] ?? i.contentJson,
      render: i.render,
      hostPrepared: i.hostPrepared,
    }));
    const record: ImportRecord = {
      id: importId,
      sessionId,
      uiVariant,
      name: label,
      createdAt: Date.now(),
      source: {
        kind: sourceTab === "Wikipedia" ? "url" : "text",
        value: sourceTab === "Wikipedia" ? wikiUrl : text,
        wordCount: shownAnalysis?.wordCount,
        readbackKind: shownAnalysis?.kind,
      },
      intent,
      promptPresetId: intent.promptPresetId,
      engine: result.engine,
      model: result.model ?? null,
      outcome: {
        generated: result.items.length,
        kept: kept.length,
        edited: kept.filter((i) => edits[i.id] && edits[i.id] !== i.contentJson)
          .length,
        refined: Object.keys(attempts).length,
        remixed: Object.keys(remixes).length,
        discarded: result.items.length - kept.length,
      },
      decisions,
      items: recordItems,
      buildMs: buildMs ?? undefined,
      reviewMs: generatedAt ? Date.now() - generatedAt : undefined,
    };
    saveImport(record);
    setAllImports((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
    // back to the shell, Smart Import view, filtered to this import
    setJustCreatedId(record.id);
    setSiFilter(record.id);
    setShellNav("smartimport");
    setView("shell");
  }

  function resetFlow() {
    setResult(null);
    setItemState({});
    setEdits({});
    setSelected(null);
    setAttempts({});
    setRemixes({});
    setDiscardReason({});
    setRefineSteers({});
    setRemixFrom({});
    setTranscript({});
    setImportId(crypto.randomUUID());
    setText("");
    setWikiUrl("");
    setTitle("");
    setIntent(DEFAULT_INTENT);
    setAnalysis(null);
    setAnalyzedKey("");
    setScreen("configure");
    setFlowStartedAt(null);
    setBuildMs(null);
    setGeneratedAt(null);
  }

  /** One click from the shell straight into Configure. */
  function startFlow() {
    resetFlow();
    setJustCreatedId(null);
    setFlowStartedAt(Date.now());
    setView("flow");
  }

  /** Leave the flow without creating anything. */
  function exitFlow() {
    setAbandonSurvey(false);
    resetFlow();
    setView("shell");
  }

  /** Which step the user is leaving from — drives the abandon survey's question. */
  function abandonStep(): "configure" | "activities" | "review" {
    if (result) return "review";
    if (uiVariant === "wizard" && screen === "activities") return "activities";
    return "configure";
  }

  /** Close from any stage. After a real attempt, ask why on the way out. */
  function requestExitFlow() {
    const engaged =
      !!result ||
      (flowStartedAt != null && Date.now() - flowStartedAt > 12000);
    if (engaged && !abandonAsked) setAbandonSurvey(true);
    else exitFlow();
  }

  /** Log the abandon feedback (or a plain "left" if skipped) and leave. */
  function finishAbandon(fb: {
    reason?: string;
    putOff?: string;
    comment?: string;
  }) {
    fetch("/api/review-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "abandon",
        importId,
        sessionId,
        uiVariant,
        step: abandonStep(),
        ...fb,
      }),
    }).catch(() => {});
    setAbandonAsked(true);
    exitFlow();
  }

  /** Open one already-created library item in the Preview + Refine panels —
   *  the same tools as before "Create", minus Setup/Choose activities. */
  function openRefine(rec: ImportRecord, itemId: string) {
    const it = rec.items.find((i) => i.id === itemId);
    if (!it) return;
    resetFlow();
    setImportId(rec.id);
    setSourceTab(rec.source.kind === "url" ? "Wikipedia" : "Pasted Text");
    setText(rec.source.kind === "text" ? rec.source.value : "");
    setWikiUrl(rec.source.kind === "url" ? rec.source.value : "");
    setIntent(rec.intent);
    const asRendered: RenderedItem = {
      id: it.id,
      contentType: it.contentType,
      title: it.title,
      concepts: it.concepts,
      rationale: "",
      contentJson: it.contentJson,
      mainLibrary: contentType(it.contentType)?.library ?? "",
      // ImportKeptItem's type omits h5pJson (kept out of the persisted-record
      // shape), but finishCreate still writes it through — recover it here so
      // Play mode works the same as it did on first generation.
      render: it.render as RenderedItem["render"],
      hostPrepared: it.hostPrepared,
    };
    setResult({
      sourceSummary: "",
      planNarrative: "",
      engine: rec.engine as TwinResult["engine"],
      model: rec.model,
      items: [asRendered],
    });
    setItemState({ [it.id]: "approved" });
    setSelected(it.id);
    setSoloOpen([true, true]);
    setSoloWorkTab("chat");
    setSoloRefine({ recId: rec.id, recName: rec.name, itemId: it.id });
  }

  function closeSoloRefine() {
    setConfirmSoloExit(false);
    setSoloRefine(null);
    resetFlow();
  }

  const soloDirty =
    !!soloRefine &&
    (!!edits[soloRefine.itemId] ||
      (attempts[soloRefine.itemId] ?? 0) > 0 ||
      (remixes[soloRefine.itemId] ?? 0) > 0 ||
      itemState[soloRefine.itemId] === "discarded");

  function requestCloseSoloRefine() {
    if (soloDirty) setConfirmSoloExit(true);
    else closeSoloRefine();
  }

  /** Write the refined/edited/discarded item back into its saved session. */
  function saveSoloRefine() {
    if (!soloRefine) return;
    const target = soloRefine;
    const it = result?.items.find((i) => i.id === target.itemId);
    if (!it) return;
    const discarded = itemState[target.itemId] === "discarded";
    const rec = allImports.find((r) => r.id === target.recId);
    if (!rec) return;

    const next: ImportRecord = discarded
      ? {
          ...rec,
          items: rec.items.filter((i) => i.id !== target.itemId),
          outcome: { ...rec.outcome, kept: Math.max(0, rec.outcome.kept - 1) },
        }
      : {
          ...rec,
          items: rec.items.map((i) =>
            i.id === it.id
              ? ({
                  id: it.id,
                  title: it.title,
                  contentType: it.contentType,
                  concepts: it.concepts,
                  contentJson: edits[it.id] ?? it.contentJson,
                  render: it.render,
                  hostPrepared: it.hostPrepared,
                } satisfies ImportKeptItem)
              : i,
          ),
        };

    saveImport(next);
    setAllImports((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    closeSoloRefine();
  }

  const keptIds = result
    ? result.items.filter((i) => itemState[i.id] !== "discarded").map((i) => i.id)
    : [];
  const current = result?.items.find((i) => i.id === selected) ?? null;

  const toggleType = (n: string) =>
    setIntent((i) => ({
      ...i,
      contentTypes: i.contentTypes.includes(n)
        ? i.contentTypes.filter((t) => t !== n)
        : [...i.contentTypes, n],
    }));


  if (soloRefine) {
    const cur = current;
    return (
      <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <div className="min-w-0">
            <span className="text-sm font-semibold">
              Refine · {cur ? contentType(cur.contentType)?.label : ""}
            </span>
            <span className="ml-2 truncate text-xs text-zinc-400">
              from {soloRefine.recName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={saveSoloRefine}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Save changes
            </button>
            <button
              onClick={requestCloseSoloRefine}
              aria-label="Close"
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span aria-hidden className="text-lg leading-none">
                &times;
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {confirmSoloExit && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            <span className="text-amber-800 dark:text-amber-200">
              Close without saving? Your changes to this activity won&rsquo;t be
              kept.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmSoloExit(false)}
                className={btnGhost}
              >
                Keep editing
              </button>
              <button
                onClick={closeSoloRefine}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanels
            storageKey="smartimport.refinePanels.v1"
            open={soloOpen}
            onOpenChange={setSoloOpen}
            panels={[
              {
                id: "preview",
                title: "Preview",
                node: (
                  <div className="h-full overflow-auto p-3">
                    {cur ? (
                      <ItemPanel
                        key={cur.id}
                        item={cur}
                        value={edits[cur.id] ?? cur.contentJson}
                        onChange={(v) =>
                          setEdits((e) => ({ ...e, [cur.id]: v }))
                        }
                        editing={false}
                        initialView="play"
                      />
                    ) : (
                      <p className="text-sm text-zinc-400">
                        This activity is no longer available.
                      </p>
                    )}
                  </div>
                ),
              },
              {
                id: "refine",
                title: "Work",
                node: !cur ? (
                  <div className="h-full p-4 text-xs text-zinc-400">
                    This activity is no longer available.
                  </div>
                ) : (
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="flex shrink-0 gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
                      {(["chat", "editor"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setSoloWorkTab(t);
                            setSoloOpen(t === "editor" ? [false, true] : [true, true]);
                          }}
                          className={`rounded border px-2 py-0.5 text-[11px] ${
                            soloWorkTab === t
                              ? "border-blue-600 font-medium"
                              : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
                          }`}
                        >
                          {t === "chat" ? "Chat" : "Editor"}
                        </button>
                      ))}
                      <span className="ml-1 self-center text-[10px] text-zinc-400">
                        {soloWorkTab === "chat"
                          ? "AI refine · remix · discard"
                          : "precise manual fixes"}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {soloWorkTab === "editor" ? (
                        <H5PEditorStub item={cur} />
                      ) : (
                        <RefineChat
                          key={cur.id}
                          item={cur}
                          state={itemState[cur.id]}
                          turns={transcript[cur.id] ?? []}
                          append={(turn) =>
                            setTranscript((tt) => ({
                              ...tt,
                              [cur.id]: [...(tt[cur.id] ?? []), turn],
                            }))
                          }
                          onRefine={refineActivity}
                          onRemix={remixActivity}
                          onDiscard={discardActivity}
                          onUndiscard={() => setItem(cur.id, "approved")}
                        />
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    );
  }

  if (view === "shell") {
    return (
      <Shell
        nav={shellNav}
        setNav={setShellNav}
        imports={allImports}
        setImports={setAllImports}
        siFilter={siFilter}
        setSiFilter={setSiFilter}
        justCreatedId={justCreatedId}
        clearJustCreated={() => setJustCreatedId(null)}
        onStartSmartImport={startFlow}
        onRefineItem={openRefine}
        uiVariant={uiVariant}
        setUiVariant={setUiVariant}
      />
    );
  }

  if (uiVariant === "workspace") {
    return (
      <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <div>
            <span className="text-sm font-semibold">Smart Import</span>
            <span className="ml-2 text-xs text-zinc-400">Workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <VariantToggle value={uiVariant} onChange={setUiVariant} />
            <button
              onClick={requestExitFlow}
              aria-label="Close Smart Import"
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span aria-hidden className="text-lg leading-none">
                &times;
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {abandonSurvey && (
          <AbandonSurvey
            step={abandonStep()}
            onLeave={finishAbandon}
            onStay={() => setAbandonSurvey(false)}
          />
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <Workspace
            sourceTab={sourceTab}
            setSourceTab={setSourceTab}
            title={title}
            setTitle={setTitle}
            text={text}
            setText={setText}
            wikiUrl={wikiUrl}
            setWikiUrl={setWikiUrl}
            intent={intent}
            setIntent={setIntent}
            analysis={shownAnalysis}
            analyzing={analyzing}
            recByName={recByName}
            toggleType={toggleType}
            generating={generating}
            generate={generate}
            result={result}
            itemState={itemState}
            setItem={setItem}
            edits={edits}
            setEdits={setEdits}
            selected={selected}
            setSelected={setSelected}
            current={current}
            attempts={attempts}
            remixes={remixes}
            transcript={transcript}
            setTranscript={setTranscript}
            onRefine={refineActivity}
            onRemix={remixActivity}
            onDiscard={discardActivity}
            onStartAnother={resetFlow}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <span
            className={`text-xs ${
              !result && sourceBlocker
                ? "text-amber-600 dark:text-amber-500"
                : "text-zinc-400"
            }`}
          >
            {result
              ? `${keptIds.length}/${result.items.length} kept · engine: ${result.engine}`
              : sourceBlocker
                ? sourceBlocker
                : analyzing
                  ? "analyzing source…"
                  : "add a source to begin"}
          </span>
          <div className="flex gap-2">
            <button onClick={requestExitFlow} className={btnGhost}>
              Cancel
            </button>
            {result ? (
              <button
                disabled={!keptIds.length}
                onClick={finishCreate}
                className={btnPrimary}
              >
                Create {keptIds.length}
              </button>
            ) : (
              <button
                onClick={() => generate()}
                disabled={
                  generating || !intent.contentTypes.length || !sourceReady
                }
                title={
                  sourceBlocker ??
                  (!intent.contentTypes.length
                    ? "Pick at least one activity type"
                    : undefined)
                }
                className={btnPrimary}
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold">Smart Import</h1>
            <div className="flex items-center gap-2">
              <VariantToggle value={uiVariant} onChange={setUiVariant} />
              <button
                onClick={requestExitFlow}
                aria-label="Close Smart Import"
                title="Close"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <span aria-hidden className="text-lg leading-none">
                  &times;
                </span>
              </button>
            </div>
          </div>
          <Stepper screen={screen} />
          <p className="mt-1 text-xs text-zinc-400">
            A reworked H5P.com Smart Import — working prototype of the redesigned
            educator workflow.
          </p>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {abandonSurvey && (
          <AbandonSurvey
            step={abandonStep()}
            onLeave={finishAbandon}
            onStay={() => setAbandonSurvey(false)}
          />
        )}

        <div className="px-6 py-6">
          {screen === "configure" && (
            <Configure
              {...{
                sourceTab,
                setSourceTab,
                title,
                setTitle,
                text,
                setText,
                wikiUrl,
                setWikiUrl,
                intent,
                setIntent,
                analysis: shownAnalysis,
                analyzing,
              }}
            />
          )}
          {screen === "activities" && (
            <Activities
              intent={intent}
              recByName={recByName}
              analysis={shownAnalysis}
              toggle={toggleType}
              locked={!!result}
            />
          )}
          {screen === "review" && result && (
            <Review
              result={result}
              itemState={itemState}
              setItem={setItem}
              edits={edits}
              setEdits={setEdits}
              selected={selected}
              setSelected={setSelected}
              current={current}
              attempts={attempts}
              remixes={remixes}
              onRefine={refineActivity}
              onRemix={remixActivity}
              onDiscard={discardActivity}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <span
            className={`text-xs ${
              screen === "configure" && sourceBlocker
                ? "text-amber-600 dark:text-amber-500"
                : "text-zinc-400"
            }`}
          >
            {screen === "review" && result
              ? `${keptIds.length}/${result.items.length} kept · engine: ${result.engine}`
              : screen === "configure" && sourceBlocker
                ? sourceBlocker
                : shownAnalysis
                  ? `${shownAnalysis.kind}, ${shownAnalysis.wordCount} words${
                      shownAnalysis.detectedQuestions > 3
                        ? ` · ${shownAnalysis.detectedQuestions} existing questions`
                        : ""
                    }`
                  : analyzing
                    ? "analyzing source…"
                    : "add a source to begin"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={
                screen === "configure"
                  ? requestExitFlow
                  : () =>
                      setScreen(
                        screen === "activities" ? "configure" : "activities",
                      )
              }
              className={btnGhost}
            >
              {screen === "configure" ? "Cancel" : "Back"}
            </button>
            {screen === "configure" && (
              <button
                onClick={() => setScreen("activities")}
                disabled={!sourceReady}
                title={sourceBlocker ?? undefined}
                className={btnPrimary}
              >
                Choose activities
              </button>
            )}
            {screen === "activities" && (
              <button
                onClick={() => generate()}
                disabled={generating || !intent.contentTypes.length}
                className={btnPrimary}
              >
                {generating ? "Generating…" : "Generate and review"}
              </button>
            )}
            {screen === "review" && (
              <button
                disabled={!keptIds.length}
                className={btnPrimary}
                onClick={finishCreate}
              >
                Create {keptIds.length}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const btnPrimary =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";
const btnGhost =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-zinc-700";

function VariantToggle(p: {
  value: UiVariant;
  onChange: (v: UiVariant) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
      {(
        [
          ["wizard", "A · Step-by-step"],
          ["workspace", "B · Workspace"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          onClick={() => p.onChange(v)}
          title={label}
          className={`rounded px-2 py-0.5 ${
            p.value === v
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-500"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ screen }: { screen: Screen }) {
  const steps: [Screen, string][] = [
    ["configure", "Configure Content"],
    ["activities", "Select Activities"],
    ["review", "Review & Approve"],
  ];
  // "library" is post-flow — show every step complete.
  const idx =
    screen === "library" ? steps.length : steps.findIndex(([s]) => s === screen);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {steps.map(([s, label], i) => (
        <span key={s} className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              i <= idx
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </span>
          <span className={i === idx ? "font-medium" : "text-zinc-400"}>{label}</span>
          {i < steps.length - 1 && <span className="text-zinc-300">———</span>}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Screen 1 ---------------- */

function Configure(p: {
  sourceTab: SourceTab;
  setSourceTab: (s: SourceTab) => void;
  title: string;
  setTitle: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  wikiUrl: string;
  setWikiUrl: (s: string) => void;
  intent: ImportIntent;
  setIntent: (f: (i: ImportIntent) => ImportIntent) => void;
  analysis: SourceAnalysis | null;
  analyzing: boolean;
}) {
  const set = (patch: Partial<ImportIntent>) =>
    p.setIntent((i) => ({ ...i, ...patch }));
  const promptMode = p.intent.authoringMode === "prompt";
  const isScratch = p.intent.promptPresetId === null;
  const canImprove = promptMode && isScratch && p.intent.prompt.trim().length > 0;
  const lib = useTemplates();
  const promptTemplates = lib.templates
    .filter((t) => t.kind === "prompt")
    .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0));
  const briefTemplates = lib.templates
    .filter((t) => t.kind === "brief")
    .sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0));
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [briefLoadedId, setBriefLoadedId] = useState<string | null>(null);
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefSaveName, setBriefSaveName] = useState("");
  const [briefDesign, setBriefDesign] = useState(false); // brief in edit-the-form mode
  const lastId = lib.lastUsedId;
  const [improving, setImproving] = useState(false);
  const [preImprove, setPreImprove] = useState<string | null>(null);

  async function improve() {
    const before = p.intent.prompt;
    if (!before.trim()) return;
    setImproving(true);
    try {
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: before }),
      });
      const data = await res.json();
      if (data.improved && data.improved.trim() !== before.trim()) {
        setPreImprove(before);
        set({ prompt: data.improved });
      }
    } catch {
      /* leave the prompt as-is */
    } finally {
      setImproving(false);
    }
  }
  const recentTemplate =
    promptTemplates.find((t) => t.id === lastId) ?? promptTemplates[0] ?? null;

  const bundleTypes =
    p.intent.contentTypes.length > 0 ? p.intent.contentTypes : undefined;

  function loadTemplate(t: SavedTemplate) {
    set({
      authoringMode: "prompt",
      promptPresetId: null,
      prompt: t.prompt ?? "",
      mode: t.mode ?? "generate",
      ...(t.contentTypes?.length ? { contentTypes: t.contentTypes } : {}),
    });
    setLoadedId(t.id);
    lib.markUsed(t.id);
  }

  function commitSave() {
    const name = saveName.trim();
    if (!name) return;
    lib.savePrompt(name, p.intent.prompt, p.intent.mode, bundleTypes);
    setSaving(false);
    setSaveName("");
  }

  const loaded = lib.templates.find((t) => t.id === loadedId);
  const loadedPromptEdited =
    loaded?.kind === "prompt" && loaded.prompt !== p.intent.prompt;

  /* ---- guided brief: a form the educator can reshape and save by name ---- */
  const fields = p.intent.briefFields ?? [];
  const setFields = (next: BriefField[]) => set({ briefFields: next });
  const patchField = (id: string, patch: Partial<BriefField>) =>
    setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const addField = () => setFields([...fields, newBriefField()]);
  const removeField = (id: string) => setFields(fields.filter((f) => f.id !== id));
  const moveField = (id: string, dir: -1 | 1) => {
    const i = fields.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  const applyRecommendedBrief = () => {
    setBriefLoadedId(null);
    setBriefDesign(false);
    set({ emphasis: "balanced", volume: "standard", briefFields: starterBrief() });
  };
  const currentBrief = (): SavedBrief => ({
    fields: fields.map((f) => ({ ...f })),
    emphasis: p.intent.emphasis,
    volume: p.intent.volume,
  });
  function loadBrief(t: SavedTemplate) {
    const b = t.brief;
    if (!b) return;
    setBriefDesign(false);
    set({
      authoringMode: "brief",
      emphasis: b.emphasis,
      volume: b.volume,
      briefFields: b.fields.map((f) => ({ ...f })),
      ...(t.contentTypes?.length ? { contentTypes: t.contentTypes } : {}),
    });
    setBriefLoadedId(t.id);
    lib.markUsed(t.id);
  }
  function commitBriefSave() {
    const name = briefSaveName.trim();
    if (!name) return;
    // save the field shapes without the current fill-in values
    const shape: SavedBrief = {
      ...currentBrief(),
      fields: currentBrief().fields.map((f) =>
        f.id === "language" ? f : { ...f, value: "" },
      ),
    };
    const id = lib.saveBrief(name, shape, bundleTypes);
    setBriefLoadedId(id);
    setBriefDesign(false);
    setSavingBrief(false);
    setBriefSaveName("");
  }
  const briefLoaded = lib.templates.find((t) => t.id === briefLoadedId);
  const briefShape = (b: SavedBrief) => ({
    emphasis: b.emphasis,
    volume: b.volume,
    fields: b.fields.map((f) => ({
      label: f.label, type: f.type, options: f.options, required: f.required,
    })),
  });
  const briefEdited =
    briefLoaded?.kind === "brief" && !!briefLoaded.brief &&
    JSON.stringify(briefShape(briefLoaded.brief)) !==
      JSON.stringify(briefShape(currentBrief()));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Source material</p>
        <div className="mb-3 flex gap-1 text-xs">
          {(["Pasted Text", "Wikipedia"] as SourceTab[]).map((t) => (
            <button
              key={t}
              onClick={() => p.setSourceTab(t)}
              className={`rounded-t-md border-b-2 px-3 py-1.5 ${
                p.sourceTab === t
                  ? "border-blue-600 font-medium"
                  : "border-transparent text-zinc-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {p.sourceTab === "Pasted Text" ? (
          <>
            <input
              value={p.title}
              onChange={(e) => p.setTitle(e.target.value)}
              placeholder="Descriptive title…"
              className="mb-2 w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <textarea
              value={p.text}
              onChange={(e) => p.setText(e.target.value)}
              rows={7}
              placeholder="Paste source text here…"
              className="w-full rounded-md border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </>
        ) : (
          <input
            value={p.wikiUrl}
            onChange={(e) => p.setWikiUrl(e.target.value)}
            placeholder="https://en.wikipedia.org/wiki/Plate_tectonics"
            className="w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Intent</p>
            <span className="text-xs text-zinc-400">
              — choose one way to say what you want
            </span>
          </div>
          <LibraryPicker
            templates={promptTemplates}
            loadedId={loadedId}
            lastId={lastId}
            onLoadTemplate={loadTemplate}
            onLoadPreset={(preset) => {
              setLoadedId(null);
              set({
                authoringMode: "prompt",
                promptPresetId: preset.id,
                prompt: preset.prompt,
                mode: preset.mode,
              });
            }}
          />
        </div>

        {/* mutually exclusive mode toggle */}
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
          {(
            [
              ["prompt", "Write a prompt"],
              ["brief", "Guided brief"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => set({ authoringMode: m })}
              className={`rounded px-3 py-1 ${
                p.intent.authoringMode === m
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {promptMode ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400">Start from:</span>
              <button
                onClick={() => {
                  setLoadedId(null);
                  set({ promptPresetId: null, prompt: "", mode: "generate" });
                }}
                className={`rounded-md border px-2 py-1 ${
                  isScratch && !loaded
                    ? "border-blue-600 font-medium"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                Scratch
              </button>
              {INTENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setLoadedId(null);
                    set({
                      promptPresetId: preset.id,
                      prompt: preset.prompt,
                      mode: preset.mode,
                    });
                  }}
                  className={`rounded-md border px-2 py-1 ${
                    p.intent.promptPresetId === preset.id
                      ? "border-blue-600 font-medium"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {recentTemplate && (
                <button
                  onClick={() => loadTemplate(recentTemplate)}
                  className={`rounded-md border px-2 py-1 ${
                    loadedId === recentTemplate.id
                      ? "border-blue-600 font-medium"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                  title="Your most recently used template"
                >
                  ★ {recentTemplate.name}
                  <span className="ml-1 text-[10px] text-zinc-400">· recent</span>
                </button>
              )}
              {promptTemplates.length > (recentTemplate ? 1 : 0) && (
                <span className="text-zinc-400">
                  + {promptTemplates.length - (recentTemplate ? 1 : 0)} more in 📚
                  library
                </span>
              )}
            </div>

            {isScratch ? (
              <>
                <textarea
                  value={p.intent.prompt}
                  onChange={(e) => set({ prompt: e.target.value, mode: "generate" })}
                  rows={3}
                  placeholder="e.g. Assessment for first-year undergrads. Focus on the three boundary types and the evidence. Plain language."
                  className="w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {canImprove && (
                    <button
                      onClick={improve}
                      disabled={improving}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {improving ? "Improving…" : "✨ Improve this prompt"}
                    </button>
                  )}
                  {preImprove !== null && !improving && (
                    <button
                      onClick={() => {
                        set({ prompt: preImprove });
                        setPreImprove(null);
                      }}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-400 dark:border-zinc-700"
                    >
                      ↩ revert
                    </button>
                  )}
                  {loadedPromptEdited && loaded && (
                    <button
                      onClick={() =>
                        lib.update(loaded.id, {
                          prompt: p.intent.prompt,
                          mode: p.intent.mode,
                          contentTypes: bundleTypes,
                        })
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Update “{loaded.name}”
                    </button>
                  )}
                  {p.intent.prompt.trim().length > 0 &&
                    (saving ? (
                      <SaveRow
                        value={saveName}
                        onChange={setSaveName}
                        onSave={commitSave}
                        onCancel={() => setSaving(false)}
                      />
                    ) : (
                      <button
                        onClick={() => setSaving(true)}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        + Save {bundleTypes ? "prompt + activities" : "as template"}
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <p className="mb-1 font-medium text-zinc-400">
                  {findPreset(p.intent.promptPresetId!)?.label} — pre-designed prompt,
                  used as-is
                </p>
                {p.intent.prompt}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400">Start from:</span>
              <button
                onClick={applyRecommendedBrief}
                className={`rounded-md border px-2 py-1 ${
                  briefLoadedId === null
                    ? "border-blue-600 font-medium"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                Recommended
              </button>
              {briefTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadBrief(t)}
                  className={`rounded-md border px-2 py-1 ${
                    briefLoadedId === t.id
                      ? "border-blue-600 font-medium"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  ★ {t.name}
                </button>
              ))}
              <button
                onClick={() => setBriefDesign((v) => !v)}
                className={`ml-auto rounded-md border px-2 py-1 ${
                  briefDesign
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {briefDesign ? "Done — back to filling in" : "Customise this brief"}
              </button>
            </div>

            {briefDesign && (
              <p className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-[11px] text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                Editing the form. Rename a field, switch its control, set the values a
                dropdown allows, mark it required, add or reorder fields — then save it
                under a name.
              </p>
            )}

            {/* fixed rows — feed the activity recommendations */}
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              <BriefRow label="Emphasis">
                <select
                  value={p.intent.emphasis}
                  onChange={(e) =>
                    set({ emphasis: e.target.value as ImportIntent["emphasis"] })
                  }
                  className={briefControl}
                >
                  <option value="balanced">Balanced</option>
                  <option value="assessment">Assessment-heavy</option>
                  <option value="concept_explanation">Concept explanation</option>
                </select>
              </BriefRow>
              <BriefRow label="Volume">
                <select
                  value={p.intent.volume}
                  onChange={(e) =>
                    set({ volume: e.target.value as ImportIntent["volume"] })
                  }
                  className={briefControl}
                >
                  <option value="light">Light (~4 questions)</option>
                  <option value="standard">Standard (~6)</option>
                  <option value="thorough">Thorough (~10)</option>
                </select>
              </BriefRow>
              <p className="px-3 py-1.5 text-[10px] text-zinc-400">
                Emphasis and Volume are built in — they feed the activity
                recommendations. Everything below is yours to design.
              </p>
            </div>

            {/* the designed fields */}
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {fields.map((f, i) =>
                briefDesign ? (
                  <BriefFieldEditor
                    key={f.id}
                    field={f}
                    first={i === 0}
                    last={i === fields.length - 1}
                    onPatch={(patch) => patchField(f.id, patch)}
                    onMove={(dir) => moveField(f.id, dir)}
                    onRemove={() => removeField(f.id)}
                  />
                ) : (
                  <BriefRow
                    key={f.id}
                    label={(f.label || "Untitled") + (f.required ? " *" : "")}
                  >
                    {f.type === "select" ? (
                      <select
                        value={f.value}
                        onChange={(e) => patchField(f.id, { value: e.target.value })}
                        className={briefControl}
                      >
                        <option value="">Choose…</option>
                        {f.options
                          .filter((o) => o.trim())
                          .map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={f.value}
                        onChange={(e) => patchField(f.id, { value: e.target.value })}
                        className={briefControl}
                        placeholder={
                          f.id === "goal"
                            ? "e.g. Distinguish the three plate-boundary types"
                            : "value the AI should follow"
                        }
                      />
                    )}
                  </BriefRow>
                ),
              )}

              {fields.length === 0 && !briefDesign && (
                <p className="px-3 py-3 text-xs text-zinc-400">
                  This brief has no fields.{" "}
                  <button
                    onClick={() => setBriefDesign(true)}
                    className="underline"
                  >
                    Customise it
                  </button>{" "}
                  to add some.
                </p>
              )}

              {briefDesign && (
                <button
                  onClick={addField}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                >
                  + Add field
                </button>
              )}
            </div>

            {!briefDesign && missingRequired(p.intent).length > 0 && (
              <p className="text-[11px] text-amber-600">
                Still needs: {missingRequired(p.intent).join(", ")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {savingBrief ? (
                <>
                  <span className="text-zinc-400">Name this brief:</span>
                  <SaveRow
                    value={briefSaveName}
                    onChange={setBriefSaveName}
                    onSave={commitBriefSave}
                    onCancel={() => setSavingBrief(false)}
                  />
                </>
              ) : (
                <>
                  {briefLoaded && briefEdited && (
                    <button
                      onClick={() =>
                        lib.update(briefLoaded.id, {
                          brief: {
                            ...currentBrief(),
                            fields: currentBrief().fields.map((f) =>
                              f.id === "language" ? f : { ...f, value: "" },
                            ),
                          },
                          contentTypes: bundleTypes,
                        })
                      }
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Update “{briefLoaded.name}”
                    </button>
                  )}
                  <button
                    onClick={() => setSavingBrief(true)}
                    className="rounded-md border border-blue-600 px-2.5 py-1 font-medium text-blue-700 dark:text-blue-300"
                  >
                    {briefLoaded && briefEdited
                      ? "Save as a new brief"
                      : "Save this brief"}
                  </button>
                  {briefLoaded && !briefEdited && (
                    <span className="text-zinc-400">
                      Using saved brief “{briefLoaded.name}”
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {lib.templates.length > 0 && (
          <TemplateManager lib={lib} />
        )}
      </div>

      {(p.analyzing || p.analysis) && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {p.analyzing && !p.analysis ? (
            <p className="text-zinc-500">
              Reading the source… <span className="text-zinc-400">(you can keep going —
              this is just a heads-up on the material)</span>
            </p>
          ) : p.analysis ? (
            <>
              <p className="text-xs font-medium text-zinc-400">
                Source read-back — what to expect from this material. Advisory only;
                using it is your call.
              </p>
              <p className="mt-1">
                {cap(p.analysis.kind)} material, {p.analysis.wordCount} words
                {p.analysis.readingLevel && p.analysis.readingLevel !== "not assessed"
                  ? `, ${p.analysis.readingLevel} level`
                  : ""}
                . Covers: {p.analysis.themes.join(", ") || p.analysis.concepts.join(", ")}.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {p.analysis.strengths.length > 0 && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">
                      Strengths
                    </p>
                    <ul className="mt-0.5 list-disc pl-4 text-zinc-600 dark:text-zinc-300">
                      {p.analysis.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.analysis.watchOuts.length > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                      Watch-outs
                    </p>
                    <ul className="mt-0.5 list-disc pl-4 text-zinc-600 dark:text-zinc-300">
                      {p.analysis.watchOuts.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {p.analysis.detectedQuestions > 3 && (
                <div className="mt-2 rounded border border-zinc-300 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                  This source contains ~{p.analysis.detectedQuestions} existing
                  questions.{" "}
                  <button
                    onClick={() => {
                      const ex = findPreset("extract-questions")!;
                      set(
                        promptMode
                          ? {
                              mode: "extract",
                              prompt: ex.prompt,
                              promptPresetId: ex.id,
                            }
                          : { mode: "extract" },
                      );
                    }}
                    className={`underline ${p.intent.mode === "extract" ? "font-semibold" : ""}`}
                  >
                    Extract them as-is
                  </button>{" "}
                  ·{" "}
                  <button
                    onClick={() => set({ mode: "generate" })}
                    className={`underline ${p.intent.mode === "generate" ? "font-semibold" : ""}`}
                  >
                    Generate new
                  </button>
                </div>
              )}
              <p className="mt-1 text-[10px] text-zinc-400">
                {p.analysis.engine === "model"
                  ? "read-back by model"
                  : "read-back is heuristic (no model key) — concepts are frequency-based"}
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

const briefControl =
  "min-w-0 flex-1 rounded border border-zinc-300 p-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
function BriefRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-28 shrink-0 text-xs text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

/** Design-mode editor for one brief field: label · control type · dropdown values · required. */
function BriefFieldEditor(p: {
  field: BriefField;
  first: boolean;
  last: boolean;
  onPatch: (patch: Partial<BriefField>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { field: f } = p;
  const setOptions = (opts: string[]) => p.onPatch({ options: opts });
  const iconBtn =
    "shrink-0 rounded border border-zinc-300 px-1 text-xs leading-none text-zinc-400 hover:border-blue-500 hover:text-blue-600 disabled:opacity-30 dark:border-zinc-700";

  return (
    <div className="space-y-2 bg-zinc-50/60 px-3 py-2.5 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={f.label}
          placeholder="Field name"
          onChange={(e) => p.onPatch({ label: e.target.value })}
          className="min-w-0 flex-1 rounded border border-zinc-300 p-1 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="inline-flex overflow-hidden rounded border border-zinc-300 text-[11px] dark:border-zinc-700">
          {(["select", "text", "number"] as BriefFieldType[]).map((t) => (
            <button
              key={t}
              onClick={() => p.onPatch({ type: t })}
              className={`px-1.5 py-0.5 ${
                f.type === t
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {t === "select" ? "Dropdown" : t === "text" ? "Text" : "Number"}
            </button>
          ))}
        </div>
        <button
          onClick={() => p.onMove(-1)}
          disabled={p.first}
          title="Move up"
          aria-label="Move field up"
          className={iconBtn}
        >
          ▲
        </button>
        <button
          onClick={() => p.onMove(1)}
          disabled={p.last}
          title="Move down"
          aria-label="Move field down"
          className={iconBtn}
        >
          ▼
        </button>
        <button
          onClick={p.onRemove}
          title="Remove field"
          aria-label="Remove field"
          className="shrink-0 rounded px-1 text-zinc-400 hover:bg-zinc-200 hover:text-red-500 dark:hover:bg-zinc-800"
        >
          ×
        </button>
      </div>

      {f.type === "select" && (
        <div className="space-y-1 pl-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-400">
            Allowed values
          </p>
          {f.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-1">
              <input
                value={opt}
                placeholder="an option"
                onChange={(e) =>
                  setOptions(
                    f.options.map((o, j) => (j === oi ? e.target.value : o)),
                  )
                }
                className="min-w-0 flex-1 rounded border border-zinc-300 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                onClick={() => setOptions(f.options.filter((_, j) => j !== oi))}
                title="Remove value"
                aria-label="Remove value"
                className="shrink-0 rounded px-1 text-zinc-400 hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setOptions([...f.options, ""])}
            className="text-[11px] font-medium text-blue-600"
          >
            + value
          </button>
        </div>
      )}

      <label className="flex w-fit items-center gap-1.5 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={f.required}
          onChange={(e) => p.onPatch({ required: e.target.checked })}
        />
        Required
      </label>
    </div>
  );
}

function SaveRow(p: {
  value: string;
  onChange: (s: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") p.onSave();
          if (e.key === "Escape") p.onCancel();
        }}
        placeholder="Template name…"
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        onClick={p.onSave}
        className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
      >
        Save
      </button>
      <button onClick={p.onCancel} className="px-1 text-xs text-zinc-400">
        cancel
      </button>
    </span>
  );
}

function LibraryPicker(p: {
  templates: SavedTemplate[];
  loadedId: string | null;
  lastId: string | null;
  onLoadTemplate: (t: SavedTemplate) => void;
  onLoadPreset: (preset: IntentPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const mine = [...p.templates]
    .sort((a, b) => (b.usedAt ?? b.createdAt) - (a.usedAt ?? a.createdAt))
    .filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
      >
        📚 Template library{p.templates.length ? ` (${p.templates.length})` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 flex max-h-96 w-80 flex-col rounded-md border border-zinc-200 bg-white text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates…"
              className="m-2 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="overflow-auto p-2 pt-0">
            <p className="px-1 py-1 font-semibold text-zinc-400">Your templates</p>
            {mine.length === 0 && (
              <p className="px-1 pb-2 text-zinc-400">
                {p.templates.length === 0
                  ? "None yet. Save a prompt or brief below to reuse it next time."
                  : "No match."}
              </p>
            )}
            {mine.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  p.onLoadTemplate(t);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  p.loadedId === t.id ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                <span className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-500 dark:bg-zinc-800">
                  {t.kind}
                </span>
                <span className="flex-1 truncate">★ {t.name}</span>
                {t.id === p.lastId && (
                  <span className="text-[10px] text-zinc-400">recent</span>
                )}
                {t.contentTypes?.length ? (
                  <span className="text-[10px] text-zinc-400">
                    +{t.contentTypes.length}
                  </span>
                ) : null}
              </button>
            ))}
            <p className="mt-2 px-1 py-1 font-semibold text-zinc-400">
              Starter templates
            </p>
            {INTENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  p.onLoadPreset(preset);
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {preset.label}
              </button>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TemplateManager({ lib }: { lib: ReturnType<typeof useTemplates> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="text-zinc-400 underline"
      >
        {open ? "Hide" : "Your templates"} ({lib.templates.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {lib.templates.map((t: SavedTemplate) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-800"
            >
              <span className="rounded bg-zinc-100 px-1 text-[10px] text-zinc-500 dark:bg-zinc-800">
                {t.kind}
              </span>
              {editing === t.id ? (
                <>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded border border-zinc-300 px-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    onClick={() => {
                      lib.rename(t.id, name.trim() || t.name);
                      setEditing(null);
                    }}
                    className="text-blue-600"
                  >
                    save
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">★ {t.name}</span>
                  <button
                    onClick={() => {
                      setEditing(t.id);
                      setName(t.name);
                    }}
                    className="text-zinc-400"
                  >
                    rename
                  </button>
                  <button
                    onClick={() => lib.remove(t.id)}
                    className="text-red-500"
                  >
                    delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
/* ---------------- Screen 2 ---------------- */

const kindVerb = (k: SourceAnalysis["kind"]) =>
  k === "conceptual"
    ? "explains ideas"
    : k === "procedural"
      ? "describes a process"
      : k === "reference"
        ? "is reference / list-like"
        : k === "narrative"
          ? "reads as a narrative"
          : "mixes explanation and fact";

function Activities(p: {
  intent: ImportIntent;
  recByName: Record<string, Recommendation>;
  analysis: SourceAnalysis | null;
  toggle: (n: string) => void;
  /** After generate — the activity set is fixed; refine/remix happen in review. */
  locked?: boolean;
}) {
  const a = p.analysis;
  const recs = Object.values(p.recByName).filter((r) => r.recommended);
  const recLabels = recs
    .map((r) => contentType(r.name)?.label)
    .filter(Boolean)
    .join(" + ");
  const intentBit =
    p.intent.authoringMode === "brief"
      ? `brief — ${briefGoal(p.intent) || "no goal set"}, ${p.intent.emphasis} emphasis`
      : p.intent.prompt.trim()
        ? `“${p.intent.prompt.trim().slice(0, 90)}${p.intent.prompt.trim().length > 90 ? "…" : ""}”`
        : `${p.intent.emphasis} emphasis, ${p.intent.volume} volume`;
  const countWhy =
    recs.length <= 1
      ? "one activity — the source is compact, or the intent is a quick check"
      : recs.length >= 3
        ? "three — the source is long and multi-theme and the intent asks for breadth"
        : "two — one to check recall, one to check understanding, with minimal overlap";

  const chosenRecs = recs.filter((r) =>
    p.intent.contentTypes.includes(r.name),
  );

  return (
    <div className="space-y-3">
      {a ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium text-zinc-500">Why these activities</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">
            Source {kindVerb(a.kind)} — ~{a.wordCount} words, {a.concepts.length}{" "}
            key {a.kind === "reference" ? "terms" : "concepts"}
            {a.themes.length > 1 ? `, ${a.themes.length} themes` : ""}. Intent:{" "}
            {intentBit}. → <b>{recLabels || "a recall check"}</b>, {countWhy}.
          </p>
          {chosenRecs.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {chosenRecs.map((r) => (
                <li key={r.name}>
                  <b className="text-zinc-600 dark:text-zinc-300">
                    {contentType(r.name)?.label}
                  </b>{" "}
                  — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Recommended activities are pre-checked from your source and intent.
        </p>
      )}

      <div className="space-y-2">
        {CATEGORIES.map((cat) => {
          const items = CONTENT_TYPES.filter((c) => c.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {cat}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((ct) => {
                  const rec = p.recByName[ct.name];
                  const checked = p.intent.contentTypes.includes(ct.name);
                  const tip = [ct.blurb, rec?.reason]
                    .filter(Boolean)
                    .join(" — ");
                  const tone = checked
                    ? "border-blue-600 bg-blue-600 text-white"
                    : rec?.recommended
                      ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300";
                  const faded = ct.twin !== "full" ? "opacity-60" : "";

                  return (
                    <button
                      key={ct.name}
                      onClick={p.locked ? undefined : () => p.toggle(ct.name)}
                      disabled={p.locked}
                      title={
                        p.locked
                          ? "Locked after generating — refine or remix in review"
                          : tip
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${tone} ${faded} ${
                        p.locked ? "cursor-default" : ""
                      }`}
                    >
                      {rec?.recommended && <span aria-hidden>★ </span>}
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {p.locked ? (
        <p className="text-[10px] text-amber-600">
          The activity set is locked after generating. Use Refine / Remix in
          review, or Start again to change it.
        </p>
      ) : (
        <p className="text-[10px] text-zinc-400">
          Filled = in your set · ★ = recommended · faded = no live preview yet
        </p>
      )}
    </div>
  );
}

/* ---------------- Screen 3 ---------------- */

const REFINE_OPTIONS: { id: string; label: string }[] = [
  { id: "harder", label: "Harder" },
  { id: "easier", label: "Easier" },
  { id: "simpler", label: "Simpler language" },
  { id: "formal", label: "More formal" },
  { id: "less-repetitive", label: "Less repetitive" },
  { id: "clearer", label: "Clearer wording" },
  { id: "different-focus", label: "Different focus" },
  { id: "retry", label: "Just try again" },
];
const DISCARD_REASONS = [
  "wrong activity type",
  "quality too low",
  "redundant with another",
  "source doesn't support it",
  "not useful",
];
// Remix rebuilds the activity as a different type — only types the twin can render.
const REMIX_TARGETS = CONTENT_TYPES.filter((c) => c.twin === "full");

function Review(p: {
  result: ApiResult;
  itemState: Record<string, ItemState>;
  setItem: (id: string, s: ItemState) => void;
  edits: Record<string, unknown>;
  setEdits: (f: (e: Record<string, unknown>) => Record<string, unknown>) => void;
  selected: string | null;
  setSelected: (id: string) => void;
  current: RenderedItem | null;
  attempts: Record<string, number>;
  remixes: Record<string, number>;
  onRefine: (itemId: string, adjustment: string) => void;
  onRemix: (itemId: string, toType: string) => void;
  onDiscard: (itemId: string, reason: string) => void;
}) {
  const { result, current } = p;
  const [menu, setMenu] = useState<{
    id: string;
    kind: "regen" | "remix" | "discard";
  } | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <b>Plan:</b> {result.planNarrative}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        <ul className="space-y-2">
          {result.items.map((item) => {
            const def = contentType(item.contentType);
            const st = p.itemState[item.id];
            return (
              <li
                key={item.id}
                className={`rounded-md border p-2 ${
                  p.selected === item.id
                    ? "border-blue-600"
                    : "border-zinc-200 dark:border-zinc-800"
                } ${st === "discarded" ? "opacity-40" : ""}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => {
                    p.setSelected(item.id);
                    setMenu(null);
                  }}
                >
                  <p className="text-sm font-medium">{def?.label}</p>
                  <p className="text-[11px] text-zinc-500">
                    {item.concepts.slice(0, 3).join(", ")}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {item.provenance ?? "inferred"} · conf {item.confidence ?? "—"}
                    {p.attempts[item.id] ? ` · refined ×${p.attempts[item.id] - 1}` : ""}
                    {p.remixes[item.id] ? " · remixed" : ""}
                    {st === "discarded" ? " · discarded" : ""}
                    {st === "refining" ? " · refining…" : ""}
                    {st === "remixing" ? " · remixing…" : ""}
                  </p>
                </button>

                {p.selected === item.id && (
                <>
                {st === "discarded" ? (
                  <button
                    onClick={() => p.setItem(item.id, "approved")}
                    className="mt-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] dark:border-zinc-700"
                  >
                    Undo
                  </button>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <button
                      onClick={() =>
                        p.setItem(
                          item.id,
                          st === "editing" ? "approved" : "editing",
                        )
                      }
                      className={`rounded border px-1.5 py-0.5 ${
                        st === "editing"
                          ? "border-blue-600 font-medium"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      Edit
                    </button>
                    <button
                      disabled={st === "refining" || st === "remixing"}
                      onClick={() =>
                        setMenu(
                          menu?.id === item.id && menu.kind === "regen"
                            ? null
                            : { id: item.id, kind: "regen" },
                        )
                      }
                      className="rounded border border-zinc-300 px-1.5 py-0.5 disabled:opacity-40 dark:border-zinc-700"
                    >
                      Refine ▾
                    </button>
                    <button
                      disabled={st === "refining" || st === "remixing"}
                      onClick={() =>
                        setMenu(
                          menu?.id === item.id && menu.kind === "remix"
                            ? null
                            : { id: item.id, kind: "remix" },
                        )
                      }
                      className="rounded border border-zinc-300 px-1.5 py-0.5 disabled:opacity-40 dark:border-zinc-700"
                    >
                      Remix ▾
                    </button>
                    <button
                      onClick={() =>
                        setMenu(
                          menu?.id === item.id && menu.kind === "discard"
                            ? null
                            : { id: item.id, kind: "discard" },
                        )
                      }
                      className="rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-700"
                    >
                      Discard ▾
                    </button>
                  </div>
                )}

                {menu?.id === item.id && menu.kind === "regen" && (
                  <div className="mt-1 rounded border border-blue-300 bg-blue-50/50 p-1.5 text-[11px] dark:border-blue-900 dark:bg-blue-950/20">
                    <p className="mb-1 text-zinc-500">
                      Refine this activity — regenerates all questions, including
                      your edits. What should change?
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {REFINE_OPTIONS.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => {
                            setMenu(null);
                            p.onRefine(item.id, o.id);
                          }}
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {menu?.id === item.id && menu.kind === "remix" && (
                  <div className="mt-1 rounded border border-blue-300 bg-blue-50/50 p-1.5 text-[11px] dark:border-blue-900 dark:bg-blue-950/20">
                    <p className="mb-1 text-zinc-500">
                      Remix — rebuild this activity as a different type, keeping the
                      same concepts. Your edits will be lost.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {REMIX_TARGETS.filter(
                        (t) => t.name !== item.contentType,
                      ).map((t) => (
                        <button
                          key={t.name}
                          onClick={() => {
                            setMenu(null);
                            p.onRemix(item.id, t.name);
                          }}
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {menu?.id === item.id && menu.kind === "discard" && (
                  <div className="mt-1 rounded border border-red-300 bg-red-50/50 p-1.5 text-[11px] dark:border-red-900 dark:bg-red-950/20">
                    <p className="mb-1 text-zinc-500">Discard because…</p>
                    <div className="flex flex-wrap gap-1">
                      {DISCARD_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setMenu(null);
                            p.onDiscard(item.id, r);
                          }}
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="space-y-3">
          {current ? (
            <ItemPanel
              key={current.id}
              item={current}
              value={p.edits[current.id] ?? current.contentJson}
              onChange={(v) => p.setEdits((e) => ({ ...e, [current.id]: v }))}
              editing={p.itemState[current.id] === "editing"}
            />
          ) : (
            <p className="text-sm text-zinc-400">Select an item.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Variant B — full-screen 3-panel workspace ---------------- */

/** Best-effort "N questions / cards / words" from a generated item's contentJson. */
function countElements(item: { contentJson?: unknown }): string {
  const v = (item.contentJson ?? {}) as Record<string, unknown>;
  const len = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).length : 0);
  const n =
    len("choices") ||
    len("questions") ||
    len("summaries") ||
    len("dialogs") ||
    len("words") ||
    len("panels") ||
    (typeof v.textField === "string"
      ? v.textField.split("\n").filter(Boolean).length
      : 0);
  const noun = v.dialogs
    ? "cards"
    : v.words
      ? "words"
      : v.panels
        ? "entries"
        : "questions";
  return n ? `${n} ${noun}` : "updated";
}

const chip =
  "rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] disabled:opacity-40 dark:border-zinc-700";

/** Chip-only refinement chat for one activity. Reuses the Refine / Remix / Discard handlers. */
function RefineChat(p: {
  item: RenderedItem;
  state: ItemState | undefined;
  turns: ChatTurn[];
  append: (turn: ChatTurn) => void;
  onRefine: (id: string, adj: string) => Promise<RenderedItem | null>;
  onRemix: (id: string, toType: string) => Promise<RenderedItem | null>;
  onDiscard: (id: string, reason: string) => void;
  onUndiscard: () => void;
}) {
  const [expand, setExpand] = useState<null | "refine" | "type" | "discard">(
    null,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const busy = p.state === "refining" || p.state === "remixing";
  const discarded = p.state === "discarded";

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [p.turns.length, busy]);

  async function run(
    userText: string,
    fire: () => Promise<RenderedItem | null>,
  ) {
    p.append({ role: "user", text: userText });
    setExpand(null);
    const it = await fire();
    p.append({
      role: "system",
      text: it
        ? `Regenerated — ${countElements(it)}.`
        : "Couldn't regenerate — try again.",
    });
  }

  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800">
        Refine · {contentType(p.item.contentType)?.label}
      </p>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-auto p-3 text-xs"
      >
        {p.turns.length === 0 && (
          <p className="text-zinc-400">No changes yet — pick an action below.</p>
        )}
        {p.turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <span
              className={`inline-block rounded px-2 py-1 ${
                t.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {t.text}
            </span>
          </div>
        ))}
        {busy && <p className="text-zinc-400">Regenerating…</p>}
      </div>

      <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-zinc-200 p-2 dark:border-zinc-800">
        {discarded ? (
          <button
            onClick={() => {
              p.append({ role: "user", text: "Undo discard" });
              p.onUndiscard();
            }}
            className={chip}
          >
            Undo discard
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              <button
                disabled={busy}
                onClick={() => setExpand(expand === "refine" ? null : "refine")}
                className={`${chip} ${expand === "refine" ? "border-blue-600 font-medium" : ""}`}
              >
                Refine ▸
              </button>
              <button
                disabled={busy}
                onClick={() => setExpand(expand === "type" ? null : "type")}
                className={`${chip} ${expand === "type" ? "border-blue-600 font-medium" : ""}`}
              >
                Change type ▸
              </button>
              <button
                disabled={busy}
                onClick={() => setExpand(expand === "discard" ? null : "discard")}
                className={`${chip} ${expand === "discard" ? "border-blue-600 font-medium" : ""}`}
              >
                Discard ▸
              </button>
            </div>

            {expand === "refine" && (
              <div className="mt-1 flex flex-wrap gap-1">
                {REFINE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    disabled={busy}
                    onClick={() =>
                      run(o.label, () => p.onRefine(p.item.id, o.id))
                    }
                    className={`${chip} bg-white dark:bg-zinc-900`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {expand === "type" && (
              <div className="mt-1 flex flex-wrap gap-1">
                {REMIX_TARGETS.filter((t) => t.name !== p.item.contentType).map(
                  (t) => (
                    <button
                      key={t.name}
                      onClick={() =>
                        run(`Change type → ${t.label}`, () =>
                          p.onRemix(p.item.id, t.name),
                        )
                      }
                      className={`${chip} bg-white dark:bg-zinc-900`}
                    >
                      {t.label}
                    </button>
                  ),
                )}
              </div>
            )}
            {expand === "discard" && (
              <div className="mt-1 flex flex-wrap gap-1">
                {DISCARD_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      p.append({ role: "user", text: `Discard — ${r}` });
                      p.append({ role: "system", text: "Discarded." });
                      setExpand(null);
                      p.onDiscard(p.item.id, r);
                    }}
                    className={`${chip} bg-white dark:bg-zinc-900`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Placeholder for the full H5P.com editor. Smart Import hands off to the
 *  existing editor unchanged — it isn't rebuilt in the prototype; this stands
 *  in for it in the library Refine view's "Editor" tab. */
function H5PEditorStub({ item }: { item: RenderedItem }) {
  const label = contentType(item.contentType)?.label ?? item.contentType;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="max-w-xs rounded-lg border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
        <p className="text-sm font-medium">H5P editor &mdash; {label}</p>
        <p className="mt-1.5 text-xs text-zinc-500">
          The full H5P.com editor for this activity opens here &mdash; every
          field, media, feedback and behaviour setting. Not rebuilt in the
          prototype; Smart Import hands off to the existing editor unchanged.
        </p>
      </div>
      <p className="text-[11px] text-zinc-400">
        Chat for AI refinements &middot; the editor for precise manual fixes.
      </p>
    </div>
  );
}

/* ---------------- Workspace: resizable + collapsible 3-panel layout ---------------- */

const PANELS_KEY = "smartimport.workspacePanels.v2";
// How small an open panel may get, as a fraction of the row. Low enough that a
// divider has real travel with three panels open (0.3 left almost none).
const MIN_FRAC = 0.14;

/** Only the widths are remembered; which panels are open is decided per stage. */
function loadFrac(storageKey: string, n: number): number[] | null {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(s?.frac) && s.frac.length === n) return s.frac as number[];
  } catch {
    /* ignore */
  }
  return null;
}

type Panel = {
  id: string;
  title: string;
  node: React.ReactNode;
  /** Shown in the thin strip when the panel is collapsed (falls back to the title). */
  rail?: React.ReactNode;
};

function ResizablePanels({
  panels,
  open,
  onOpenChange,
  storageKey = PANELS_KEY,
}: {
  panels: Panel[];
  /** Which panels are expanded — controlled by the caller so a stage can set defaults. */
  open: boolean[];
  onOpenChange: (next: boolean[]) => void;
  /** Widths persist independently per caller — a solo 2-panel view shouldn't
   *  overwrite the full 3-panel workspace's saved layout. */
  storageKey?: string;
}) {
  const panelCount = panels.length;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [frac, setFrac] = useState<number[]>(
    () =>
      loadFrac(storageKey, panelCount) ??
      Array(panelCount).fill(1 / panelCount),
  );
  const drag = useRef<{ l: number; r: number; startX: number; sf: number[] } | null>(
    null,
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ frac }));
    } catch {
      /* ignore */
    }
  }, [frac, storageKey]);

  const idxs = Array.from({ length: panelCount }, (_, i) => i);
  const openIdx = idxs.filter((i) => open[i]);
  const openSum = openIdx.reduce((s, i) => s + frac[i], 0) || 1;

  function toggle(i: number) {
    if (open[i] && open.filter(Boolean).length === 1) return; // keep one open
    const n = [...open];
    n[i] = !n[i];
    onOpenChange(n);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !wrapRef.current) return;
    const total = wrapRef.current.getBoundingClientRect().width;
    if (total <= 0) return;
    const openNow = idxs.filter((i) => open[i]);
    const sfSum = openNow.reduce((s, i) => s + d.sf[i], 0) || 1;
    const dx = (e.clientX - d.startX) / total;
    const pair = (d.sf[d.l] + d.sf[d.r]) / sfSum;
    let l = d.sf[d.l] / sfSum + dx;
    l = Math.max(MIN_FRAC, Math.min(pair - MIN_FRAC, l));
    const r = pair - l;
    setFrac((f) => {
      const n = [...f];
      n[d.l] = l * sfSum;
      n[d.r] = r * sfSum;
      return n;
    });
  }

  const els: React.ReactNode[] = [];
  panels.forEach((pn, i) => {
    const isOpen = open[i];
    els.push(
      <div
        key={pn.id}
        className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 ${
          isOpen ? "min-w-0 flex-1" : pn.rail ? "shrink-0 lg:w-44" : "shrink-0 lg:w-9"
        }`}
        style={isOpen ? { flexBasis: 0, flexGrow: frac[i] / openSum } : undefined}
      >
        {isOpen ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="truncate">{pn.title}</span>
              <button
                onClick={() => toggle(i)}
                title={`Collapse ${pn.title}`}
                aria-label={`Collapse ${pn.title}`}
                className="shrink-0 rounded border border-zinc-300 px-1.5 leading-none text-zinc-400 hover:border-blue-500 hover:text-blue-600 dark:border-zinc-700"
              >
                –
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{pn.node}</div>
          </>
        ) : pn.rail ? (
          <div className="flex h-full flex-col items-stretch bg-zinc-50 dark:bg-zinc-900">
            <button
              onClick={() => toggle(i)}
              title={`Expand ${pn.title}`}
              aria-label={`Expand ${pn.title}`}
              className="shrink-0 border-b border-zinc-200 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-blue-600 dark:border-zinc-800"
            >
              {pn.title} ›
            </button>
            <div className="min-h-0 flex-1 overflow-auto">{pn.rail}</div>
          </div>
        ) : (
          <button
            onClick={() => toggle(i)}
            title={`Expand ${pn.title}`}
            aria-label={`Expand ${pn.title}`}
            className="flex h-full w-full flex-col items-center gap-2 bg-zinc-50 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-blue-600 dark:bg-zinc-900"
          >
            <span aria-hidden>+</span>
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              {pn.title}
            </span>
          </button>
        )}
      </div>,
    );
    // resize handle between this open panel and the next open one
    const next = openIdx.find((j) => j > i);
    if (isOpen && next !== undefined) {
      els.push(
        <div
          key={`h-${i}`}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { l: i, r: next, startX: e.clientX, sf: [...frac] };
          }}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          title="Drag to resize"
          className="group hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center rounded bg-zinc-200 hover:bg-blue-400 lg:flex dark:bg-zinc-700"
        >
          <span className="text-[9px] leading-none text-zinc-400 group-hover:text-white">
            ⋮
          </span>
        </div>,
      );
    }
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <p className="shrink-0 px-3 pt-2 text-[11px] text-zinc-400">
        Drag the dividers to resize · click <b>–</b> to collapse a panel
      </p>
      <div
        ref={wrapRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 pt-2 lg:flex-row"
      >
        {els}
      </div>
    </div>
  );
}

function Workspace(p: {
  sourceTab: SourceTab;
  setSourceTab: (s: SourceTab) => void;
  title: string;
  setTitle: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  wikiUrl: string;
  setWikiUrl: (s: string) => void;
  intent: ImportIntent;
  setIntent: (f: (i: ImportIntent) => ImportIntent) => void;
  analysis: SourceAnalysis | null;
  analyzing: boolean;
  recByName: Record<string, Recommendation>;
  toggleType: (n: string) => void;
  generating: boolean;
  generate: () => void;
  result: ApiResult | null;
  itemState: Record<string, ItemState>;
  setItem: (id: string, s: ItemState) => void;
  edits: Record<string, unknown>;
  setEdits: (f: (e: Record<string, unknown>) => Record<string, unknown>) => void;
  selected: string | null;
  setSelected: (id: string) => void;
  current: RenderedItem | null;
  attempts: Record<string, number>;
  remixes: Record<string, number>;
  transcript: Record<string, ChatTurn[]>;
  setTranscript: (
    f: (t: Record<string, ChatTurn[]>) => Record<string, ChatTurn[]>,
  ) => void;
  onRefine: (id: string, adj: string) => Promise<RenderedItem | null>;
  onRemix: (id: string, toType: string) => Promise<RenderedItem | null>;
  onDiscard: (id: string, reason: string) => void;
  onStartAnother: () => void;
}) {
  const [editSetup, setEditSetup] = useState(false);
  const [panel3Tab, setPanel3Tab] = useState<"refine" | "edit">("refine");

  // Panel layout defaults per phase. Before generate: Setup + a sample
  // Preview of the selected type(s), Refine collapsed (nothing to refine
  // yet). After generate: Setup collapses to its rail, Preview + Refine take
  // the row. The user still resizes / collapses freely either way.
  const [open, setOpen] = useState<boolean[]>([true, true, false]);
  const hadResult = useRef(false);
  useEffect(() => {
    const has = !!p.result;
    if (has !== hadResult.current) {
      hadResult.current = has;
      setOpen(has ? [false, true, true] : [true, true, false]);
    }
  }, [p.result]);

  // Which selected type's sample shows in Preview before generate. Falls
  // back to the first selected type whenever the explicit pick is no longer
  // in the selection (computed at render, not synced via an effect).
  const [previewTypePick, setPreviewTypePick] = useState<string | null>(null);
  const previewType =
    previewTypePick && p.intent.contentTypes.includes(previewTypePick)
      ? previewTypePick
      : (p.intent.contentTypes[0] ?? null);

  const setupForm = (
    <>
      <Configure
        sourceTab={p.sourceTab}
        setSourceTab={p.setSourceTab}
        title={p.title}
        setTitle={p.setTitle}
        text={p.text}
        setText={p.setText}
        wikiUrl={p.wikiUrl}
        setWikiUrl={p.setWikiUrl}
        intent={p.intent}
        setIntent={p.setIntent}
        analysis={p.analysis}
        analyzing={p.analyzing}
      />
      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Activities
        </p>
        <Activities
          intent={p.intent}
          recByName={p.recByName}
          analysis={p.analysis}
          toggle={p.toggleType}
          locked={!!p.result}
        />
      </div>
    </>
  );


  // (b) the 3 resizable / collapsible panels — same shell before and after generate
  const cur = p.current;
  const hasResult = !!p.result;
  const items = p.result?.items ?? [];

  const itemLine = (it: RenderedItem) => {
    const s = p.itemState[it.id];
    return [
      p.attempts[it.id] ? `refined ×${p.attempts[it.id] - 1}` : "generated",
      p.remixes[it.id] ? "remixed" : "",
      s === "discarded" ? "discarded" : "",
      s === "refining" ? "refining…" : "",
      s === "remixing" ? "remixing…" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };

  // Panel 1 — before generate: the setup form. After: setup summary + the list
  // of every generated activity (pick any to preview / refine).
  const setupPanelNode = (
    <div className="h-full overflow-auto p-3 text-xs">
      {setupForm}
    </div>
  );

  const activitiesNode = (
    <div className="h-full space-y-3 overflow-auto p-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setEditSetup((v) => !v)} className={chip}>
          {editSetup ? "Hide setup" : "Edit setup"}
        </button>
        <button
          onClick={() => p.generate()}
          disabled={p.generating}
          className={chip}
        >
          {p.generating ? "Regenerating…" : "Regenerate all"}
        </button>
        <button onClick={p.onStartAnother} className={chip}>
          Start again
        </button>
      </div>

      {editSetup ? (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {setupForm}
        </div>
      ) : (
        <div className="space-y-0.5 text-zinc-500">
          <p className="truncate">
            {p.sourceTab === "Wikipedia"
              ? p.wikiUrl || "(no URL)"
              : `Pasted text · ${p.analysis?.wordCount ?? "?"} words`}
          </p>
          <p className="truncate">
            {p.intent.authoringMode === "brief"
              ? `Brief: ${briefGoal(p.intent) || "—"}`
              : p.intent.prompt || "(defaults)"}
          </p>
        </div>
      )}

      <ul className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {items.map((it) => (
          <li key={it.id}>
            <button
              onClick={() => p.setSelected(it.id)}
              className={`w-full rounded-md border p-2 text-left ${
                p.selected === it.id
                  ? "border-blue-600"
                  : "border-zinc-200 dark:border-zinc-800"
              } ${p.itemState[it.id] === "discarded" ? "opacity-40" : ""}`}
            >
              <p className="truncate font-medium">
                {contentType(it.contentType)?.label}
              </p>
              {it.concepts.length > 0 && (
                <p className="truncate text-[10px] text-zinc-400">
                  {it.concepts.slice(0, 3).join(", ")}
                </p>
              )}
              <p className="truncate text-[10px] text-zinc-400">{itemLine(it)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  // Rail shown when panel 1 is collapsed — still pick an activity
  const activitiesRail = (
    <ul className="space-y-1 p-1.5">
      {items.map((it, i) => (
        <li key={it.id}>
          <button
            onClick={() => p.setSelected(it.id)}
            title={contentType(it.contentType)?.label}
            className={`w-full rounded border px-1.5 py-1 text-left text-[10px] ${
              p.selected === it.id
                ? "border-blue-600 font-medium"
                : "border-zinc-200 text-zinc-500 dark:border-zinc-800"
            } ${p.itemState[it.id] === "discarded" ? "line-through opacity-40" : ""}`}
          >
            {i + 1}. {contentType(it.contentType)?.label}
          </button>
        </li>
      ))}
    </ul>
  );

  // Panel 2 — before generate: a read-only sample of the selected type(s), so
  // a new user can see the shape of what they're about to make. After
  // generate: the live preview of the selected activity (Review / Play).
  const previewNode = hasResult ? (
    <div className="h-full overflow-auto p-3">
      {cur ? (
        <ItemPanel
          key={cur.id}
          item={cur}
          value={p.edits[cur.id] ?? cur.contentJson}
          onChange={(v) => p.setEdits((e) => ({ ...e, [cur.id]: v }))}
          editing={false}
          initialView="play"
        />
      ) : (
        <p className="text-sm text-zinc-400">Select an activity to preview it.</p>
      )}
    </div>
  ) : (
    <div className="h-full overflow-auto p-3">
      <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <b>Example only</b> — a sample H5P for this type, playable, so you can
        see what it&rsquo;s like before picking it. Your generated activities
        replace this once you click Generate.
      </div>
      {p.intent.contentTypes.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Select one or more activity types to see an example.
        </p>
      ) : (
        <>
          {p.intent.contentTypes.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {p.intent.contentTypes.map((n) => (
                <button
                  key={n}
                  onClick={() => setPreviewTypePick(n)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    previewType === n
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
                  }`}
                >
                  {contentType(n)?.label ?? n}
                </button>
              ))}
            </div>
          )}
          {previewType && (
            <TypeSamplePreview key={previewType} typeName={previewType} />
          )}
        </>
      )}
    </div>
  );

  // Panel 3 — Refine (guided actions) or Edit (inline text) for the selected activity
  const refinePanelNode = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
        {(["refine", "edit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPanel3Tab(t)}
            className={`rounded border px-2 py-0.5 text-[11px] ${
              panel3Tab === t
                ? "border-blue-600 font-medium"
                : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
            }`}
          >
            {t === "refine" ? "Refine" : "Edit text"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {!cur ? (
          <p className="p-4 text-xs text-zinc-400">
            {hasResult
              ? "Select an activity."
              : "Refine and edit tools appear here once you generate."}
          </p>
        ) : panel3Tab === "edit" ? (
          <div className="h-full overflow-auto p-3">
            <ItemPanel
              key={cur.id}
              item={cur}
              value={p.edits[cur.id] ?? cur.contentJson}
              onChange={(v) => p.setEdits((e) => ({ ...e, [cur.id]: v }))}
              editing
              hideViewToggle
            />
          </div>
        ) : (
          <RefineChat
            key={cur.id}
            item={cur}
            state={p.itemState[cur.id]}
            turns={p.transcript[cur.id] ?? []}
            append={(turn) =>
              p.setTranscript((t) => ({
                ...t,
                [cur.id]: [...(t[cur.id] ?? []), turn],
              }))
            }
            onRefine={p.onRefine}
            onRemix={p.onRemix}
            onDiscard={p.onDiscard}
            onUndiscard={() => p.setItem(cur.id, "approved")}
          />
        )}
      </div>
    </div>
  );

  return (
    <ResizablePanels
      open={open}
      onOpenChange={setOpen}
      panels={[
        {
          id: "activities",
          title: hasResult ? "Activities" : "Setup",
          node: hasResult ? activitiesNode : setupPanelNode,
          rail: hasResult ? activitiesRail : undefined,
        },
        { id: "preview", title: "Preview", node: previewNode },
        { id: "refine", title: "Refine", node: refinePanelNode },
      ]}
    />
  );
}

/* ---------------- After Create — the content library, with this import's receipt ---------------- */

const AGAIN_LABEL: Record<string, string> = {
  likely: "Likely to use again",
  maybe: "Might use again",
  unlikely: "Unlikely to use again",
};

function receiptRow(label: string, node: React.ReactNode) {
  return (
    <div key={label} className="contents">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="min-w-0">{node}</dd>
    </div>
  );
}

/** Session metadata laid out along the workflow: source → intent → generate →
 *  review → result → the educator's overall-experience feedback. */
function ImportReceipt({ rec }: { rec: ImportRecord }) {
  const o = rec.outcome;
  const discarded = rec.decisions.filter((d) => d.discarded);
  const steers = [...new Set(rec.decisions.flatMap((d) => d.refineSteers ?? []))];
  const types = rec.intent.contentTypes
    .map((n) => contentType(n)?.label ?? n)
    .join(", ");
  const fb = rec.feedback;
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-500">Session · {rec.name}</p>
      <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-[6.5rem_1fr]">
        {receiptRow(
          "1 · Source",
          <>
            <span className="block truncate">
              {rec.source.kind === "url"
                ? rec.source.value
                : `Pasted text — ${rec.source.value.slice(0, 70)}…`}
              {rec.source.wordCount ? ` (${rec.source.wordCount} words)` : ""}
            </span>
            {rec.source.readbackKind && (
              <span className="text-zinc-400">
                read back as {rec.source.readbackKind}
              </span>
            )}
          </>,
        )}
        {receiptRow(
          "2 · Intent",
          <>
            <span className="block truncate">{intentLabel(rec.intent)}</span>
            <span className="text-zinc-400">
              {rec.intent.emphasis} emphasis · {rec.intent.volume} volume ·
              preset: {rec.promptPresetId ?? "scratch"}
            </span>
          </>,
        )}
        {receiptRow("Activities", types || "—")}
        {receiptRow(
          "3 · Generate",
          <>
            {rec.engine}
            {rec.model ? ` (${rec.model})` : ""} · {o.generated} generated ·{" "}
            {rec.uiVariant ?? "wizard"} UI
          </>,
        )}
        {receiptRow(
          "4 · Review",
          <>
            {o.kept} kept
            {o.edited ? `, ${o.edited} edited` : ""}
            {o.refined ? `, ${o.refined} refined` : ""}
            {o.remixed ? `, ${o.remixed} remixed` : ""}
            {o.discarded ? `, ${o.discarded} discarded` : ""}
            {steers.length > 0 && (
              <span className="block text-zinc-400">
                refine steers: {steers.join(", ")}
              </span>
            )}
            {discarded.length > 0 && (
              <span className="block text-zinc-400">
                discarded:{" "}
                {discarded
                  .map(
                    (d) =>
                      `${contentType(d.contentType)?.label ?? d.contentType}` +
                      (d.discardReason ? ` (${d.discardReason})` : ""),
                  )
                  .join(", ")}
              </span>
            )}
          </>,
        )}
        {receiptRow(
          "5 · Result",
          <>
            {o.kept} {o.kept === 1 ? "activity" : "activities"} in the library as
            drafts
            {rec.buildMs != null
              ? ` · generated in ${fmtDuration(rec.buildMs)} (steps 1–2, review excluded)`
              : ""}
          </>,
        )}
        {receiptRow(
          "Feedback",
          fb ? (
            <>
              <span className="block">
                {"★".repeat(fb.rating)}
                {"☆".repeat(Math.max(0, 5 - fb.rating))} ({fb.rating}/5)
                {fb.again ? ` · ${AGAIN_LABEL[fb.again]}` : ""}
              </span>
              {fb.comment.trim() && (
                <span className="block text-zinc-400">
                  &ldquo;{fb.comment.trim()}&rdquo;
                </span>
              )}
              <span className="text-zinc-400">
                given {relTime(fb.submittedAt)}
              </span>
            </>
          ) : (
            <span className="text-zinc-400">not rated yet</span>
          ),
        )}
      </dl>
    </div>
  );
}

function navLabel(n: ShellNav): string {
  return n === "my"
    ? "My Content"
    : n === "smartimport"
      ? "Smart Import"
      : n === "shared"
        ? "Shared with me"
        : n === "all"
          ? "All Content"
          : "Trash";
}

function Shell(p: {
  nav: ShellNav;
  setNav: (n: ShellNav) => void;
  imports: ImportRecord[];
  setImports: (f: (prev: ImportRecord[]) => ImportRecord[]) => void;
  siFilter: string;
  setSiFilter: (s: string) => void;
  justCreatedId: string | null;
  clearJustCreated: () => void;
  onStartSmartImport: () => void;
  onRefineItem: (rec: ImportRecord, itemId: string) => void;
  uiVariant: UiVariant;
  setUiVariant: (v: UiVariant) => void;
}) {
  const navItems: ShellNav[] = ["my", "smartimport", "shared", "all", "trash"];
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="flex shrink-0 items-center gap-6 bg-zinc-800 px-4 py-2.5 text-sm text-white">
        <span className="font-bold tracking-tight">H5P</span>
        <span className="font-medium">Manage Content</span>
        <span className="text-zinc-400">Manage Organization</span>
        <span className="ml-auto text-zinc-300">NIKHIL GUPTA</span>
        <span className="rounded bg-blue-600 px-3 py-1 text-xs font-medium">
          + Add Content
        </span>
        <VariantToggle value={p.uiVariant} onChange={p.setUiVariant} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-3 rounded border border-dashed border-zinc-300 py-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
            Upload Logo
          </p>
          <p className="mb-2 text-sm font-semibold">Manage Content</p>
          <nav className="space-y-0.5 text-sm">
            {navItems.map((n) => (
              <button
                key={n}
                onClick={() => p.setNav(n)}
                className={`block w-full rounded px-2 py-1.5 text-left ${
                  p.nav === n
                    ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                {navLabel(n)}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
              + Add Content
            </span>
            <button
              onClick={p.onStartSmartImport}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              &#10022; Smart Import
            </button>
            <span className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 dark:border-zinc-700">
              New Folder
            </span>
          </div>

          <div className="p-5">
            {p.nav === "smartimport" ? (
              <SmartImportHome
                imports={p.imports}
                setImports={p.setImports}
                filter={p.siFilter}
                setFilter={p.setSiFilter}
                justCreatedId={p.justCreatedId}
                clearJustCreated={p.clearJustCreated}
                onStart={p.onStartSmartImport}
                onRefineItem={p.onRefineItem}
              />
            ) : (
              <GenericContentList
                nav={p.nav}
                imports={p.imports}
                goSmartImport={() => p.setNav("smartimport")}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function GenericContentList(p: {
  nav: ShellNav;
  imports: ImportRecord[];
  goSmartImport: () => void;
}) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  if (p.nav === "shared" || p.nav === "trash") {
    return (
      <p className="text-sm text-zinc-400">
        {navLabel(p.nav)} &mdash; nothing here in the prototype.
      </p>
    );
  }
  const siItems = p.imports.flatMap((rec) =>
    rec.items.map((it) => ({ rec, it })),
  );

  if (examplesOpen) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          <button
            onClick={() => setExamplesOpen(false)}
            className="text-blue-700 hover:underline dark:text-blue-300"
          >
            {navLabel(p.nav)}
          </button>{" "}
          &raquo; <span className="font-medium">Examples and templates</span>
        </p>
        <p className="rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-400 dark:border-zinc-700">
          Organization-shared examples and templates &mdash; not part of the
          prototype.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
        {navLabel(p.nav)}
      </p>
      <ul className="space-y-1.5 text-xs">
        <li>
          <button
            onClick={() => setExamplesOpen(true)}
            className="w-full rounded-md border border-zinc-200 p-2 text-left hover:border-blue-300 dark:border-zinc-800"
          >
            <p className="font-medium">&#128193; Examples and templates</p>
            <p className="text-zinc-500">Shared with the entire organization</p>
          </button>
        </li>
        <li>
          <button
            onClick={p.goSmartImport}
            className="w-full rounded-md border border-zinc-200 p-2 text-left hover:border-blue-300 dark:border-zinc-800"
          >
            <p className="font-medium">
              &#128193; Smart Import{" "}
              <span className="font-normal text-zinc-400">&rarr;</span>
            </p>
            <p className="text-zinc-500">
              {siItems.length} item{siItems.length === 1 ? "" : "s"} generated
              from source &mdash; opens the Smart Import tab
            </p>
          </button>
        </li>
        {MOCK_LIBRARY_ITEMS.map((m) => (
          <li
            key={m.title}
            className="rounded-md border border-zinc-200 p-2 opacity-70 dark:border-zinc-800"
          >
            <p className="truncate font-medium">{m.title}</p>
            <p className="truncate text-zinc-500">
              {m.type} &middot; from {m.from} &middot; {m.modified}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmartImportHome(p: {
  imports: ImportRecord[];
  setImports: (f: (prev: ImportRecord[]) => ImportRecord[]) => void;
  filter: string;
  setFilter: (s: string) => void;
  justCreatedId: string | null;
  clearJustCreated: () => void;
  onStart: () => void;
  onRefineItem: (rec: ImportRecord, itemId: string) => void;
}) {
  const [tab, setTab] = useState<"content" | "sessions">("content");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const byRecency = [...p.imports].sort((a, b) => b.createdAt - a.createdAt);
  const justCreated = p.imports.find((r) => r.id === p.justCreatedId) ?? null;
  const submitFeedback = (fb: ImportFeedback) => {
    if (!justCreated) return;
    const next = { ...justCreated, feedback: fb };
    p.setImports((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    saveImport(next);
  };
  const filterRec = p.imports.find((r) => r.id === p.filter) ?? null;
  const remaining = Math.max(0, 992 - p.imports.length);
  const contentRows = (filterRec ? [filterRec] : byRecency).flatMap((rec) =>
    rec.items.map((it) => ({ rec, it })),
  );
  const siUrl = (id: string) => `h5p.com/smart-import/${id.slice(0, 8)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Smart Import</h2>
        <span className="text-xs text-zinc-400">
          Remaining imports:{" "}
          <b className="text-zinc-600 dark:text-zinc-300">{remaining}</b>
        </span>
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
          {(["content", "sessions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-0.5 ${
                tab === t
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {t === "content" ? "Content" : "Sessions"}
            </button>
          ))}
        </div>
        <a
          href="/dashboard"
          className="ml-auto text-xs text-zinc-400 underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="H5P team only — output quality & experience metrics"
        >
          Team evals &#8599;
        </a>
        <button
          onClick={p.onStart}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + New Smart Import
        </button>
      </div>

      {justCreated && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              &#10003; {justCreated.outcome.kept}{" "}
              {justCreated.outcome.kept === 1 ? "activity" : "activities"} created
              from &ldquo;{justCreated.name}&rdquo;
            </p>
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
              {justCreated.buildMs != null ? (
                <>
                  Generated in{" "}
                  <b>{fmtDuration(justCreated.buildMs)}</b> &mdash; setup and
                  activities, review not counted.{" "}
                </>
              ) : (
                "Done in one pass. "
              )}
              In your library as drafts, filtered below to this import.
            </p>
          </div>
          <button
            onClick={p.clearJustCreated}
            className="shrink-0 text-xs text-emerald-700 underline dark:text-emerald-300"
          >
            dismiss
          </button>
        </div>
      )}

      {justCreated && !justCreated.feedback && (
        <ExperienceSurvey onSubmit={submitFeedback} />
      )}

      {p.imports.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No Smart Import content yet.{" "}
          <button onClick={p.onStart} className="text-blue-600 underline">
            Start a Smart Import
          </button>
          .
        </div>
      ) : tab === "content" ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-zinc-500">
              Show
              <select
                value={p.filter}
                onChange={(e) => {
                  p.setFilter(e.target.value);
                  setDetailsOpen(false);
                }}
                className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">All Smart Import content</option>
                {byRecency.map((r) => (
                  <option key={r.id} value={r.id}>
                    {"↳ "}
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-zinc-400">{contentRows.length} items</span>
          </div>

          {filterRec && (
            <div className="mb-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <b className="text-zinc-600 dark:text-zinc-300">
                  {filterRec.name}
                </b>
                <span className="text-zinc-500">
                  &middot; {filterRec.source.kind === "url" ? "URL" : "text"}{" "}
                  source &middot; {relTime(filterRec.createdAt)}
                </span>
                <button
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="ml-auto text-blue-600 underline"
                >
                  {detailsOpen ? "hide details" : "import details"}
                </button>
              </div>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-zinc-400">
                {siUrl(filterRec.id)}
                <button
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(
                        "https://" + siUrl(filterRec.id),
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="rounded border border-zinc-300 px-1 dark:border-zinc-700"
                >
                  copy
                </button>
              </p>
            </div>
          )}
          {detailsOpen && filterRec && <ImportReceipt rec={filterRec} />}

          <ul className="mt-1 space-y-1.5">
            {contentRows.map(({ rec, it }) => {
              const d = rec.decisions.find((x) => x.itemId === it.id);
              const tags: string[] = [];
              if (d?.edited) tags.push("edited");
              if (d && d.refineAttempts > 0)
                tags.push(`refined ×${d.refineAttempts}`);
              if (d && d.remixCount > 0) tags.push("remixed");
              return (
                <li
                  key={`${rec.id}:${it.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {it.title || contentType(it.contentType)?.label}
                    </p>
                    <p className="truncate text-zinc-500">
                      {contentType(it.contentType)?.label}
                      {" · from "}
                      <button
                        onClick={() => {
                          p.setFilter(rec.id);
                          setDetailsOpen(false);
                        }}
                        className="text-blue-600 underline"
                      >
                        {rec.name}
                      </button>
                      {tags.length ? ` · ${tags.join(" · ")}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => p.onRefineItem(rec, it.id)}
                      className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-blue-500 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Refine
                    </button>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                      draft
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-[11px] text-zinc-400">
            One list. Filter to a session, or follow any item&rsquo;s{" "}
            <b>from:</b> link back to its import &mdash; any time you return.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {byRecency.map((rec) => (
            <li
              key={rec.id}
              className="rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  DONE
                </span>
                <b className="text-zinc-700 dark:text-zinc-200">{rec.name}</b>
                <span className="text-zinc-400">
                  {rec.source.kind === "url" ? "URL" : "text"} &middot;{" "}
                  {rec.items.length}{" "}
                  {rec.items.length === 1 ? "activity" : "activities"} &middot;{" "}
                  {relTime(rec.createdAt)}
                  {rec.feedback ? ` · rated ${rec.feedback.rating}/5` : ""}
                </span>
                <button
                  onClick={() =>
                    setOpenInfo((v) => (v === rec.id ? null : rec.id))
                  }
                  aria-expanded={openInfo === rec.id}
                  aria-label="Session details"
                  title="Session details"
                  className={`ml-auto flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-serif italic ${
                    openInfo === rec.id
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
                  }`}
                >
                  i
                </button>
                <button
                  onClick={() => {
                    p.setFilter(rec.id);
                    setTab("content");
                  }}
                  className="rounded border border-zinc-300 px-2 py-0.5 text-blue-600 dark:border-zinc-700"
                >
                  See content
                </button>
                <button
                  onClick={() =>
                    p.setImports((prev) => prev.filter((r) => r.id !== rec.id))
                  }
                  title="Remove import"
                  aria-label="Remove import"
                  className="rounded px-1 text-zinc-400 hover:text-red-500"
                >
                  &times;
                </button>
              </div>
              {openInfo === rec.id && (
                <div className="mt-2">
                  <ImportReceipt rec={rec} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RATING_WORD = ["", "Poor", "Meh", "OK", "Good", "Great"];

type AbandonStep = "configure" | "activities" | "review";
const ABANDON_Q: Record<AbandonStep, { q: string; opts: string[] }> = {
  configure: {
    q: "Leaving before generating anything — what stopped you?",
    opts: [
      "Too much to fill in",
      "Didn’t have a source ready",
      "Wasn’t sure what to enter",
      "Just looking",
    ],
  },
  activities: {
    q: "Leaving before generating — what stopped you?",
    opts: [
      "None of these activity types fit",
      "Too many options",
      "Not sure which to pick",
      "Changed my mind",
    ],
  },
  review: {
    q: "You generated activities but didn’t create them — why?",
    opts: [
      "Quality wasn’t good enough",
      "Not what I expected",
      "Wrong for what I need",
      "Too much to fix",
      "Just testing",
    ],
  },
};

/** Asked once per session when someone leaves the flow after a real attempt.
 *  The first question is step-specific; the rest is the same everywhere. */
function AbandonSurvey(p: {
  step: AbandonStep;
  onLeave: (fb: { reason?: string; putOff?: string; comment?: string }) => void;
  onStay: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [putOff, setPutOff] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const cfg = ABANDON_Q[p.step];
  const pill = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs ${
      active
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium">{cfg.q}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cfg.opts.map((o) => (
            <button
              key={o}
              onClick={() => setReason(reason === o ? null : o)}
              className={pill(reason === o)}
            >
              {o}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Has this put you off using Smart Import?
        </p>
        <div className="mt-1 flex gap-1.5">
          {["No", "A bit", "Yes"].map((v) => (
            <button
              key={v}
              onClick={() => setPutOff(putOff === v ? null : v)}
              className={pill(putOff === v)}
            >
              {v}
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Anything else? (optional)"
          className="mt-3 w-full rounded border border-zinc-300 p-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            onClick={p.onStay}
            className="text-xs text-zinc-500 underline"
          >
            Keep editing
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => p.onLeave({})}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Leave, skip
            </button>
            <button
              onClick={() =>
                p.onLeave({
                  reason: reason ?? undefined,
                  putOff: putOff ?? undefined,
                  comment: comment.trim() || undefined,
                })
              }
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white"
            >
              Send &amp; leave
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The overall-experience pulse — shown once, right after a first pass finishes
 *  (setup → activities → review done). Non-blocking; the content is already saved. */
function ExperienceSurvey(p: { onSubmit: (fb: ImportFeedback) => void }) {
  const [rating, setRating] = useState(0);
  const [again, setAgain] = useState<ImportFeedback["again"]>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"open" | "sent" | "skipped">("open");

  if (state === "skipped") return null;
  if (state === "sent") {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
        Thanks &mdash; that&rsquo;s on this session&rsquo;s record. Open its{" "}
        <span className="font-serif italic">i</span> under Sessions to see it.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
        How was that first pass?
      </p>
      <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
        You just went through setup, choosing activities and review &mdash; a
        quick pulse on the whole thing.
      </p>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            aria-label={`${n} out of 5`}
            className={`h-7 w-7 rounded text-lg leading-none ${
              n <= rating
                ? "text-amber-500"
                : "text-zinc-300 dark:text-zinc-600"
            }`}
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
        <span className="ml-1 text-[11px] text-zinc-500">
          {rating ? RATING_WORD[rating] : "Rate it"}
        </span>
      </div>
      <div className="mt-2 text-xs">
        <p className="text-zinc-500">
          How likely are you to use Smart Import for your next activity?
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(["unlikely", "maybe", "likely"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setAgain(v)}
              className={`rounded-full border px-2.5 py-0.5 capitalize ${
                again === v
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What would make Smart Import more useful to you? (optional)"
        rows={2}
        className="mt-2 w-full rounded border border-zinc-300 p-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={!rating}
          onClick={() => {
            p.onSubmit({ rating, again, comment, submittedAt: Date.now() });
            setState("sent");
          }}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Send feedback
        </button>
        <button
          onClick={() => setState("skipped")}
          className="text-xs text-zinc-500 underline"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/** Short elapsed-time label, e.g. "48s", "2m 34s", "1h 05m". */
function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

function relTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

type Choice = { subContentId?: string; question: string; answers: string[] };

const stripHtml = (s: unknown) =>
  typeof s === "string" ? s.replace(/<[^>]+>/g, "").trim() : "";

/** Turn an H5P HTML value into plain text for an edit field: tags out, block
 *  ends become newlines, common entities decoded. */
const toPlainText = (s: unknown): string => {
  if (typeof s !== "string") return "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
};

/** Re-apply the wrapping the original value had, so the H5P player still
 *  renders it. Plain-text originals pass straight through. */
const fromPlainText = (text: string, original: unknown): string => {
  const wasHtml =
    typeof original === "string" && /^\s*<[a-z!]/i.test(original.trim());
  if (!wasHtml) return text;
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split("\n")
    .map((line) => `<p>${line.trim() || "&nbsp;"}</p>`)
    .join("");
};

/** Review renderer for the non-choices content shapes (Summary, Dialog Cards,
 *  Drag Text, Crossword, Accordion, Question Set). Read-only by default; inline
 *  text editing when `editing` + `onChange` are supplied. */
function OtherReview({
  value,
  signals,
  editing,
  onChange,
}: {
  value: unknown;
  signals?: QuestionSignal[];
  editing?: boolean;
  onChange?: (v: unknown) => void;
}) {
  const v = (value ?? {}) as Record<string, unknown>;

  if (editing && onChange) {
    const patch = (mutate: (d: Record<string, unknown>) => void) => {
      const d = structuredClone(v);
      mutate(d);
      onChange(d);
    };
    const eInp =
      "w-full rounded border border-zinc-300 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-900";
    const eBox = "rounded-md border border-zinc-200 p-2 dark:border-zinc-800";
    const editable = <T,>(list: T[], render: (row: T, i: number) => React.ReactNode) => (
      <div className="space-y-2">{list.map((row, i) => render(row, i))}</div>
    );

    if (Array.isArray(v.summaries)) {
      const sets = v.summaries as { summary: string[] }[];
      return editable(sets, (s, si) => (
        <div key={si} className={eBox}>
          <p className="mb-1 text-[10px] text-zinc-400">
            Set {si + 1} — first line is the correct statement
          </p>
          {s.summary.map((opt, oi) => (
            <input
              key={oi}
              value={toPlainText(opt)}
              onChange={(e) =>
                patch((d) => {
                  (d.summaries as { summary: string[] }[])[si].summary[oi] =
                    fromPlainText(e.target.value, opt);
                })
              }
              className={`${eInp} mb-1 ${oi === 0 ? "border-emerald-400" : ""}`}
            />
          ))}
        </div>
      ));
    }

    if (Array.isArray(v.dialogs)) {
      const dialogs = v.dialogs as { text: string; answer: string }[];
      return editable(dialogs, (d, di) => (
        <div key={di} className={eBox}>
          <p className="mb-1 text-[10px] text-zinc-400">Card {di + 1}</p>
          <input
            value={toPlainText(d.text)}
            onChange={(e) =>
              patch((dr) => {
                (dr.dialogs as { text: string }[])[di].text = fromPlainText(
                  e.target.value,
                  d.text,
                );
              })
            }
            placeholder="Front (prompt)"
            className={`${eInp} mb-1`}
          />
          <input
            value={toPlainText(d.answer)}
            onChange={(e) =>
              patch((dr) => {
                (dr.dialogs as { answer: string }[])[di].answer = fromPlainText(
                  e.target.value,
                  d.answer,
                );
              })
            }
            placeholder="Back (answer)"
            className={`${eInp} border-emerald-400`}
          />
        </div>
      ));
    }

    if (Array.isArray(v.words)) {
      const words = v.words as { clue: string; answer: string }[];
      return editable(words, (w, wi) => (
        <div key={wi} className={eBox}>
          <p className="mb-1 text-[10px] text-zinc-400">Word {wi + 1}</p>
          <input
            value={w.clue}
            onChange={(e) =>
              patch((d) => {
                (d.words as { clue: string }[])[wi].clue = e.target.value;
              })
            }
            placeholder="Clue"
            className={`${eInp} mb-1`}
          />
          <input
            value={w.answer}
            onChange={(e) =>
              patch((d) => {
                (d.words as { answer: string }[])[wi].answer = e.target.value;
              })
            }
            placeholder="Answer"
            className={`${eInp} border-emerald-400`}
          />
        </div>
      ));
    }

    if (Array.isArray(v.panels)) {
      const panels = v.panels as {
        title: string;
        content?: { params?: { text?: string } };
      }[];
      return editable(panels, (pn, pi) => (
        <div key={pi} className={eBox}>
          <input
            value={pn.title}
            onChange={(e) =>
              patch((d) => {
                (d.panels as { title: string }[])[pi].title = e.target.value;
              })
            }
            placeholder="Panel title"
            className={`${eInp} mb-1 font-medium`}
          />
          <textarea
            value={toPlainText(pn.content?.params?.text ?? "")}
            rows={3}
            onChange={(e) =>
              patch((d) => {
                const p2 = (d.panels as {
                  content?: { params?: { text?: string } };
                }[])[pi];
                if (!p2.content) p2.content = {};
                if (!p2.content.params) p2.content.params = {};
                p2.content.params.text = fromPlainText(
                  e.target.value,
                  pn.content?.params?.text ?? "<p></p>",
                );
              })
            }
            className={eInp}
          />
        </div>
      ));
    }

    if (Array.isArray(v.questions)) {
      const questions = v.questions as {
        params?: {
          question?: string;
          answers?: { text: string; correct?: boolean }[];
        };
      }[];
      return editable(questions, (q, qi) => (
        <div key={qi} className={eBox}>
          <textarea
            value={toPlainText(q.params?.question ?? "")}
            rows={2}
            onChange={(e) =>
              patch((d) => {
                const qq = (d.questions as { params?: { question?: string } }[])[qi];
                if (!qq.params) qq.params = {};
                qq.params.question = fromPlainText(
                  e.target.value,
                  q.params?.question ?? "<p></p>",
                );
              })
            }
            className={`${eInp} mb-1`}
          />
          {(q.params?.answers ?? []).map((a, ai) => (
            <input
              key={ai}
              value={toPlainText(a.text)}
              onChange={(e) =>
                patch((d) => {
                  const qq = (d.questions as {
                    params?: { answers?: { text: string }[] };
                  }[])[qi];
                  if (!qq.params) qq.params = {};
                  if (!qq.params.answers) qq.params.answers = [];
                  qq.params.answers[ai].text = fromPlainText(e.target.value, a.text);
                })
              }
              className={`${eInp} mb-1 ${a.correct ? "border-emerald-400" : ""}`}
            />
          ))}
        </div>
      ));
    }

    if (typeof v.textField === "string") {
      return (
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-400">
            Wrap each word learners must drag in *asterisks*.
          </p>
          <textarea
            value={v.textField}
            rows={8}
            onChange={(e) =>
              patch((d) => {
                d.textField = e.target.value;
              })
            }
            className={eInp}
          />
        </div>
      );
    }

    return (
      <p className="rounded-md border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
        Inline editing isn’t available for this type yet — use Refine, or edit
        it after creation.
      </p>
    );
  }

  let rows: { primary: string; secondary?: string; correct?: string }[] = [];

  if (Array.isArray(v.summaries)) {
    rows = (v.summaries as { summary: string[] }[]).map((s, i) => ({
      primary: `Set ${i + 1}`,
      correct: stripHtml(s.summary?.[0]),
      secondary: (s.summary ?? []).slice(1).map(stripHtml).join("  ·  "),
    }));
  } else if (Array.isArray(v.dialogs)) {
    rows = (v.dialogs as { text: string; answer: string }[]).map((d) => ({
      primary: stripHtml(d.text),
      correct: stripHtml(d.answer),
    }));
  } else if (Array.isArray(v.words)) {
    rows = (v.words as { clue: string; answer: string }[]).map((w) => ({
      primary: w.clue,
      correct: w.answer,
    }));
  } else if (Array.isArray(v.panels)) {
    rows = (v.panels as { title: string; content?: { params?: { text?: string } } }[]).map(
      (pn) => ({
        primary: pn.title,
        secondary: stripHtml(pn.content?.params?.text),
      }),
    );
  } else if (Array.isArray(v.questions)) {
    rows = (v.questions as { params?: { question?: string; answers?: { text: string; correct: boolean }[] } }[]).map(
      (q) => ({
        primary: stripHtml(q.params?.question),
        correct: stripHtml(
          (q.params?.answers ?? []).find((a) => a.correct)?.text,
        ),
        secondary: (q.params?.answers ?? [])
          .filter((a) => !a.correct)
          .map((a) => stripHtml(a.text))
          .join("  ·  "),
      }),
    );
  } else if (typeof v.textField === "string") {
    rows = v.textField
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        primary: line.replace(/\*([^*]+)\*/g, "[ $1 ]"),
        correct: (line.match(/\*([^*]+)\*/g) ?? [])
          .map((m) => m.replace(/\*/g, "").split(":")[0])
          .join(", "),
      }));
  }

  if (!rows.length)
    return (
      <p className="rounded-md border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
        Nothing to list for this type — use Play, or the JSON below.
      </p>
    );

  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={i}
          className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800"
        >
          <p className="font-medium">
            {i + 1}. {r.primary}
          </p>
          {r.correct && (
            <p className="mt-0.5 text-emerald-700 dark:text-emerald-400">
              ✓ {r.correct}
            </p>
          )}
          {r.secondary && (
            <p className="mt-0.5 text-zinc-500">{r.secondary}</p>
          )}
          {signals?.[i] && (
            <p className="mt-1 border-t border-zinc-100 pt-1 text-[10px] text-zinc-400 dark:border-zinc-800">
              <b>grounded in:</b> “{signals[i].grounding}” · {signals[i].confidence}{" "}
              confidence
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Screen-3 preview panel: Review (scan/act without answering) or Play (real H5P). */
function ItemPanel(p: {
  item: RenderedItem;
  value: unknown;
  onChange: (v: unknown) => void;
  editing: boolean;
  /** Hide the Review/Play switch — used when the caller already owns the mode (workspace Edit tab). */
  hideViewToggle?: boolean;
  /** Which view to show first (default "review"). */
  initialView?: "review" | "play";
}) {
  const [viewChoice, setViewChoice] = useState<"review" | "play">(
    p.initialView ?? "review",
  );
  // Editing only exists in the Review view, so force it there while Edit is on.
  const view = p.editing ? "review" : viewChoice;
  const val = (p.value ?? {}) as { choices?: Choice[] };
  const choices = val.choices ?? [];

  // per-question signals keyed by the stable subContentId of the ORIGINAL choices
  const original = (p.item.contentJson ?? {}) as { choices?: Choice[] };
  const sigByCid = new Map<string, QuestionSignal>();
  (original.choices ?? []).forEach((c, i) => {
    if (c.subContentId && p.item.questionSignals?.[i])
      sigByCid.set(c.subContentId, p.item.questionSignals[i]);
  });

  const write = (next: { choices: Choice[] }) =>
    p.onChange({ ...(p.value as object), choices: next.choices });
  const updateChoice = (ci: number, patch: Partial<Choice>) => {
    const c = [...choices];
    c[ci] = { ...c[ci], ...patch };
    write({ choices: c });
  };
  const edited = p.value !== p.item.contentJson;

  return (
    <div className="space-y-3">
      {!p.hideViewToggle && (
        <div className="flex items-center gap-1 text-[11px]">
          {(["review", "play"] as const).map((v) => (
            <button
              key={v}
              disabled={p.editing && v === "play"}
              onClick={() => setViewChoice(v)}
              className={`rounded border px-2 py-0.5 disabled:opacity-40 ${
                view === v
                  ? "border-blue-600 font-medium"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {v === "review" ? "Review" : "Play"}
            </button>
          ))}
          <span className="ml-1 text-zinc-400">
            {p.editing
              ? "editing — Play is available once you finish"
              : view === "review"
                ? "scan every question without answering"
                : "the real H5P player — as a learner sees it"}
          </span>
        </div>
      )}

      {view === "play" ? (
        p.item.hostPrepared && p.value ? (
          <>
            <H5PRender
              h5pJsonPath={p.item.render.h5pJsonPath}
              librariesPath={p.item.render.librariesPath}
              renderKey={p.item.id}
              renderId={p.item.id}
              contentJson={p.item.contentJson}
              h5pJson={p.item.render.h5pJson}
            />
            {edited && (
              <p className="text-[11px] text-amber-600">
                Play shows the originally generated version — your edits appear in
                Review.
              </p>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
            No H5P library bundle for {p.item.contentType} — add a .h5p of this type
            to data/ and run scripts/prepare-h5p.mjs.
          </div>
        )
      ) : choices.length ? (
        <ol className="space-y-2">
          {choices.map((c, ci) => {
            const sig = c.subContentId ? sigByCid.get(c.subContentId) : undefined;
            return (
              <li
                key={c.subContentId ?? ci}
                className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800"
              >
                {p.editing ? (
                  <textarea
                    value={toPlainText(c.question)}
                    onChange={(e) =>
                      updateChoice(ci, {
                        question: fromPlainText(e.target.value, c.question),
                      })
                    }
                    rows={2}
                    className="w-full rounded border border-zinc-300 p-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                ) : (
                  <p className="font-medium">
                    {ci + 1}. {stripHtml(c.question) || c.question}
                  </p>
                )}
                <ul className="mt-1 space-y-0.5">
                  {c.answers.map((a, ai) =>
                    p.editing ? (
                      <li key={ai}>
                        <input
                          value={toPlainText(a)}
                          onChange={(e) => {
                            const answers = [...c.answers];
                            answers[ai] = fromPlainText(e.target.value, a);
                            updateChoice(ci, { answers });
                          }}
                          className={`w-full rounded border p-1 ${
                            ai === 0
                              ? "border-emerald-400"
                              : "border-zinc-300 dark:border-zinc-700"
                          } dark:bg-zinc-900`}
                        />
                      </li>
                    ) : (
                      <li
                        key={ai}
                        className={
                          ai === 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-zinc-500"
                        }
                      >
                        {ai === 0 ? "✓ " : "• "}
                        {stripHtml(a) || a}
                      </li>
                    ),
                  )}
                </ul>
                {sig && (
                  <p className="mt-1 border-t border-zinc-100 pt-1 text-[10px] text-zinc-400 dark:border-zinc-800">
                    <b>grounded in:</b> “{sig.grounding}” · <b>key:</b>{" "}
                    {sig.answerKeyNote} · {sig.confidence} confidence
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <OtherReview
          value={p.value}
          signals={p.item.questionSignals}
          editing={p.editing}
          onChange={p.onChange}
        />
      )}
    </div>
  );
}

/** A live H5P render of a content type's shipped example, shown pre-generate
 *  so a new user sees what the type actually plays like. Every "full" type
 *  carries a self-contained bundle at public/h5p/<host>/ (h5p.json +
 *  content/content.json + libraries) — the permanent per-type sample. The
 *  player loads it straight from there; no per-item staging needed since the
 *  content is the bundle's own unmodified example. */
function TypeSamplePreview({ typeName }: { typeName: string }) {
  const def = contentType(typeName);
  const host = def?.renderHost;
  if (!host || def?.twin !== "full") {
    return (
      <p className="text-xs text-zinc-400">
        No live preview for {def?.label ?? typeName} yet — its H5P bundle
        isn&rsquo;t in the prototype.
      </p>
    );
  }
  return (
    <H5PRender
      key={typeName}
      h5pJsonPath={`/h5p/${host}`}
      librariesPath={`/h5p/${host}`}
      renderKey={typeName}
    />
  );
}
