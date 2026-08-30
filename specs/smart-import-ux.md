# Smart Import — Reworked Educator Workflow

_Draft, 2026-08-30._

## Context

**Smart Import** (H5P.com only) turns a source into H5P interactive content using AI. A source
document is **mandatory** — there is no from-scratch generation, so output is always grounded.
This proposal reworks the *educator workflow* on top of the existing product UI: how they express
intent, review what the AI produced, refine it, find it later, and trust it.

### The signal that shapes everything

**Smart Import W1→W2 retention is ~20%.** An 80% one-week drop after first use is not an
activation problem — people are trying it. It is a *"the first output wasn't worth coming back
for"* problem. Two causes dominate at that magnitude:

1. **Not trusted** — output was off, or the educator couldn't tell if it was right, so they
   returned to manual authoring.
2. **Cleanup cost > generation savings** — several activities generated, then an hour fixing them
   across several separate editors. Net-negative time.

Features that *compound* value (discoverability, preference memory) only help people who return.
They don't fix an 80% cliff. The roadmap sequences trust-and-cleanup first.

### Observed happy path (from a live run — "Plate Tectonics", pasted text → Single Choice Set + Summary)

1. Manage Content → **Smart Import** → **Create Content** (shows remaining import credits).
2. **Configure Content**: pick a source (File / YouTube / Wikipedia / Web Page / Pasted Text),
   optionally expand one **Customization** free-text box, choose output **language**. → Next
3. **Select Activities**: check any number from 4 categories (Test Knowledge / Present Content /
   Practice & Games / Interactive Media). No per-activity config. → Generate
4. **Generating Content** (~15–30s for two activities) → each activity becomes a **separate H5P
   content item** dumped flat into one "Smart Import" folder.
5. **Refine**: open each item → full H5P editor, or View. Export via player Reuse → Download `.h5p`.

### Core friction

| Stage | Problem |
|---|---|
| Intent | One optional, collapsed free-text box. Blank-page problem. |
| Activity selection | Blind checkboxes. No fit-to-source signal, no counts, no coverage view. |
| Generation | Credits spent with **no preview**. Black-box wait. |
| Output | Activities generated independently → concept overlap, no coherent lesson. |
| Refinement | Per-artifact, in the full editor. No targeted regen, no natural-language edit. |
| Discoverability | Every import lands flat in one folder; session→content link is a title prefix. |
| Trust | Educator can't verify correctness fast; no grounding, no justification, no track record. |

---

## The reworked workflow (screen by screen, on top of the existing modal)

The existing Smart Import modal has a stepper: **Configure Content → Select Activities**. The
rework keeps that shell and inserts new steps.

### Screen 1 — Configure Content _(existing, enhanced)_

- **Source tabs** unchanged: File · YouTube · Wikipedia · Web Page · Pasted Text.
- **NEW — Source read-back** (after a source is added): detected type, length, key concepts, and
  *"this document contains N existing questions"* detection.
- **NEW — Question handling** when questions are detected:
  **[Extract as-is]** · **[Generate new]** · **[Both]**. Extraction lifts the educator's own
  questions into the target H5P type with minimal rewriting — faster, and their own wording.
- **NEW — Intent authoring** replaces the single Customization box (free-form stays the default
  view): four on-ramps — free-form prompt · guided brief · preset briefs · "improve this prompt".
- **Language** unchanged.

### Screen 2 — Select Activities _(existing, enhanced)_

- Activity cards grouped by category, unchanged layout.
- **NEW — Recommendations**: recommended activities pre-checked with a one-line reason badge;
  poor-fit activities dimmed with a reason. Driven by source **+** intent.
- **NEW — Per-activity mini-controls** on the card: item count, difficulty.

### Screen 3 — Review & Approve _(NEW — the core)_

- **Proposed content list**, grouped by activity; each item shows its target concept / objective.
- **Live interactive H5P preview** of the selected item, rendered in the real player — the
  educator *plays* it as a learner would.
- Per item: **Approve · Drop · Edit · Regenerate.**
- **Trust signals** per item: source-sentence grounding, answer-key justification, confidence,
  extraction-vs-inference marker.
- **Coverage grid**: objectives × activities.
- **Cost line**: "This will use 2 credits and create 18 items."
- **[Approve N & create]**.

### Screen 4 — Refine _(NEW — post-creation workspace)_

- The created set in one workspace (not scattered into a folder).
- **Inline item actions**: Regenerate · Easier/Harder · Rephrase · flag distractor · Delete.
- **Scoped natural-language edits**: "shorten all summary statements", "make Q3–5 about the
  evidence".
