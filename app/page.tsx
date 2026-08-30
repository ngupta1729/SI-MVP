"use client";

import { useEffect, useState } from "react";
import { CONTENT_TYPES } from "@/lib/h5p/contentTypes";
import type { ImportIntent, TwinResult } from "@/lib/types";
import H5PRender from "@/components/H5PRender";

type Stage = "intent" | "plan" | "render";

type RenderedItem = TwinResult["items"][number] & {
  render: { librariesPath: string; h5pJsonPath: string };
  hostPrepared: boolean;
};
type ApiResult = Omit<TwinResult, "items"> & { items: RenderedItem[] };
interface Sample {
  name: string;
  mainLibrary: string;
  sourceHint: string;
  renderHost: string;
  h5pJsonPath: string;
}

const DEFAULT_INTENT: ImportIntent = {
  learningGoal: "",
  audienceLevel: "beginner",
  emphasis: "balanced",
  language: "English",
  contentTypes: ["H5P.Summary", "H5P.SingleChoiceSet"],
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("intent");
  const [sourceKind, setSourceKind] = useState<"text" | "url">("text");
  const [sourceValue, setSourceValue] = useState("");
  const [intent, setIntent] = useState<ImportIntent>(DEFAULT_INTENT);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    fetch("/api/samples")
      .then((r) => r.json())
      .then((d) => setSamples(d.samples ?? []))
      .catch(() => {});
  }, []);

  function toggleType(name: string) {
    setIntent((i) => ({
      ...i,
      contentTypes: i.contentTypes.includes(name)
        ? i.contentTypes.filter((t) => t !== name)
        : [...i.contentTypes, name],
    }));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: { kind: sourceKind, value: sourceValue },
          intent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      setResult(data);
      setApproved(new Set(data.items.map((i: RenderedItem) => i.id)));
      setStage("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const approvedItems = result?.items.filter((i) => approved.has(i.id)) ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          H5P Smart Import — Twin
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          A digital twin of H5P.com Smart Import, with a reworked educator
          workflow: <b>intent → approval → render</b>. Output rendered in the real
          H5P player.
        </p>
        <Stepper stage={stage} />
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {stage === "intent" && (
        <section className="space-y-6">
          <div>
            <div className="mb-2 flex gap-2 text-sm">
              {(["text", "url"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSourceKind(k)}
                  className={`rounded-full px-3 py-1 ${
                    sourceKind === k
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {k === "text" ? "Paste text" : "URL"}
                </button>
              ))}
            </div>
            {sourceKind === "text" ? (
              <textarea
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
                rows={8}
                placeholder="Paste the source material an educator would feed Smart Import…"
                className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : (
              <input
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/Photosynthesis"
                className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Learning goal">
              <input
                value={intent.learningGoal}
                onChange={(e) =>
                  setIntent({ ...intent, learningGoal: e.target.value })
                }
                placeholder="e.g. Understand the light-dependent reactions"
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
            <Field label="Language">
              <input
                value={intent.language}
                onChange={(e) =>
                  setIntent({ ...intent, language: e.target.value })
                }
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
            <Field label="Audience level">
              <select
                value={intent.audienceLevel}
                onChange={(e) =>
                  setIntent({
                    ...intent,
                    audienceLevel: e.target
                      .value as ImportIntent["audienceLevel"],
                  })
                }
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Emphasis">
              <select
                value={intent.emphasis}
                onChange={(e) =>
                  setIntent({
                    ...intent,
                    emphasis: e.target.value as ImportIntent["emphasis"],
                  })
                }
                className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="balanced">Balanced</option>
                <option value="assessment">Assessment-heavy</option>
                <option value="concept_explanation">Concept explanation</option>
              </select>
            </Field>
          </div>

          <Field label="Content types to generate">
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map((ct) => (
                <button
                  key={ct.name}
                  onClick={() => toggleType(ct.name)}
                  title={ct.blurb}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    intent.contentTypes.includes(ct.name)
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </Field>

          <button
            onClick={generate}
            disabled={loading || !sourceValue || !intent.contentTypes.length}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {loading ? "Generating…" : "Generate plan"}
          </button>
        </section>
      )}

      {stage === "plan" && result && (
        <section className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p>
              <b>Source:</b> {result.sourceSummary}
            </p>
            <p className="mt-1 text-zinc-500">{result.planNarrative}</p>
            <p className="mt-1 text-xs text-zinc-400">
              engine: {result.engine}
            </p>
          </div>

          <p className="text-sm text-zinc-500">
            Approve what should be created. This is the step Smart Import doesn’t
            have.
          </p>

          <ul className="space-y-2">
            {result.items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={approved.has(item.id)}
                    onChange={() =>
                      setApproved((s) => {
                        const n = new Set(s);
                        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                        return n;
                      })
                    }
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {item.title}{" "}
                      <span className="text-zinc-400">({item.contentType})</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Built from: {item.concepts.join(", ")}
                    </p>
                    <p className="text-xs text-zinc-500">{item.rationale}</p>
                    {!item.hostPrepared && (
                      <p className="text-xs text-amber-600">
                        No real .h5p prepared for {item.contentType} — will not
                        render until you add one to data/ and run the prepare
                        script.
                      </p>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              onClick={() => setStage("intent")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Back
            </button>
            <button
              onClick={() => setStage("render")}
              disabled={!approvedItems.length}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Approve {approvedItems.length} & render
            </button>
          </div>
        </section>
      )}

      {stage === "render" && result && (
        <section className="space-y-8">
          <button
            onClick={() => setStage("plan")}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Back to plan
          </button>

          {approvedItems.map((item) => {
            const sample = samples.find(
              (s) => s.mainLibrary.split(" ")[0] === item.contentType,
            );
            return (
              <div key={item.id} className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {item.title}{" "}
                  <span className="text-zinc-400">({item.contentType})</span>
                </h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-emerald-600">
                      TWIN OUTPUT
                    </p>
                    <H5PRender
                      h5pJsonPath={item.render.h5pJsonPath}
                      librariesPath={item.render.librariesPath}
                      renderKey={item.id}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-500">
                      REAL SMART IMPORT{" "}
                      {sample ? `(${sample.sourceHint})` : "— none captured"}
                    </p>
                    {sample ? (
                      <H5PRender
                        h5pJsonPath={sample.h5pJsonPath}
                        renderKey={`sample-${sample.name}`}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">
                        Add a real Smart Import .h5p for this content type to
                        data/ and run the prepare script to see it side-by-side.
                      </div>
                    )}
                  </div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-zinc-400">
                    twin content.json
                  </summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-900">
                    {JSON.stringify(item.contentJson, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const steps: [Stage, string][] = [
    ["intent", "1 · Intent"],
    ["plan", "2 · Approve"],
    ["render", "3 · Render"],
  ];
  return (
    <div className="mt-4 flex gap-2 text-xs">
      {steps.map(([s, label]) => (
        <span
          key={s}
          className={`rounded-full px-2.5 py-1 ${
            stage === s
              ? "bg-emerald-600 text-white"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
