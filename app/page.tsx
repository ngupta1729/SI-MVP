"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_TYPES, CATEGORIES, contentType } from "@/lib/h5p/contentTypes";
import {
  INTENT_PRESETS,
  preset as findPreset,
  type IntentPreset,
} from "@/lib/intent-presets";
import { useTemplates, type SavedTemplate } from "@/lib/templates";
import {
  type ImportRecord,
  type ImportItemDecision,
  type ImportKeptItem,
  fetchImports,
  saveImport,
  intentLabel,
} from "@/lib/import-records";
import type {
  ImportIntent,
  TwinResult,
  SourceAnalysis,
  QuestionSignal,
} from "@/lib/types";
import H5PRender from "@/components/H5PRender";

type Screen = "configure" | "activities" | "review" | "library";

// Mock pre-existing library content, to show new items land among everything else.
const MOCK_LIBRARY_ITEMS = [
  { title: "Cell structure — check", type: "Question Set", from: "Biology intro · 12 Aug", modified: "2 weeks ago" },
  { title: "Photosynthesis flashcards", type: "Dialog Cards", from: "built manually", modified: "3 weeks ago" },
  { title: "Ecosystem vocabulary", type: "Accordion", from: "Ecology import · 28 Jul", modified: "1 month ago" },
];
type SourceTab = "Pasted Text" | "Wikipedia";

