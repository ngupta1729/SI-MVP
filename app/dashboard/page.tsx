import Link from "next/link";
import {
  readImports,
  readEvents,
  computeMetrics,
  type DashboardMetrics,
  type CountRow,
  type ExperienceMetrics,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Smart Import — quality & experience" };

export default async function DashboardPage() {
  const [imports, events] = await Promise.all([readImports(), readEvents()]);
  const m = computeMetrics(imports, events);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 text-sm">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-lg font-semibold">
            Smart Import — quality &amp; experience
          </h1>
          <p className="text-xs text-zinc-400">
            H5P team view · {m.fileState.importCount} imports ·{" "}
            {m.fileState.eventCount} review events · refreshed{" "}
            {new Date(m.generatedAt).toLocaleString()}
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back to Manage Content
        </Link>
      </header>

      {m.empty ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <QualitySection m={m} />
          <ExperienceSection x={m.experience} />
        </div>
      )}
    </main>
  );
}

/* --------------------------- primitives --------------------------- */

const card =
  "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-zinc-400">{lead}</p>
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
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const mn = Math.floor(s / 60);
  return `${mn}m ${String(s % 60).padStart(2, "0")}s`;
}

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
      <span className="w-16 shrink-0 text-right tabular-nums text-zinc-500">
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
  if (!rows.length) return <p className="text-xs text-zinc-400">{empty}</p>;
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

/* --------------------------- sections --------------------------- */

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
      No imports yet. Run a Smart Import (
      <Link href="/" className="underline">
        Manage Content
      </Link>
      ) and reload.
    </div>
  );
}

const SEG: Array<{ key: string; label: string; cls: string }> = [
  { key: "cleanKeep", label: "kept as-is", cls: "bg-emerald-500 dark:bg-emerald-400" },
  { key: "edited", label: "edited", cls: "bg-amber-400 dark:bg-amber-500" },
  { key: "refined", label: "refined", cls: "bg-sky-400 dark:bg-sky-500" },
  { key: "remixed", label: "remixed", cls: "bg-violet-400 dark:bg-violet-500" },
  { key: "discarded", label: "discarded", cls: "bg-zinc-300 dark:bg-zinc-600" },
];

