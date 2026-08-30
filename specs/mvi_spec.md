# MVI Spec — H5P Smart Import Twin (Sprint 2)

_Created 2026-08-30._

## What this is

A **digital twin of H5P.com's Smart Import**, plus a reworked educator workflow layered on top,
demoed as if live. Smart Import is H5P.com-only (no open-source code), so the twin is built purely
from product-level observation — the hardest case for the whole project thesis.

## Demo objective (Sprint 2, Sep 13, live)

Put **twin fidelity on trial**. Show:
1. A real Smart Import output from h5p.com (captured `.h5p`).
2. The twin reproducing that output from the same source.
3. The reworked workflow (intent → generate) running on the twin, rendered in **real H5P**.

Feedback question for mentors/peers: _"Is this twin faithful enough that you'd trust a product
decision made on it?"_

## Scope — IN

- **Source input**: paste text, or a URL, or upload a text document (mirrors Smart Import's
  file/URL/text inputs). Video/audio sources out of scope for the MVI.
- **Intent step (the rework)**: educator states intent up front — learning goal, audience level,
  emphasis (e.g. "assessment-heavy", "concept explanation"), preferred content types, language.
  Richer than Smart Import's language + checkboxes.
- **Twin transform**: source + intent → an H5P **content plan** + `content.json` for each chosen
  content type, calibrated against captured real Smart Import outputs.
- **Approval step (the rework)**: educator sees the plan (what will be created, per-item, with the
  key concepts each is built from) and approves / drops / regenerates individual items *before*
  they are finalized — the step Smart Import doesn't have.
- **Render**: each generated item rendered live using the real open-source H5P player
  (`h5p-standalone`), by injecting `content.json` into an extracted real `.h5p`.
- **Side-by-side**: twin output next to the captured real Smart Import output for the same source.

## Scope — OUT (Final Demo / roadmap)

- Refinement of created content via natural language (the third workflow area).
- Video/audio source ingestion.
- Content types beyond the 3–4 most common Smart Import produces
  (Summary, Single Choice Set / Question Set, True/False, Flashcards).
- Auth, multi-user, persistence, credits accounting.

## Architecture

| Layer | Impl |
|---|---|
| UI | Next.js 16 App Router, one page, three panels: Intent → Plan/Approval → Render |
| Twin transform | `POST /api/twin` — source + intent → `{ plan, items: [{type, contentJson}] }`. Uses an LLM (Anthropic / AI Gateway) when a key is present; deterministic mock otherwise. |
| Calibration | Captured real Smart Import `.h5p` exports in `data/`, their `content.json` used as few-shot targets |
| Renderer | `h5p-standalone` in the browser, pointed at `/public/h5p/<type>/` (extracted real `.h5p`) with `content.json` swapped for the twin's output |

## Definition of done (Sprint 2)

A working app where: an educator enters a source + intent → sees a generated plan → approves it →
sees each generated H5P rendered live in the real player, side-by-side with the captured real
Smart Import output for the same source. Runs end-to-end in one sitting, live-demoable.

## Top quality risk

Twin fidelity — the LLM twin's `content.json` diverging from what real Smart Import produces in
ways that would mislead a PM about how a workflow change would actually land. Mitigation:
calibrate against captured real outputs; always show side-by-side; never claim more fidelity than
the comparison supports.
