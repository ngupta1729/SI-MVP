"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_TYPES, CATEGORIES, contentType } from "@/lib/h5p/contentTypes";
import { INTENT_PRESETS, isPreset } from "@/lib/intent-presets";
import type { ImportIntent, TwinResult, SourceAnalysis } from "@/lib/types";
import H5PRender from "@/components/H5PRender";

type Screen = "configure" | "activities" | "review";
type SourceTab = "Pasted Text" | "Wikipedia";

type RenderedItem = TwinResult["items"][number] & {
  render: { librariesPath: string; h5pJsonPath: string };
  hostPrepared: boolean;
};
type ApiResult = Omit<TwinResult, "items"> & { items: RenderedItem[] };
interface Recommendation {
  name: string;
  recommended: boolean;
  reason: string;
}

const DEFAULT_INTENT: ImportIntent = {
  authoringMode: "prompt",
  prompt: "",
  learningGoal: "",
  audienceLevel: "beginner",
  emphasis: "balanced",
  volume: "standard",
  language: "English",
  mode: "generate",
  contentTypes: [],
};

type ItemState = "approved" | "editing" | "discarded";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("configure");
  const [sourceTab, setSourceTab] = useState<SourceTab>("Pasted Text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [wikiUrl, setWikiUrl] = useState("");
  const [intent, setIntent] = useState<ImportIntent>(DEFAULT_INTENT);

  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<ApiResult | null>(null);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recByName = useMemo(
    () => Object.fromEntries(recs.map((r) => [r.name, r])),
    [recs],
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
      setIntent((i) =>
        i.contentTypes.length
          ? i
          : {
              ...i,
              contentTypes: data.recommendations
                .filter((r: Recommendation) => r.recommended)
                .map((r: Recommendation) => r.name),
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  // TTV: auto-analyze shortly after the source stops changing.
  useEffect(() => {
    if (!sourceReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(analyze, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, wikiUrl, sourceTab, intent.emphasis]);

  async function generate(useRecommended = false) {
    setGenerating(true);
    setError(null);
    try {
      const contentTypes = useRecommended
        ? recs.filter((r) => r.recommended).map((r) => r.name)
        : intent.contentTypes;
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

  const approvedIds = result
    ? result.items.filter((i) => itemState[i.id] === "approved").map((i) => i.id)
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
                analysis,
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
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <span className="text-xs text-zinc-400">
            {screen === "review" && result
              ? `${approvedIds.length}/${result.items.length} approved · engine: ${result.engine}`
              : analysis
                ? `${analysis.kind}, ${analysis.wordCount} words${
                    analysis.detectedQuestions > 3
                      ? ` · ${analysis.detectedQuestions} existing questions`
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
                  onClick={() => generate(true)}
                  disabled={!analysis || generating}
                  className={btnGhost}
                  title="Skip activity selection — generate with the recommended set"
                >
                  {generating ? "…" : "Quick generate"}
                </button>
                <button
                  onClick={() => setScreen("activities")}
                  disabled={!analysis}
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
                  onClick={() => generate(false)}
                  disabled={generating || !intent.contentTypes.length}
                  className={btnPrimary}
                >
                  {generating ? "Generating…" : "Generate & review"}
                </button>
              </>
            )}
            {screen === "review" && (
              <>
                <button onClick={() => setScreen("activities")} className={btnGhost}>
                  Back
                </button>
                <button
                  disabled={!approvedIds.length}
                  className={btnPrimary}
                  onClick={() =>
                    alert(
                      `Place & Finish: ${approvedIds.length} approved item(s) → chosen destination folder with provenance. Not built in this slice.`,
                    )
                  }
                >
                  Approve {approvedIds.length} &amp; create
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

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
  const idx = steps.findIndex(([s]) => s === screen);
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
  const pristinePreset = isPreset(p.intent.prompt);
  const canImprove = promptMode && p.intent.prompt.trim().length > 0 && !pristinePreset;
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Intent</p>
          <span className="text-xs text-zinc-400">— choose one way to say what you want</span>
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
            <textarea
              value={p.intent.prompt}
              onChange={(e) => set({ prompt: e.target.value, mode: "generate" })}
              rows={3}
              placeholder="e.g. Assessment for first-year undergrads. Focus on the three boundary types and the evidence. Plain language."
              className="w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-400">Start from:</span>
              {INTENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    set({ prompt: preset.prompt, mode: preset.mode })
                  }
                  className={`rounded-md border px-2 py-1 ${
                    p.intent.prompt.trim() === preset.prompt.trim()
                      ? "border-blue-600 font-medium"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {canImprove && (
                <button
                  onClick={() =>
                    set({
                      prompt: `${p.intent.prompt.trim()} Be specific about measurable objectives, the audience level, and which concepts from the source to prioritise. State how many questions and their difficulty.`,
                    })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ✨ Improve this prompt
                </button>
              )}
            </div>
            {pristinePreset && (
              <p className="text-[11px] text-zinc-400">
                Using a pre-designed prompt — already written to best practice. Edit
                it to make it your own.
              </p>
            )}
          </>
        ) : (
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
        )}
      </div>

      {(p.analyzing || p.analysis) && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {p.analyzing && !p.analysis ? (
            <p className="text-zinc-500">Reading the source…</p>
          ) : p.analysis ? (
            <>
              <p>
                <b>Source read-back:</b> {p.analysis.kind} material,{" "}
                {p.analysis.wordCount} words. Key concepts:{" "}
                {p.analysis.concepts.join(", ")}.
              </p>
              {p.analysis.detectedQuestions > 3 && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                  This source contains existing questions.{" "}
                  <button
                    onClick={() => {
                      const ex = INTENT_PRESETS.find(
                        (x) => x.id === "extract-questions",
                      )!;
                      set(
                        promptMode
                          ? { mode: "extract", prompt: ex.prompt }
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
              <p className="mt-2 text-xs text-zinc-500">
                Suggested objectives: {p.analysis.suggestedObjectives.join(" · ")}
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
                      <p className="mt-1 text-[11px] text-zinc-400">{rec.reason}</p>
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

function Review(p: {
  result: ApiResult;
  itemState: Record<string, ItemState>;
  setItem: (id: string, s: ItemState) => void;
  edits: Record<string, unknown>;
  setEdits: (f: (e: Record<string, unknown>) => Record<string, unknown>) => void;
  selected: string | null;
  setSelected: (id: string) => void;
  current: RenderedItem | null;
}) {
  const { result, current } = p;

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
                  onClick={() => p.setSelected(item.id)}
                >
                  <p className="text-sm font-medium">{def?.label}</p>
                  <p className="text-[11px] text-zinc-500">
                    {item.concepts.slice(0, 3).join(", ")}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {item.provenance ?? "inferred"} · confidence{" "}
                    {item.confidence ?? "—"} ·{" "}
                    <span
                      className={
                        st === "approved"
                          ? "text-emerald-600"
                          : st === "discarded"
                            ? "text-red-500"
                            : "text-amber-600"
                      }
                    >
                      {st}
                    </span>
                  </p>
                </button>
                <div className="mt-1 flex gap-1 text-[11px]">
                  {(["approved", "editing", "discarded"] as ItemState[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => p.setItem(item.id, s)}
                      className={`rounded border px-1.5 py-0.5 ${
                        st === s
                          ? "border-blue-600 font-medium"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {s === "approved" ? "Approve" : s === "editing" ? "Edit" : "Discard"}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="space-y-3">
          {current ? (
            <>
              {p.itemState[current.id] === "editing" && (
                <InlineEditor
                  item={current}
                  value={p.edits[current.id] ?? current.contentJson}
                  onChange={(v) =>
                    p.setEdits((e) => ({ ...e, [current.id]: v }))
                  }
                />
              )}

              <div>
                <p className="mb-1 text-[11px] font-medium text-blue-600">
                  LIVE PREVIEW
                </p>
                {current.hostPrepared && current.contentJson ? (
                  <H5PRender
                    h5pJsonPath={current.render.h5pJsonPath}
                    librariesPath={current.render.librariesPath}
                    renderKey={current.id}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
                    Live preview for {current.contentType} needs its H5P library
                    bundle — drop a .h5p of this type into data/ and run
                    scripts/prepare-h5p.mjs.
                  </div>
                )}
              </div>

              <div className="rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
                <p className="font-medium">Trust signals</p>
                <p className="mt-1 text-zinc-500">
                  <b>Grounded in:</b>{" "}
                  {current.grounding ? `“${current.grounding}”` : "—"}
                </p>
                <p className="mt-1 text-zinc-500">
                  <b>Answer key:</b> {current.answerKeyNote ?? "—"}
                </p>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-400">
                  twin content.json
                </summary>
                <pre className="mt-1 max-h-56 overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-900">
                  {JSON.stringify(
                    p.edits[current.id] ?? current.contentJson,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-zinc-400">Select an item.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineEditor(p: {
  item: RenderedItem;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const choices =
    (p.value as { choices?: { question: string; answers: string[] }[] })
      ?.choices ?? [];
  if (!choices.length) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
        Inline editing for {p.item.contentType} isn’t wired in this slice — use the
        JSON view below.
      </p>
    );
  }
  const update = (
    ci: number,
    patch: Partial<{ question: string; answers: string[] }>,
  ) => {
    const next = structuredClone(p.value) as {
      choices: { question: string; answers: string[] }[];
    };
    next.choices[ci] = { ...next.choices[ci], ...patch };
    p.onChange(next);
  };
  return (
    <div className="space-y-2 rounded-md border border-blue-300 bg-blue-50/40 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/20">
      <p className="font-medium">Edit questions</p>
      {choices.map((c, ci) => (
        <div key={ci} className="space-y-1 border-t border-blue-200 pt-2 first:border-0 dark:border-blue-900">
          <input
            value={c.question}
            onChange={(e) => update(ci, { question: e.target.value })}
            className="w-full rounded border border-zinc-300 p-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {c.answers.map((a, ai) => (
            <input
              key={ai}
              value={a}
              onChange={(e) => {
                const answers = [...c.answers];
                answers[ai] = e.target.value;
                update(ci, { answers });
              }}
              className={`w-full rounded border p-1 ${
                ai === 0
                  ? "border-emerald-400"
                  : "border-zinc-300 dark:border-zinc-700"
              } dark:bg-zinc-900`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