function QualitySection({ m }: { m: DashboardMetrics }) {
  const o = m.gate.outcome;
  const h = m.headline;
  return (
    <Section
      title="Output quality"
      lead="How much of the first generated output educators trust — and what they change when they don't."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Activities created" value={h.activitiesCreated} />
        <Stat
          label="Kept as-is"
          value={pct(h.approveWithoutEditRate)}
          hint={`of ${h.approveWithoutEditN} kept — no edit, refine or remix`}
        />
        <Stat
          label="Refined before keeping"
          value={pct(ratio(o.edited + o.refined + o.remixed, o.total))}
          hint={`${o.edited} edited · ${o.refined} refined · ${o.remixed} remixed`}
        />
        <Stat
          label="Discarded"
          value={pct(ratio(o.discarded, o.total))}
          hint={`${o.discarded} of ${o.total} generated`}
        />
      </div>

      <div className={card}>
        <p className="mb-2 text-sm font-medium">
          Every generated activity ends in one bucket
        </p>
        <div className="mb-2 flex h-3 w-full overflow-hidden rounded">
          {SEG.map((s) => {
            const v = o[s.key as keyof typeof o];
            return v > 0 ? (
              <span
                key={s.key}
                className={s.cls}
                style={{ width: `${(v / o.total) * 100}%` }}
                title={`${s.label}: ${v}`}
              />
            ) : null;
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          {SEG.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${s.cls}`} />
              {s.label} {o[s.key as keyof typeof o]}
            </span>
          ))}
          <span className="text-zinc-400">· {o.total} total</span>
        </div>
      </div>

      <div className={card}>
        <p className="mb-3 text-sm font-medium">By activity type</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left font-normal text-zinc-400">
                <th className="pb-1 pr-3 font-normal">Type</th>
                <th className="pb-1 pr-3 text-right font-normal">generated</th>
                <th className="pb-1 pr-3 text-right font-normal">kept as-is</th>
                <th className="pb-1 pr-3 text-right font-normal">refined</th>
                <th className="pb-1 text-right font-normal">discarded</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {m.gate.byContentType.map((r) => (
                <tr
                  key={r.contentType}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-1 pr-3">{r.label}</td>
                  <td className="py-1 pr-3 text-right">{r.generated}</td>
                  <td className="py-1 pr-3 text-right">
                    {pct(r.cleanApprovePct)}
                  </td>
                  <td className="py-1 pr-3 text-right">{r.refined || ""}</td>
                  <td className="py-1 text-right">{r.discarded || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <p className="mb-2 text-sm font-medium">Why activities get discarded</p>
          <BarList
            rows={countRows(m.feedback.discardReasons)}
            empty="nothing discarded"
          />
        </div>
        <div className={card}>
          <p className="mb-2 text-sm font-medium">What refine asks for</p>
          <BarList
            rows={countRows(m.feedback.refineSteers)}
            empty="no refines yet"
          />
          <p className="mt-2 text-[11px] text-zinc-400">
            The most-reached-for steer is the generation default to change.
          </p>
        </div>
      </div>
    </Section>
  );
}

function ExperienceSection({ x }: { x: ExperienceMetrics }) {
  const answered = x.again.likely + x.again.maybe + x.again.unlikely;
  return (
    <Section
      title="Experience"
      lead="How the run felt — the end-of-flow survey, plus how long each part took."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Avg rating"
          value={x.ratingAvg == null ? "—" : `${x.ratingAvg}★`}
          hint={x.ratingN ? `${x.ratingN} rated` : "no ratings yet"}
        />
        <Stat
          label="Likely to use again"
          value={pct(ratio(x.again.likely, answered))}
          hint={
            answered
              ? `${x.again.likely} likely · ${x.again.maybe} maybe · ${x.again.unlikely} unlikely`
              : "not asked yet"
          }
        />
        <Stat
          label="Time to first draft"
          value={fmtMs(x.medianBuildMs)}
          hint="median · setup + activities + generate"
        />
        <Stat
          label="Review & approve"
          value={fmtMs(x.medianReviewMs)}
          hint={
            x.timedN
              ? `median · ${fmtMs(x.medianTotalMs)} total`
              : "no timings yet"
          }
        />
      </div>

      {x.ratingN > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className="mb-2 text-sm font-medium">Rating spread</p>
            <BarList
              rows={[5, 4, 3, 2, 1].map((n) => ({
                label: `${n}★`,
                value: x.ratingDist[n] ?? 0,
                trailing: String(x.ratingDist[n] ?? 0),
              }))}
            />
          </div>
          <div className={card}>
            <p className="mb-2 text-sm font-medium">
              Likely to use it for the next activity?
            </p>
            <BarList
              rows={[
                { label: "Likely", value: x.again.likely },
                { label: "Maybe", value: x.again.maybe },
                { label: "Unlikely", value: x.again.unlikely },
              ]}
            />
          </div>
        </div>
      )}

      {x.comments.length > 0 && (
        <div className={card}>
          <p className="mb-2 text-sm font-medium">
            Completion survey — what would make Smart Import more useful
          </p>
          <ul className="space-y-2">
            {x.comments.map((c, i) => (
              <li
                key={i}
                className="border-l-2 border-zinc-200 pl-3 text-xs dark:border-zinc-700"
              >
                <p className="text-zinc-700 dark:text-zinc-200">
                  &ldquo;{c.text}&rdquo;
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {c.rating}★{c.again ? ` · ${c.again}` : ""} · {c.importName} ·{" "}
                  {new Date(c.at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AbandonSurveySection a={x.abandon} />
    </Section>
  );
}

const ABANDON_LABEL: Record<string, string> = {
  configure: "Left at Configure",
  activities: "Left at Choose activities",
  review: "Left at Review (generated, not created)",
};

function AbandonSurveySection({
  a,
}: {
  a: ExperienceMetrics["abandon"];
}) {
  if (a.total === 0) {
    return (
      <div className={card}>
        <p className="text-sm font-medium">Abandon survey — by step</p>
        <p className="mt-1 text-xs text-zinc-400">
          Nobody has answered the leave-the-flow survey yet. It fires when
          someone closes the flow after a real attempt, tagged with the step.
        </p>
      </div>
    );
  }
  return (
    <div className={card}>
      <p className="mb-1 text-sm font-medium">
        Abandon survey — {a.total} left the flow
      </p>
      <p className="mb-3 text-xs text-zinc-400">
        Where people drop, and why. Each step asks its own question.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {a.byStep.map((s) => {
          const answered = s.putOff.no + s.putOff.abit + s.putOff.yes;
          return (
            <div
              key={s.step}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <p className="text-xs font-medium">{ABANDON_LABEL[s.step]}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                {s.count}
              </p>
              {s.reasons.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    What stopped them
                  </p>
                  <BarList
                    rows={s.reasons.map((r) => ({
                      label: r.label,
                      value: r.count,
                    }))}
                  />
                </div>
              )}
              {answered > 0 && (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Put off Smart Import: {s.putOff.yes} yes · {s.putOff.abit} a
                  bit · {s.putOff.no} no
                </p>
              )}
              {s.comments.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {s.comments.slice(0, 5).map((c, i) => (
                    <li
                      key={i}
                      className="border-l-2 border-zinc-200 pl-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      &ldquo;{c.text}&rdquo;
                      {c.reason && (
                        <span className="text-zinc-400"> · {c.reason}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