type RenderedItem = TwinResult["items"][number] & {
  render: { librariesPath: string; h5pJsonPath: string };
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

const DEFAULT_INTENT: ImportIntent = {
  authoringMode: "prompt",
  prompt: "",
  promptPresetId: null,
  learningGoal: "",
  audienceLevel: "beginner",
  emphasis: "balanced",
  volume: "standard",
  language: "English",
  mode: "generate",
  contentTypes: [],
};

type ItemState =
  | "approved"
  | "editing"
  | "discarded"
  | "refining"
  | "remixing";

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

  // Post-create: land in the content library, scoped to this import.
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null);
  const [priorImports, setPriorImports] = useState<ImportRecord[]>([]);
  // review-stage decision metadata that isn't otherwise kept in state:
  const [discardReason, setDiscardReason] = useState<Record<string, string>>({});
  const [refineSteers, setRefineSteers] = useState<Record<string, string[]>>({});
  const [remixFrom, setRemixFrom] = useState<Record<string, string>>({});

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
  const sourceReady =
    sourceTab === "Wikipedia"
      ? /^https?:\/\/\S+wikipedia\.org\/\S+/i.test(wikiUrl)
      : text.trim().length >= 120;

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
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [remixes, setRemixes] = useState<Record<string, number>>({});

  function logReviewEvent(ev: Record<string, unknown>) {
    const item = result?.items.find((i) => i.id === ev.itemId);
    fetch("/api/review-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        importId,
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
  async function applyRegen(
    itemId: string,
    opts: {
      contentType: string;
      adjustment: string;
      attempt: number;
      busy: ItemState;
    },
  ) {
    if (!result) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItem(itemId, "approved");
    }
  }

  async function refineActivity(itemId: string, adjustment: string) {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;
    const attempt = (attempts[itemId] ?? 1) + 1;
    setAttempts((a) => ({ ...a, [itemId]: attempt }));
    setRefineSteers((s) => ({ ...s, [itemId]: [...(s[itemId] ?? []), adjustment] }));
    logReviewEvent({ action: "refine", itemId, reason: adjustment, attempt });
    await applyRegen(itemId, {
      contentType: item.contentType,
      adjustment,
      attempt,
      busy: "refining",
    });
  }

  async function remixActivity(itemId: string, toType: string) {
    const item = result?.items.find((i) => i.id === itemId);
    if (!item) return;
    const fromType = item.contentType;
    setRemixes((r) => ({ ...r, [itemId]: (r[itemId] ?? 0) + 1 }));
    setRemixFrom((m) => ({ ...m, [itemId]: m[itemId] ?? fromType }));
    logReviewEvent({ action: "remix", itemId, reason: fromType, toType });
    await applyRegen(itemId, {
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
    };
    saveImport(record);
    setImportRecord(record);
    fetchImports().then((list) =>
      setPriorImports(list.filter((r) => r.id !== record.id)),
    );
    setScreen("library");
  }

  function startAnother() {
    setResult(null);
    setItemState({});
    setEdits({});
    setSelected(null);
    setAttempts({});
    setRemixes({});
    setImportRecord(null);
    setDiscardReason({});
    setRefineSteers({});
    setRemixFrom({});
    setImportId(crypto.randomUUID());
    setText("");
    setWikiUrl("");
    setTitle("");
    setIntent(DEFAULT_INTENT);
    setAnalysis(null);
    setAnalyzedKey("");
    setScreen("configure");
  }

  const keptIds = result
    ? result.items.filter((i) => itemState[i.id] !== "discarded").map((i) => i.id)
    : [];
  const current = result?.items.find((i) => i.id === selected) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h1 className="text-lg font-semibold">Smart Import</h1>
          <Stepper screen={screen} />
          <p className="mt-1 text-xs text-zinc-400">
            Reworked educator workflow — a digital twin of H5P.com Smart Import.
          </p>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
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
              toggle={(n) =>
                setIntent((i) => ({
                  ...i,
                  contentTypes: i.contentTypes.includes(n)
                    ? i.contentTypes.filter((t) => t !== n)
                    : [...i.contentTypes, n],
                }))
              }
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
          {screen === "library" && importRecord && (
            <LibraryView
              current={importRecord}
              priorImports={priorImports}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <span className="text-xs text-zinc-400">
            {screen === "library" && importRecord
              ? `${importRecord.outcome.kept} created · in your content library`
              : screen === "review" && result
              ? `${keptIds.length}/${result.items.length} kept · engine: ${result.engine}`
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
            {screen === "configure" && (
              <>
                <button
                  onClick={() => setScreen("activities")}
                  disabled={!sourceReady}
                  className={btnPrimary}
                >
                  Choose activities
                </button>
              </>
            )}
            {screen === "activities" && (
              <>
                <button onClick={() => setScreen("configure")} className={btnGhost}>
                  Back
                </button>
                <button
                  onClick={() => generate()}
                  disabled={generating || !intent.contentTypes.length}
                  className={btnPrimary}
                >
                  {generating ? "Generating…" : "Generate and review"}
                </button>
              </>
            )}
            {screen === "review" && (
              <>
                <button onClick={() => setScreen("activities")} className={btnGhost}>
                  Back
                </button>
                <button
                  disabled={!keptIds.length}
                  className={btnPrimary}
                  onClick={finishCreate}
                >
                  Create {keptIds.length}
                </button>
              </>
            )}
            {screen === "library" && (
              <>
                <button onClick={() => setScreen("review")} className={btnGhost}>
                  Back to review
                </button>
                <button onClick={startAnother} className={btnPrimary}>
                  Start another import
                </button>
              </>
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
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
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
          <div className="space-y-2">
            <div className="grid gap-3 rounded-md border border-zinc-200 p-3 text-sm sm:grid-cols-2 dark:border-zinc-800">
            <Field label="Learning goal">
              <input
                value={p.intent.learningGoal}
                onChange={(e) => set({ learningGoal: e.target.value })}
                className={fieldInput}
                placeholder="e.g. Distinguish the three plate-boundary types"
              />
            </Field>
            <Field label="Audience level">
              <select
                value={p.intent.audienceLevel}
                onChange={(e) =>
                  set({
                    audienceLevel: e.target.value as ImportIntent["audienceLevel"],
                  })
                }
                className={fieldInput}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Emphasis">
              <select
                value={p.intent.emphasis}
                onChange={(e) =>
                  set({ emphasis: e.target.value as ImportIntent["emphasis"] })
                }
                className={fieldInput}
              >
                <option value="balanced">Balanced</option>
                <option value="assessment">Assessment-heavy</option>
                <option value="concept_explanation">Concept explanation</option>
              </select>
            </Field>
            <Field label="Volume">
              <select
                value={p.intent.volume}
                onChange={(e) =>
                  set({ volume: e.target.value as ImportIntent["volume"] })
                }
                className={fieldInput}
              >
                <option value="light">Light (~4 questions)</option>
                <option value="standard">Standard (~6)</option>
                <option value="thorough">Thorough (~10)</option>
              </select>
            </Field>
            <Field label="Language">
              <input
                value={p.intent.language}
                onChange={(e) => set({ language: e.target.value })}
                className={fieldInput}
              />
            </Field>
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

const fieldInput =
  "w-full rounded border border-zinc-300 p-1.5 dark:border-zinc-700 dark:bg-zinc-900";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      {children}
    </label>
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

function Activities(p: {
  intent: ImportIntent;
  recByName: Record<string, Recommendation>;
  toggle: (n: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Recommended activities are pre-checked from your source and intent. All
        overridable.
      </p>
      {CATEGORIES.map((cat) => {
        const items = CONTENT_TYPES.filter((c) => c.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {cat}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((ct) => {
                const rec = p.recByName[ct.name];
                const checked = p.intent.contentTypes.includes(ct.name);
                return (
                  <button
                    key={ct.name}
                    onClick={() => p.toggle(ct.name)}
                    className={`rounded-lg border p-3 text-left ${
                      checked
                        ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/30"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{ct.label}</span>
                      <span className="flex items-center gap-1.5">
                        {rec?.recommended && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            recommended
                          </span>
                        )}
                        {ct.twin !== "full" && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                            {ct.twin === "mock" ? "no preview" : "catalog only"}
                          </span>
                        )}
                        <input readOnly type="checkbox" checked={checked} />
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{ct.blurb}</p>
                    {rec && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {rec.reason}
                        {rec.recommended && rec.itemCount
                          ? ` · ~${rec.itemCount} items`
                          : ""}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
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

/* ---------------- After Create — the content library, with this import's receipt ---------------- */

/** The persisted import-details receipt, rendered from an ImportRecord. */
function ImportReceipt({ rec }: { rec: ImportRecord }) {
  const o = rec.outcome;
  const discarded = rec.decisions.filter((d) => d.discarded);
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-500">Import · {rec.name}</p>
      <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-[5rem_1fr]">
        <dt className="text-zinc-400">Source</dt>
        <dd className="truncate">
          {rec.source.kind === "url"
            ? rec.source.value
            : `${rec.source.value.slice(0, 80)}…`}
          {rec.source.wordCount ? ` (${rec.source.wordCount} words)` : ""}
        </dd>
        <dt className="text-zinc-400">Intent</dt>
        <dd className="truncate">
          {intentLabel(rec.intent)} · preset: {rec.promptPresetId ?? "scratch"}
        </dd>
        <dt className="text-zinc-400">Engine</dt>
        <dd>
          {rec.engine}
          {rec.model ? ` (${rec.model})` : ""}
        </dd>
        <dt className="text-zinc-400">Outcome</dt>
        <dd>
          {o.generated} generated → {o.kept} kept
          {o.edited ? `, ${o.edited} edited` : ""}
          {o.refined ? `, ${o.refined} refined` : ""}
          {o.remixed ? `, ${o.remixed} remixed` : ""}
          {o.discarded ? `, ${o.discarded} discarded` : ""}
        </dd>
      </dl>
      {discarded.length > 0 && (
        <p className="mt-1 text-zinc-400">
          Discarded:{" "}
          {discarded
            .map(
              (d) =>
                `${contentType(d.contentType)?.label ?? d.contentType}` +
                (d.discardReason ? ` (${d.discardReason})` : ""),
            )
            .join(", ")}
        </p>
      )}
      <p className="mt-1 text-zinc-400">
        Persisted receipt — open it again from any item&rsquo;s <b>from:</b> tag.
      </p>
    </div>
  );
}

function LibraryView(p: {
  current: ImportRecord;
  priorImports: ImportRecord[];
}) {
  const allRecords = [p.current, ...p.priorImports];
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const shown = allRecords.find((r) => r.id === openReceiptId) ?? null;

  const rows = allRecords.flatMap((rec) =>
    rec.items.map((it) => ({ rec, it })),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-800 dark:text-emerald-200">
          ✓ {p.current.outcome.kept}{" "}
          {p.current.outcome.kept === 1 ? "activity" : "activities"} created and
          added to your content library
        </p>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
          Each is tagged <b>from: {p.current.name}</b>. There is no separate Smart
          Import folder — click a <b>from:</b> tag to open that import&rsquo;s
          details.
        </p>
        <button
          onClick={() =>
            setOpenReceiptId(
              openReceiptId === p.current.id ? null : p.current.id,
            )
          }
          className="mt-1 text-xs underline"
        >
          {openReceiptId === p.current.id
            ? "Hide import details"
            : "Open import details"}
        </button>
      </div>

      {shown && <ImportReceipt rec={shown} />}

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-400">
            Content library
          </span>
          {p.priorImports.length > 0 && (
            <span className="text-zinc-400">
              {rows.length} items across {allRecords.length} imports
            </span>
          )}
        </div>
        <ul className="space-y-1.5">
          {rows.map(({ rec, it }) => {
            const d = rec.decisions.find((x) => x.itemId === it.id);
            const tags: string[] = [];
            if (d?.edited) tags.push("edited");
            if (d && d.refineAttempts > 0)
              tags.push(`refined ×${d.refineAttempts}`);
            if (d && d.remixCount > 0) tags.push("remixed");
            const fresh = rec.id === p.current.id;
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
                    {contentType(it.contentType)?.label} · from{" "}
                    <button
                      onClick={() => setOpenReceiptId(rec.id)}
                      className="text-blue-600 underline"
                    >
                      {rec.name}
                    </button>{" "}
                    · {fresh ? "just now" : relTime(rec.createdAt)}
                    {tags.length ? ` · ${tags.join(" · ")}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                  draft
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-zinc-400">
          — the rest of your library —
        </p>
        <ul className="mt-1 space-y-1.5 opacity-40">
          {MOCK_LIBRARY_ITEMS.map((m) => (
            <li
              key={m.title}
              className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800"
            >
              <p className="truncate font-medium">{m.title}</p>
              <p className="truncate text-zinc-500">
                {m.type} · from {m.from} · {m.modified}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
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
              value={opt}
              onChange={(e) =>
                patch((d) => {
                  (d.summaries as { summary: string[] }[])[si].summary[oi] =
                    e.target.value;
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
            value={d.text}
            onChange={(e) =>
              patch((dr) => {
                (dr.dialogs as { text: string }[])[di].text = e.target.value;
              })
            }
            placeholder="Front (prompt)"
            className={`${eInp} mb-1`}
          />
          <input
            value={d.answer}
            onChange={(e) =>
              patch((dr) => {
                (dr.dialogs as { answer: string }[])[di].answer = e.target.value;
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
            value={pn.content?.params?.text ?? ""}
            rows={3}
            onChange={(e) =>
              patch((d) => {
                const p2 = (d.panels as {
                  content?: { params?: { text?: string } };
                }[])[pi];
                if (!p2.content) p2.content = {};
                if (!p2.content.params) p2.content.params = {};
                p2.content.params.text = e.target.value;
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
            value={q.params?.question ?? ""}
            rows={2}
            onChange={(e) =>
              patch((d) => {
                const qq = (d.questions as { params?: { question?: string } }[])[qi];
                if (!qq.params) qq.params = {};
                qq.params.question = e.target.value;
              })
            }
            className={`${eInp} mb-1`}
          />
          {(q.params?.answers ?? []).map((a, ai) => (
            <input
              key={ai}
              value={a.text}
              onChange={(e) =>
                patch((d) => {
                  const qq = (d.questions as {
                    params?: { answers?: { text: string }[] };
                  }[])[qi];
                  if (!qq.params) qq.params = {};
                  if (!qq.params.answers) qq.params.answers = [];
                  qq.params.answers[ai].text = e.target.value;
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
}) {
  const [viewChoice, setViewChoice] = useState<"review" | "play">("review");
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

      {view === "play" ? (
        p.item.hostPrepared && p.value ? (
          <>
            <H5PRender
              h5pJsonPath={p.item.render.h5pJsonPath}
              librariesPath={p.item.render.librariesPath}
              renderKey={p.item.id}
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
                    value={c.question}
                    onChange={(e) =>
                      updateChoice(ci, { question: e.target.value })
                    }
                    rows={2}
                    className="w-full rounded border border-zinc-300 p-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                ) : (
                  <p className="font-medium">
                    {ci + 1}. {c.question}
                  </p>
                )}
                <ul className="mt-1 space-y-0.5">
                  {c.answers.map((a, ai) =>
                    p.editing ? (
                      <li key={ai}>
                        <input
                          value={a}
                          onChange={(e) => {
                            const answers = [...c.answers];
                            answers[ai] = e.target.value;
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
                        {a}
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