- **Propagate a fix**: a correction offers to apply across the whole set and stick for next time.

### Screen 5 — Place & Finish _(NEW — replaces silent auto-file)_

- **Choose destination**: a course folder (`Biology 101 / Unit 3`), not just "Smart Import".
- **Name the import session**; provenance attached to every item.
- **Publish set** or keep as draft.

---

## Stages (detail)

### Stage 1 — Intent authoring

Four on-ramps feeding **one underlying intent object**:

| On-ramp | What it is | For the educator who… |
|---|---|---|
| Free-form prompt (keep) | The text box that exists today; default, lowest-friction. | will type a sentence |
| Guided brief | Structured form: learning goal(s), audience/grade, prior knowledge, difficulty, emphasis (recall↔understanding↔application), tone, terminology/spelling, volume. | wants scaffolding |
| Preset briefs | Clickable starts (Exam revision, Introduce a topic, Check prior knowledge, Deep practice, Accessible/ESL) that fill prompt + fields. | faces the blank page |
| "Improve this prompt" | Rewrites their text with prompt-engineering best practice; diff view; teaches. | typed something rough |

Interlocks: prompt ↔ brief are two views of one object; presets seed both; "improve" back-fills
brief fields; brief fields are pre-suggested from the source; any result can be saved as a
reusable named brief.

**Also in Stage 1:**

- **Source read-back** before activity selection (type, length, key concepts).
- **Content-type recommendation from source + intent** — ranked, pre-checked, reason per activity.
- **Auto-propose learning objectives** from the source.
- **Verbatim question extraction** — when the source already contains questions (worksheet,
  question bank, past paper), detect them and offer to import as-is into the chosen H5P type
  rather than generating new ones. Faster, and it is the educator's own material.
- **PowerPoint (.pptx) as a first-class source** — lecturers live in PowerPoint; today's
  generation from `.pptx` is weak. Proper slide + speaker-notes + structure parsing. _(Assumption
  to validate: `.pptx` is a very common lecturer format.)_
- **Images — deprioritized.** Complex, and low value for the content types Smart Import currently
  produces (Single Choice Set, Summary, Question Set, Crossword, Drag the Words are all
  text-based). Revisit when image-based content types (Image Hotspots, image Drag-and-Drop, Find
  the Hotspot) enter the Smart Import catalog.

### Stage 2 — Approval (review gate before spend)

Plan preview → proposed-content list → **live interactive H5P preview per item** → per-item
approve / drop / edit / regenerate → per-activity controls → coverage grid → cost line →
review workspace (not auto-filed).

**Review assist** (not eval infrastructure — lightweight checks that make approval faster and
more confident, built largely from approval-gate telemetry once edit patterns are visible):
reading level vs. target · duplicate-concept detection · "distractor may be defensible" ·
answer-key sanity · coverage vs. objectives · consistency with source. The educator's
approve/drop/edit decisions are a free measurement stream — the gate exists anyway.

### Stage 3 — Refinement

Inline item actions · scoped natural-language edits · propagate-a-fix (and remember) ·
regenerate one artifact · post-generation coverage report with "fill the gap".

### Stage 4 — Discoverability & organization

Per-session container · provenance on every item · provenance as a library filter · two-way
navigation (session ↔ content) · session page as a workspace · choose destination at import
time · lifecycle (archive/delete session + content together).

### Stage 5 — Trust

Source grounding per item · extraction-vs-inference flag · answer-key justification ·
factual-consistency-vs-source flag · confidence indicator · objective + Bloom's alignment ·
nothing published without approval · educator is author of record · generate-vs-edit audit
trail · AI-generated labeling · source-reliability signal · known-limitations disclosure ·
personal track record · confusion-report loop · generation transparency.

---

## Roadmap — prioritization, sequencing, success measures

### North star & guardrail

- **North star: W2 retention** (currently ~20%). Target **35%+ end of Phase 1**, **40%+ end of
  Phase 2**.
- **Supporting metrics:** approve-without-edit rate · median edits per approved item · imports
  per active user per week · published (not just created) rate.
- **Guardrail:** time-to-first-created-content must not regress > ~20%. The approval gate adds a
  step — watch that it doesn't hurt activation.

