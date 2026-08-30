"use client";

import { useMemo, useState } from "react";
import { CONTENT_TYPES, CATEGORIES, contentType } from "@/lib/h5p/contentTypes";
import type { ImportIntent, TwinResult, SourceAnalysis } from "@/lib/types";
import H5PRender from "@/components/H5PRender";

type Screen = "configure" | "activities" | "review";

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
interface Sample {
  name: string;
  mainLibrary: string;
  sourceHint: string;
  h5pJsonPath: string;
}

const SOURCE_TABS = ["File", "YouTube", "Wikipedia", "Web Page", "Pasted Text"] as const;

const DEFAULT_INTENT: ImportIntent = {
  prompt: "",
  learningGoal: "",
  audienceLevel: "beginner",
  emphasis: "balanced",
  language: "English",
  mode: "generate",
  contentTypes: [],
};

export default function Page() {
  const [screen, setScreen] = useState<Screen>("configure");
  const [sourceTab, setSourceTab] = useState<(typeof SOURCE_TABS)[number]>("Pasted Text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<ImportIntent>(DEFAULT_INTENT);
  const [briefOpen, setBriefOpen] = useState(false);

  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<ApiResult | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recByName = useMemo(
    () => Object.fromEntries(recs.map((r) => [r.name, r])),
    [recs],
  );

  async function analyze() {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: { kind: "text", value: text }, intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      setRecs(data.recommendations);
      // pre-check recommended activities
      setIntent((i) => ({
        ...i,
        contentTypes: data.recommendations
          .filter((r: Recommendation) => r.recommended)
          .map((r: Recommendation) => r.name),
      }));
      fetch("/api/samples")
        .then((r) => r.json())
        .then((d) => setSamples(d.samples ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: { kind: "text", value: text },
          intent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      setResult(data);
      setApproved(new Set(data.items.map((i: RenderedItem) => i.id)));
      setSelectedItem(data.items[0]?.id ?? null);
      setScreen("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  function toggleType(name: string) {
    setIntent((i) => ({
      ...i,
      contentTypes: i.contentTypes.includes(name)
        ? i.contentTypes.filter((t) => t !== name)
        : [...i.contentTypes, name],
    }));
  }
  function toggleApprove(id: string) {
    setApproved((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const approvedItems = result?.items.filter((i) => approved.has(i.id)) ?? [];
  const current = result?.items.find((i) => i.id === selectedItem) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
      {/* modal-style shell */}
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
                intent,
                setIntent,
                briefOpen,
                setBriefOpen,
                analysis,
                analyze,
                analyzing,
              }}
            />
          )}

          {screen === "activities" && (
            <Activities
              intent={intent}
              toggleType={toggleType}
              recByName={recByName}
            />
          )}

          {screen === "review" && result && (
            <Review
              result={result}
              approved={approved}
              toggleApprove={toggleApprove}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              current={current}
              samples={samples}
            />
          )}
        </div>

        {/* footer nav */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <span className="text-xs text-zinc-400">
            {screen === "review" && result
              ? `${approvedItems.length} of ${result.items.length} approved · engine: ${result.engine}`
              : analysis
                ? `Source: ${analysis.kind}, ${analysis.wordCount} words, ${analysis.detectedQuestions} question marks`
                : ""}
          </span>
          <div className="flex gap-2">
            {screen === "activities" && (
              <button onClick={() => setScreen("configure")} className={btnGhost}>
                Back
              </button>
            )}
            {screen === "review" && (
              <button onClick={() => setScreen("activities")} className={btnGhost}>
                Back
              </button>
            )}
            {screen === "configure" && (
              <button
                onClick={() => setScreen("activities")}
                disabled={!analysis}
                className={btnPrimary}
              >
                Next: Select activities
              </button>
            )}
            {screen === "activities" && (
              <button
                onClick={generate}
                disabled={generating || !intent.contentTypes.length}
                className={btnPrimary}
              >
                {generating ? "Generating…" : "Generate & review"}
              </button>
            )}
            {screen === "review" && (
              <button
                disabled={!approvedItems.length}
                className={btnPrimary}
                onClick={() =>
                  alert(
                    `Screen 5 (Place & Finish): ${approvedItems.length} approved item(s) would be created in a chosen destination folder with provenance attached. Not built in this slice.`,
                  )
                }
              >
                Approve {approvedItems.length} & create
              </button>
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
  "rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700";

function Stepper({ screen }: { screen: Screen }) {
  const steps: [Screen, string][] = [
    ["configure", "Configure Content"],
    ["activities", "Select Activities"],
    ["review", "Review & Approve"],
  ];
  const idx = steps.findIndex(([s]) => s === screen);
  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
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
          <span className={i === idx ? "font-medium" : "text-zinc-400"}>
            {label}
          </span>
          {i < steps.length - 1 && <span className="text-zinc-300">———</span>}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Screen 1 ---------------- */

function Configure(p: {
  sourceTab: string;
  setSourceTab: (s: (typeof SOURCE_TABS)[number]) => void;
  title: string;
  setTitle: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  intent: ImportIntent;
  setIntent: (f: (i: ImportIntent) => ImportIntent) => void;
  briefOpen: boolean;
  setBriefOpen: (b: boolean) => void;
  analysis: SourceAnalysis | null;
  analyze: () => void;
  analyzing: boolean;
}) {
  const set = (patch: Partial<ImportIntent>) =>
    p.setIntent((i) => ({ ...i, ...patch }));
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Source material</p>
        <div className="mb-3 flex gap-1 text-xs">
          {SOURCE_TABS.map((t) => (
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
              placeholder="Paste source text here… (min 550 characters)"
              className="w-full rounded-md border border-zinc-300 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
            {p.sourceTab} ingestion isn’t built in this slice — use <b>Pasted Text</b>.
            (<code>.pptx</code> as a first-class source is Phase 2 in the spec.)
          </p>
        )}
      </div>

      {/* intent authoring */}
      <div className="space-y-3">
        <p className="text-sm font-medium">
          What do you want? <span className="text-zinc-400">(intent)</span>
        </p>
        <textarea
          value={p.intent.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          rows={2}
          placeholder="e.g. Assessment for first-year undergrads. Focus on the three boundary types and the evidence. Plain language."
          className="w-full rounded-md border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => p.setBriefOpen(!p.briefOpen)}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            {p.briefOpen ? "Hide" : "Use"} guided brief
          </button>
          {["Exam revision", "Introduce a topic", "Check prior knowledge"].map(
            (preset) => (
              <button
                key={preset}
                onClick={() => set({ prompt: presetPrompt(preset) })}
                className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                {preset}
              </button>
            ),
          )}
          <button
            onClick={() =>
              set({
                prompt: p.intent.prompt
                  ? `${p.intent.prompt.trim()} Be specific about measurable objectives, audience level, and the concepts to prioritise.`
                  : p.intent.prompt,
              })
            }
            className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            ✨ Improve this prompt
          </button>
        </div>

        {p.briefOpen && (
          <div className="grid gap-3 rounded-md border border-zinc-200 p-3 text-sm sm:grid-cols-2 dark:border-zinc-800">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Learning goal</span>
              <input
                value={p.intent.learningGoal}
                onChange={(e) => set({ learningGoal: e.target.value })}
                className="w-full rounded border border-zinc-300 p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Audience level</span>
              <select
                value={p.intent.audienceLevel}
                onChange={(e) =>
                  set({
                    audienceLevel: e.target
                      .value as ImportIntent["audienceLevel"],
                  })
                }
                className="w-full rounded border border-zinc-300 p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Emphasis</span>
              <select
                value={p.intent.emphasis}
                onChange={(e) =>
                  set({ emphasis: e.target.value as ImportIntent["emphasis"] })
                }
                className="w-full rounded border border-zinc-300 p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="balanced">Balanced</option>
                <option value="assessment">Assessment-heavy</option>
                <option value="concept_explanation">Concept explanation</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">Language</span>
              <input
                value={p.intent.language}
                onChange={(e) => set({ language: e.target.value })}
                className="w-full rounded border border-zinc-300 p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}
      </div>

      <button
        onClick={p.analyze}
        disabled={p.analyzing || p.text.trim().length < 40}
        className="rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 disabled:opacity-40 dark:text-blue-400"
      >
        {p.analyzing ? "Analyzing…" : "Analyze source"}
      </button>

      {p.analysis && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p>
            <b>Source read-back:</b> {p.analysis.kind} material, {p.analysis.wordCount}{" "}
            words. Key concepts: {p.analysis.concepts.join(", ")}.
          </p>
          {p.analysis.detectedQuestions > 3 && (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              This source contains existing questions.{" "}
              <button
                onClick={() => set({ mode: "extract" })}
                className={`underline ${p.intent.mode === "extract" ? "font-semibold" : ""}`}
              >
                Extract as-is
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
        </div>
      )}
    </div>
  );
}

function presetPrompt(preset: string) {
  switch (preset) {
    case "Exam revision":
      return "Exam revision for students who have already studied this. Prioritise the commonly-tested points, mix recall and application, keep it concise.";
    case "Introduce a topic":
      return "First exposure to this topic for beginners. Explain the core concepts plainly, light assessment to check understanding, no jargon without definition.";
    case "Check prior knowledge":
      return "A quick diagnostic to check what learners already know before teaching. Short, low-stakes, spread across the main sub-topics.";
    default:
      return "";
  }
}

/* ---------------- Screen 2 ---------------- */

function Activities(p: {
  intent: ImportIntent;
  toggleType: (n: string) => void;
  recByName: Record<string, Recommendation>;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Recommended activities are pre-checked, based on your source and intent.
        Everything is overridable.
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
                    onClick={() => p.toggleType(ct.name)}
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
                          <span
                            className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800"
                            title="No live preview substrate yet"
                          >
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
  approved: Set<string>;
  toggleApprove: (id: string) => void;
  selectedItem: string | null;
  setSelectedItem: (id: string) => void;
  current: RenderedItem | null;
  samples: Sample[];
}) {
  const { result, current } = p;
  const sample = current
    ? p.samples.find((s) => s.mainLibrary.split(" ")[0] === current.contentType)
    : undefined;
  const totalItems = result.items.reduce(
    (n, i) => n + (Array.isArray((i.contentJson as { choices?: [] })?.choices) ? (i.contentJson as { choices: [] }).choices.length : 1),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <b>Plan:</b> {result.planNarrative}
        <span className="ml-2 text-xs text-zinc-400">
          ~{totalItems} items · would use {result.items.length} generation(s)
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
        {/* proposed content list */}
        <ul className="space-y-2">
          {result.items.map((item) => {
            const def = contentType(item.contentType);
            return (
              <li
                key={item.id}
                className={`rounded-md border p-2 ${
                  p.selectedItem === item.id
                    ? "border-blue-600"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={p.approved.has(item.id)}
                    onChange={() => p.toggleApprove(item.id)}
                  />
                  <button
                    className="text-left"
                    onClick={() => p.setSelectedItem(item.id)}
                  >
                    <p className="text-sm font-medium">{def?.label}</p>
                    <p className="text-[11px] text-zinc-500">
                      {item.concepts.slice(0, 3).join(", ")}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {item.provenance === "extracted"
                        ? "extracted from source"
                        : "inferred"}{" "}
                      · confidence {item.confidence ?? "—"}
                    </p>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* preview + trust */}
        <div className="space-y-3">
          {current ? (
            <>
              <div className="flex gap-2 text-xs">
                {["Approve", "Drop", "Regenerate"].map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      if (a === "Approve" && !p.approved.has(current.id))
                        p.toggleApprove(current.id);
                      if (a === "Drop" && p.approved.has(current.id))
                        p.toggleApprove(current.id);
                      if (a === "Regenerate")
                        alert(
                          "Regenerate one item — Phase 1 in the spec; not wired in this slice.",
                        );
                    }}
                    className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  >
                    {a}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-blue-600">
                    TWIN OUTPUT (live)
                  </p>
                  {current.hostPrepared && current.contentJson ? (
                    <H5PRender
                      h5pJsonPath={current.render.h5pJsonPath}
                      librariesPath={current.render.librariesPath}
                      renderKey={current.id}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
                      No render substrate for {current.contentType} yet. Add a real
                      .h5p to data/ and run scripts/prepare-h5p.mjs.
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-zinc-500">
                    REAL SMART IMPORT{" "}
                    {sample ? `(${sample.sourceHint})` : "— none captured"}
                  </p>
                  {sample ? (
                    <H5PRender
                      h5pJsonPath={sample.h5pJsonPath}
                      renderKey={`s-${sample.name}`}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
                      No captured real output for this type.
                    </div>
                  )}
                </div>
              </div>

              {/* trust signals */}
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
                  {JSON.stringify(current.contentJson, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-zinc-400">Select an item to preview.</p>
          )}
        </div>
      </div>
    </div>
  );
}
