import Link from "next/link";
import {
  readImports,
  readEvents,
  computeMetrics,
  type DashboardMetrics,
  type CountRow,
  type NamedRate,
  type Headline,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Smart Import — evals dashboard" };

export default async function DashboardPage() {
  const [imports, events] = await Promise.all([readImports(), readEvents()]);
  const m = computeMetrics(imports, events);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 text-sm">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-lg font-semibold">Evals &amp; feedback</h1>
          <p className="text-xs text-zinc-400">
            {m.fileState.importCount} imports · {m.fileState.eventCount} review
            events · generated {new Date(m.generatedAt).toLocaleString()}
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back to Smart Import
        </Link>
      </header>

      {m.empty ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <HeadlineRow h={m.headline} />
          <GateSection gate={m.gate} />
          <FeedbackSection fb={m.feedback} />
          <RecentImports rows={m.recentImports} />
          {m.variantSplit.length >= 1 && <AbSplit split={m.variantSplit} />}
          {m.sessions.length >= 1 && <SessionsTable rows={m.sessions} />}
          <FollowUps neverFinished={m.neverFinished.length} />
        </div>
      )}
    </main>
  );
}

/* --------------------------- primitives --------------------------- */

const card =
  "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={card}>
      <div className="mb-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Bar({
  label,
  value,
  max,
  trailing,
}: {
  label: string;
  value: number;
  max: number;
  trailing?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate text-zinc-500" title={label}>
        {label}
      </span>
      <span className="h-2 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
        <span
          className="block h-2 rounded bg-zinc-900 dark:bg-zinc-100"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums text-zinc-500">
        {trailing ?? value}
      </span>
    </div>
  );
}

function BarList({
  rows,
  empty = "none yet",
}: {
  rows: Array<{ label: string; value: number; trailing?: string }>;
  empty?: string;
}) {
  if (!rows.length)
    return <p className="text-xs text-zinc-400">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <Bar
          key={r.label}
          label={r.label}
          value={r.value}
          max={max}
          trailing={r.trailing}
        />
      ))}
    </div>
  );
}

const countRows = (rows: CountRow[]) =>
  rows.map((r) => ({ label: r.label, value: r.count }));
const rateRows = (rows: NamedRate[]) =>
  rows.map((r) => ({
    label: r.label,
    value: r.rate ?? 0,
    trailing: `${pct(r.rate)} · ${r.clean}/${r.total}`,
  }));

/* --------------------------- sections --------------------------- */

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
      No imports or review events yet.
      <br />
      Run a Smart Import (
      <Link href="/" className="underline">
        home
      </Link>
      ) and reload.
    </div>
  );
}

function HeadlineRow({ h }: { h: Headline }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Imports" value={h.imports} />
      <Stat label="Activities created" value={h.activitiesCreated} />
      <Stat
        label="Approved w/o edit"
        value={pct(h.approveWithoutEditRate)}
        hint={`n=${h.approveWithoutEditN} kept`}
      />
      <Stat
        label="Median edit size"
        value={h.medianEditChars == null ? "—" : `${h.medianEditChars}`}
        hint={`${h.editedCount} edited · chars`}
      />
      <Stat label="Refine actions" value={h.refineActions} />
      <Stat label="Discards" value={h.discards} />
    </div>
  );
}

const SEG: Array<{
  key: keyof DashboardMetrics["gate"]["outcome"];
  label: string;
  cls: string;
}> = [
  { key: "cleanKeep", label: "kept clean", cls: "bg-emerald-500 dark:bg-emerald-400" },
  { key: "edited", label: "edited", cls: "bg-amber-400 dark:bg-amber-500" },
  { key: "refined", label: "refined", cls: "bg-sky-400 dark:bg-sky-500" },
  { key: "remixed", label: "remixed", cls: "bg-violet-400 dark:bg-violet-500" },
  { key: "discarded", label: "discarded", cls: "bg-zinc-300 dark:bg-zinc-600" },
];