### Phase 1 — Fix the cliff (first-run trust + the gate)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Approval gate: proposed-content list + **live H5P preview per item** + approve/drop/regenerate | P0 | ≥ 60% of imports reach an approved set (vs. abandon after generate); median generate→approved < 5 min |
| 2 | Source grounding per item (show the source sentence) | P0 | Educator "I could tell if each item was right" ≥ 4/5 in usability test |
| 2 | Answer-key justification per item | P1 | Contributes to approve-without-edit rate ≥ 55% |
| 3 | Content-type recommendation from source + intent | P1 | ≥ 50% of imports keep the recommended activity set unchanged; "created an activity then deleted it whole" rate ↓ |
| 3 | Source read-back panel | P1 | Leading indicator: poor-fit activity selections ↓ |
| 3 | Verbatim question extraction (detect + import-as-is) | P1 | For question-bearing sources, ≥ 50% choose Extract; edit rate on extracted items < 10% |
| 4 | Known-limitations disclosure at create time | P2 | First-run on unsupported sources (math/procedural) ↓ |
| — | **Phase gate** | | **W1→W2 retention 20% → 35%+** |

### Phase 2 — Fast & repeatable (returners → regulars)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | PowerPoint (.pptx) first-class ingestion | P1 | `.pptx` approve-without-edit rate reaches clean-article parity; W2 retention for `.pptx`-first users reaches cohort average |
| 1 | Guided brief + presets + "improve prompt" + save named brief | P1 | Brief used in ≥ 30% of imports by users with ≥ 2 imports; approve-without-edit higher for brief-driven imports |
| 2 | Inline item actions + scoped natural-language edits (Refine) | P1 | Median edits per approved item trends **down** across a user's successive imports |
| 2 | Per-activity controls + coverage grid | P2 | Cross-activity concept overlap ↓ (measured); "too many/few questions" feedback ↓ |
| 3 | Propagate-a-fix + preference memory | P2 | Same correction made twice by the same user → near zero |
| 3 | Personal track record + confidence indicators | P2 | Approval time decreases as track record accumulates |
| — | **Phase gate** | | **W2 retention 40%+; imports/active user/week ↑** |

### Phase 3 — Stickiness (habit + team expansion)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Per-session containers + provenance + two-way navigation | P1 | % of users who re-open a past import ↑; "find the content from last week's import" task success ≥ 90% |
| 2 | Session workspace (regenerate / add / export / publish set / bulk-move) | P2 | Published (not just created) rate ↑; bulk actions used |
| 2 | Choose destination at import time | P2 | ≥ 50% of imports placed outside the "Smart Import" folder |
| 3 | Confusion-report loop | P2 | % of confusion-flagged items regenerated ↑; downstream confusion rate on regenerated items ↓ |
| 3 | Assemble into a coherent Interactive Book | P2 | "Assemble" adoption; retention delta assembled vs. loose output |
| 4 | Lifecycle (archive/delete session + content) | P3 | Per-active-user folder growth rate ↓ |
| — | **Phase gate** | | **W4→W8 retention ↑; seats per org ↑** |

### Deferred

| Item | Trigger to revisit |
|---|---|
| Image ingestion & image-based content types | Image-based content types (Image Hotspots, image Drag-and-Drop, Find the Hotspot) added to the Smart Import catalog |

### Where to focus

**Phase 1, Seq 1–2: the approval gate + live preview + grounding.** It is the retention fix and
it is the Sprint 2 demo slice — the demo and the roadmap's first bet are the same thing.

**Quick wins shippable independently:** known-limitations disclosure · content-type
recommendation · source-grounding display (if generation already produces the spans) ·
answer-key justification.

### How the twin de-risks this

The digital twin lets us test "approval gate + grounding fixes retention" against **real Smart
Import output, before H5P ships anything** — run both across ~15 realistic sources (clean
article, messy PDF, YouTube transcript, `.pptx`, short paste), measure approve-without-edit,
defensible-distractor, and objective-alignment rates side-by-side. If quality is genuinely "good
enough" the numbers show it and Phase 1 shrinks to the gate alone; if not, the retention leak is
located with evidence.

---

## Sprint 2 demo

**Screen 3 (Review & Approve) built end-to-end**, with a slice of Screen 1 (structured intent +
source read-back) feeding it: an educator enters a source + intent → sees recommended activities
→ sees a proposed-content list with a **live playable H5P preview per item** and grounding /
answer-key trust signals → approves/drops/regenerates → the approved set renders in the real H5P
player, **side-by-side with a captured real Smart Import output for the same source**.

Feedback question for mentors: *"Is this twin faithful enough that you'd trust a product decision
made on it?"*
