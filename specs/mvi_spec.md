# MVI Spec — H5P Smart Import Twin (Sprint 2)

_Created 2026-08-30. Full UX proposal + roadmap: `specs/smart-import-ux.md`._

## What this is

A **working twin of H5P.com's Smart Import** — same input (a source + an activity choice), same
kind of output (H5P content.json rendered in the real player) — with the **reworked educator
workflow** layered on top and demoed as if live. The twin is the vehicle for prototyping and
pressure-testing the workflow changes before H5P engineering commits to them.

All generated content comes strictly from the source the educator provides in the app. Nothing is
canned or pre-seeded.

## Demo objective (Sprint 2, Sep 13, live)

Show the reworked flow end-to-end on a source chosen live, and ask mentors: *"Would you trust this
enough to put it in front of learners with only light review?"* — the retention question, since
Smart Import's W1→W2 retention is ~20%.

## Scope — IN

- **Source**: Pasted Text and Wikipedia URL (the two lowest-risk, highest-signal inputs).
- **Screen 1 — Configure**: automatic source read-back (type, length, key concepts, existing-
  question detection); intent authoring (free-form prompt + guided-brief toggle + presets +
  "improve prompt"); recommended activities pre-checked from source + intent.
- **Screen 2 — Select Activities**: real Smart Import catalog grouped by category, recommendations
  badged. Skippable via "Quick generate".
- **Screen 3 — Review & Approve**: proposed-content list; **live interactive H5P preview per
  item** in the real player; per-item **Approve / Edit / Discard** (inline question/answer
  editor); trust signals (source-sentence grounding, answer-key note, confidence, extracted-vs-
  inferred); everything approved by default.
- **Twin engine**: `POST /api/twin` — source + intent → `{ plan, items:[{contentType,
  contentJson, grounding, answerKeyNote, confidence}] }`. Model engine (AI Gateway / Anthropic)
  when a key is set; deterministic mock otherwise.

## Scope — OUT (Final Demo / roadmap)

- Screens 4–5 (Refine workspace, Place & Finish with destination + provenance).
- `.pptx` and other source types.
- Content types beyond the 9 wired for live preview — Single Choice Set, Summary, Question Set,
  Dialog Cards (conceptual / contextual), Drag the Words, Crossword, Glossary: Difficult words,
  Glossary: Key concepts. Still catalogue-only: Higher-Order Questions (Essay), Interactive Book,
  The Chase (proprietary), Interactive Video (no video source).
- Auth, multi-user, persistence, credits accounting.

## Architecture

| Layer | Impl |
|---|---|
| UI | Next.js 16 App Router, one page, H5P-modal-style 3-screen flow |
| Source read-back | `POST /api/analyze` — source → `{ analysis, recommendations }` |
| Twin engine | `POST /api/twin` — model engine uses a **format-only** structure reference (no topic content); output is grounded strictly in the provided source |
| Renderer | `h5p-standalone` in the browser. `scripts/prepare-h5p.mjs` fetches library bundles from the **H5P content-type hub API** (`api.h5p.org/v1/content-types/<name>`) — one GET per type, returns the library + all deps + a real example `content.json` — and extracts them to `public/h5p/<host>/`. The twin's generated `content.json` is written to `public/h5p/_render/<id>/` at request time and rendered against those libraries. The extracted example is also the model's structure reference. |

## Definition of done (Sprint 2)

A working app where, on a source pasted live: automatic read-back → recommended activities →
generate → a proposed-content list with a live playable H5P preview per item and trust signals →
approve / edit / discard → create. Runs end-to-end in one sitting, and the whole path (source →
approved set) is faster than today's Smart Import path (source → cleaned-up content).

## Top risks

- **Twin believability** — generated `content.json` must be valid H5P and the questions must be
  good enough that the demo lands. Mitigation: format-locked structure reference; model engine;
  live preview so the audience judges real output.
- **TTV regression** — the review screen must not make the job slower. Mitigation: auto read-back,
  pre-checked recommendations, Quick-generate path, approved-by-default review.