function GateSection({ gate }: { gate: DashboardMetrics["gate"] }) {
  const o = gate.outcome;
  return (
    <Card
      title="What people do at the gate"
      hint="Every generated activity ends in exactly one bucket. Higher “kept clean” = the first output is trusted as-is."
    >
      <div className="mb-2 flex h-3 w-full overflow-hidden rounded">
        {SEG.map((s) =>
          o[s.key] > 0 ? (
            <span
              key={s.key}
              className={s.cls}
              style={{ width: `${(o[s.key] / o.total) * 100}%` }}
              title={`${s.label}: ${o[s.key]}`}
            />
          ) : null,
        )}
      </div>
      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        {SEG.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${s.cls}`} />
            {s.label} {o[s.key]}
          </span>
        ))}
        <span className="text-zinc-400">· {o.total} total</span>
      </div>

      <div className="mb-5 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left font-normal text-zinc-400">
              <th className="pb-1 font-normal">Activity type</th>
              <th className="pb-1 pr-3 text-right font-normal">gen</th>
              <th className="pb-1 pr-3 text-right font-normal">kept</th>
              <th className="pb-1 pr-3 text-right font-normal">clean %</th>
              <th className="pb-1 pr-3 text-right font-normal">refined</th>
              <th className="pb-1 pr-3 text-right font-normal">remixed</th>
              <th className="pb-1 text-right font-normal">discarded</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {gate.byContentType.map((r) => (
              <tr
                key={r.contentType}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-1 pr-3">{r.label}</td>
                <td className="py-1 pr-3 text-right">{r.generated}</td>
                <td className="py-1 pr-3 text-right">{r.kept}</td>
                <td className="py-1 pr-3 text-right">{pct(r.cleanApprovePct)}</td>
                <td className="py-1 pr-3 text-right">{r.refined || ""}</td>
                <td className="py-1 pr-3 text-right">{r.remixed || ""}</td>
                <td className="py-1 text-right">{r.discarded || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500">
            Kept-clean rate by source
          </p>
          <BarList rows={rateRows(gate.bySourceKind)} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500">
            Kept-clean rate by engine
          </p>
          <BarList rows={rateRows(gate.byEngine)} />
        </div>
      </div>
    </Card>
  );
}

function FeedbackSection({ fb }: { fb: DashboardMetrics["feedback"] }) {
  return (
    <Card
      title="The feedback signal"
      hint="What people ask for and why they throw activities away — the labelled dataset."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500">
            Refine steers reached for
          </p>
          <BarList
            rows={countRows(fb.refineSteers)}
            empty="no refines yet"
          />
          <p className="mt-1.5 text-[11px] text-zinc-400">
            The most-reached-for steer is the generation default to change.
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500">
            Discard reasons
          </p>
          <BarList
            rows={countRows(fb.discardReasons)}
            empty="nothing discarded"
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-1.5 text-xs font-medium text-zinc-500">
          Attempt loops (3+ refines on one activity)
        </p>
        {fb.attemptLoops.length === 0 ? (
          <p className="text-xs text-zinc-400">none</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {fb.attemptLoops.map((r, i) => (
              <li key={i} className="text-zinc-600 dark:text-zinc-300">
                <b>{r.contentType}</b> · {r.sourceKind} · ×{r.refineAttempts}
                {r.steers.length ? ` — ${r.steers.join(" → ")}` : ""}
                <span className="text-zinc-400"> ({r.importName})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-zinc-400">
          A source that burns 3+ refines on a type usually can&rsquo;t support that
          type — feeds back into the recommendation engine.
        </p>
      </div>
    </Card>
  );
}

function RecentImports({
  rows,
}: {
  rows: DashboardMetrics["recentImports"];
}) {
  return (
    <Card title="Recent imports">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left font-normal text-zinc-400">
              <th className="pb-1 pr-3 font-normal">Import</th>
              <th className="pb-1 pr-3 font-normal">Date</th>
              <th className="pb-1 pr-3 font-normal">Engine</th>
              <th className="pb-1 pr-3 font-normal">Source</th>
              <th className="pb-1 pr-3 font-normal">Gen→Kept</th>
              <th className="pb-1 font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-1 pr-3">
                  {r.name}
                  {r.uiVariant && (
                    <span className="ml-1 text-[10px] text-zinc-400">
                      {r.uiVariant === "workspace" ? "B" : "A"}
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3 text-zinc-500">
                  {new Date(r.savedAt).toLocaleDateString()}
                </td>
                <td className="py-1 pr-3 text-zinc-500">
                  {r.engine}
                  {r.model ? ` · ${r.model}` : ""}
                </td>
                <td className="py-1 pr-3 text-zinc-500">
                  {r.sourceKind}
                  {r.wordCount ? ` · ${r.wordCount}w` : ""}
                </td>
                <td className="py-1 pr-3 tabular-nums">
                  {r.generated}→{r.kept}
                </td>
                <td className="py-1 text-zinc-500">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AbSplit({
  split,
}: {
  split: DashboardMetrics["variantSplit"];
}) {
  const rows: Array<[string, (h: Headline) => React.ReactNode]> = [
    ["Imports", (h) => h.imports],
    ["Activities created", (h) => h.activitiesCreated],
    ["Approved w/o edit", (h) => pct(h.approveWithoutEditRate)],
    ["Median edit size", (h) => (h.medianEditChars == null ? "—" : h.medianEditChars)],
    ["Refine actions", (h) => h.refineActions],
    ["Discards", (h) => h.discards],
  ];
  return (
    <Card
      title="A vs B"
      hint="Same metrics, split by workflow shape (A = step-by-step, B = workspace)."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left font-normal text-zinc-400">
            <th className="pb-1 font-normal">Metric</th>
            {split.map((s) => (
              <th
                key={s.variant}
                className="pb-1 pr-3 text-right font-normal capitalize"
              >
                {s.variant === "workspace" ? "B · workspace" : "A · step-by-step"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map(([label, fn]) => (
            <tr
              key={label}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-1 text-zinc-500">{label}</td>
              {split.map((s) => (
                <td key={s.variant} className="py-1 pr-3 text-right">
                  {fn(s.headline)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SessionsTable({ rows }: { rows: DashboardMetrics["sessions"] }) {
  return (
    <Card title="Sessions" hint="One row per browser (anonymous id).">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left font-normal text-zinc-400">
            <th className="pb-1 pr-3 font-normal">Session</th>
            <th className="pb-1 pr-3 font-normal">Variants</th>
            <th className="pb-1 pr-3 text-right font-normal">Imports</th>
            <th className="pb-1 pr-3 text-right font-normal">Activities</th>
            <th className="pb-1 text-right font-normal">Span</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr
              key={r.sessionId}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-1 pr-3 font-mono">{r.short}</td>
              <td className="py-1 pr-3 text-zinc-500">
                {r.variants.map((v) => (v === "workspace" ? "B" : "A")).join(" ") ||
                  "—"}
              </td>
              <td className="py-1 pr-3 text-right">{r.imports}</td>
              <td className="py-1 pr-3 text-right">{r.activitiesCreated}</td>
              <td className="py-1 text-right text-zinc-500">
                {r.spanMinutes} min
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function FollowUps({ neverFinished }: { neverFinished: number }) {
  return (
    <p className="text-xs text-zinc-400">
      {neverFinished > 0 && (
        <>
          {neverFinished} import{neverFinished === 1 ? "" : "s"} have review
          events but no saved record (mostly runs from before the record store
          existed; some abandoned before &ldquo;Create&rdquo;).{" "}
        </>
      )}
      Funnel and time-to-value rows need milestone events (
      <code className="text-[11px]">import_started</code>,{" "}
      <code className="text-[11px]">generate_completed</code>,{" "}
      <code className="text-[11px]">item_previewed</code>) — not logged this pass.
    </p>
  );
}
