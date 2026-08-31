# H5P Smart Import — Reworked Educator Workflow

_Draft, 2026-08-31._

## Goal

**Reduce time-to-value and lift W1→W2 retention for H5P Smart Import.** Today an educator tries
Smart Import once and does not come back (~20% week-1 → week-2). This project redesigns the
educator workflow — how they express intent, choose what gets generated, review and refine the
output, and find it later — so the first result is trusted and cheap enough to build on.

It is delivered as (a) a working prototype that reproduces Smart Import's generate-from-source
behaviour, renders output in the real H5P player, and layers the redesigned workflow on top, and
(b) this spec. **The prototype is a means to test and demo the workflow before H5P engineering
commits — not a deliverable in itself.**

## Context

**Smart Import** (H5P.com) turns a source document into H5P interactive content using AI. A source
is **mandatory** — no from-scratch generation, so output is always grounded.

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

---

## The four parts of the workflow

The rework touches four things the educator does. For each: what breaks today (from the H5P.com
walkthrough) and what we've added — every "reworked" item below is **new vs. the shipped
product**. This is the opportunity map; the detailed design follows further down.

### 1 · Express intent — *what do I want, from what source*

| Today | Reworked (new) |
|---|---|
| One optional, collapsed "Customization" box → blank-page problem, usually skipped | **Intent authoring** — a written prompt **or** a guided brief (mutually exclusive) |
| No guidance on what a good prompt looks like | **Preset prompts** (Exam revision · Introduce a topic · Check prior knowledge · Extract questions) + **"Improve this prompt"** (rewrites rough text to best practice) |
| Re-type intent every import | **Prompt / brief library** — save, reuse, MRU-sorted, optionally bundles the activity selection; account-scoped later; org templates later |
| Source goes in as a black box | **Automatic source read-back** — type, length, reading level, concepts, themes, strengths, watch-outs. Advisory, non-blocking |
| Always generates new questions | **Verbatim question extraction** — Extract as-is · Generate new · Both |
| `.pptx` (what lecturers actually use) generates poorly | **`.pptx` as a first-class source** — slide + notes + structure parsing (Phase 2) |

### 2 · Choose what gets made — *activity fit*

| Today | Reworked (new) |
|---|---|
| Blind checkboxes across 4 categories, no fit-to-source signal | **Activity recommendation engine v1** — feasibility gate (from source) + desirability rank (from intent) + count logic (1/2/3) |
| No item counts, no per-activity config | Pre-checked set with **item counts + a one-line reason** each; per-activity mini-controls (count, difficulty) |
| Easy to over-select → 5 overlapping activities that all need cleanup | Count capped at 3; marginal/infeasible types shown unchecked with the reason; **explicit prompt instructions override** the engine (with feasibility warnings) |
| No coverage view | **Coverage grid** (objectives × activities) — planned |

### 3 · Review & refine what came back — *trust + fix* — the core

| Today | Reworked (new) |
|---|---|
| Generation commits **straight to N saved content items** — no checkpoint to see what was made and discard it; the AI ran regardless, and the cost that bites is the cleanup hour, not the credits | **Review & Approve** step — a proposed-content list held *before* anything enters the library; a **"Create N" gate** |
| To check or fix anything, open each item in the full H5P editor | **Live H5P preview per item** — Review (scan every question without answering) + Play (the real player) |
| No way to tell if a question is correct | **Per-question trust signals** — the exact source sentence, an answer-key note, a confidence level, extracted-vs-inferred |
| No targeted regeneration, no natural-language edit | **Refine ▾** — bounded steers (Harder · Easier · Simpler language · More formal · Different focus · Clearer · Answers look wrong · Try again); regenerates the activity for its type |
| Wrong activity type → discard, go back, re-pick | **Remix ▾** — rebuild as a different type, keeping the concepts |
| — | **Discard ▾** with a reason · **inline text edit** per item · **approve-by-default** (act on exceptions) |
| Refinement is per-artifact, one editor at a time | **Refine soft-cap (3)** → nudges to Remix / Discard / manual edit when the source×type pairing isn't working |
| No feedback loop | **`review_event` stream + `ImportRecord`** — the labelled dataset that answers "is quality good enough" with data, not opinion |
| One rigid flow | **Two UI shapes to demo** — A: step-by-step wizard · B: full-screen 3-panel workspace (setup · output · refinement chat) |

_Phase 2: scoped natural-language edits · propagate-a-fix · post-generation coverage report._

### 4 · Find & reuse it later — *organization*

| Today | Reworked (new) |
|---|---|
| Every import dumps flat into a "Smart Import" folder — in fact **two** (a per-import subfolder *and* a global catch-all) | Content lands in the **content library** among everything else — no dedicated folder |
| No mapping of which content came from which import (a title prefix is the only clue) | Each item stamped **`from: <import>`** — a two-way link; **provenance as a library filter** |
| No record of what the import was | **Persisted `ImportRecord`** — source snapshot, intent, engine/model, outcome counts, per-item decisions, kept items. Survives reload and "Start another import" |
| — | Library view lists items across every persisted import; each `from:` tag opens that import's receipt |

_Phase 3: a standalone "Smart Imports" list screen · lifecycle (archive/delete an import + its content together) · destination-at-import-time._

### Threaded through all four — trust & measurement

Nothing is published without approval; the educator is author of record; every generate/edit is
audited. The educator's approve / refine / discard decisions **are** a free measurement stream
(see [Measurement](#measurement)).

---

## Opportunity Solution Tree

```mermaid
graph TD
  O["Outcome — cut time-to-value · lift W1→W2 retention"]

  O --> P1["1 · Intent is a blank box, not reusable; source is opaque"]
  O --> P2["2 · Activity choice is blind; easy to over-pick"]
  O --> P3["3 · No checkpoint before content is committed; can't verify it; fixing means N editors"]
  O --> P4["4 · Output dumped in a folder; no link back to the import"]

  P1 --> S1a["Prompt XOR brief · presets · Improve"]
  P1 --> S1b["Prompt / brief library — save & reuse"]
  P1 --> S1c["Automatic source read-back"]
  P1 --> S1d["Verbatim question extraction"]

  P2 --> S2a["Recommendation engine — feasibility + desirability + count"]
  P2 --> S2b["Pre-checked set with counts + reasons"]

  P3 --> S3a["Review & Approve step + Create-N gate"]
  P3 --> S3b["Live H5P preview per item"]
  P3 --> S3c["Per-question trust signals"]
  P3 --> S3d["Refine / Remix / Discard — bounded"]
  P3 --> S3e["review_event + ImportRecord eval stream"]

  P4 --> S4a["Content in the library, not a folder"]
  P4 --> S4b["from: import tag + provenance filter"]
  P4 --> S4c["Persisted ImportRecord receipt"]
```

Text form, with the phase each bet lands in:

```
Outcome — reduce time-to-value · improve W1→W2 retention
│
├─ Opportunity 1 · Intent is a blank box, not reusable, source opaque
│    ├─ Automatic source read-back ......................... Phase 1
│    ├─ Verbatim question extraction (Pasted Text) ......... Phase 1
│    ├─ Prompt XOR brief · presets · "Improve" ............. Phase 2
│    └─ Prompt / brief library (save, reuse, bundle) ....... Phase 2
│
├─ Opportunity 2 · Activity choice is blind, easy to over-pick
│    ├─ Recommendation engine v1 (feasibility + desirability + count) ... Phase 1
│    └─ Pre-checked set · item counts · one-line reasons ... Phase 1
│
├─ Opportunity 3 · No checkpoint before content is committed; can't verify; N editors to fix   ← the retention fix
│    ├─ Review & Approve step + "Create N" gate ........... Phase 1  (P0)
│    ├─ Live H5P preview per item (Review + Play) .......... Phase 1  (P0)
│    ├─ Per-question trust signals ........................ Phase 1  (P0)
│    ├─ Refine / Remix / Discard — bounded steers ......... Phase 1–2
│    └─ review_event + ImportRecord eval stream ........... Phase 1
│
└─ Opportunity 4 · Output dumped in a folder, no link to its import
     ├─ Persisted ImportRecord receipt .................... done (prototype)
     ├─ Content in the library (no Smart Import folder) ... Phase 3
     └─ "from: <import>" tag + provenance filter .......... Phase 3
```

---

## The reworked workflow (screen by screen, on top of the existing modal)

The existing Smart Import modal has a stepper: **Configure Content → Select Activities**. The
rework keeps that shell and inserts new steps.

### Screen 1 — Configure Content _(existing, enhanced)_

- **Source**: the rework focuses on **Pasted Text** and **Wikipedia** first — the two lowest-risk,
  highest-signal inputs. `.pptx` (Phase 2) and the other existing tabs (File / YouTube / Web Page)
  come after, once the core loop is proven.
- **NEW — Source read-back** runs **automatically** and **non-blocking** as the educator
  types/pastes (no "Analyze" button; "Choose activities" / "Quick generate" are available the
  moment a source exists, the read-back fills in behind them). It is **advisory** — it describes
  the material, it does not gate or discourage use:
  - **What it is**: content type, length, reading level, the themes the questions will draw on
    (weighted).
  - **Concepts**: substantive, multi-word things a teacher would assess — not a word-frequency
    dump.
  - **Strengths**: what this source is good raw material for.
  - **Watch-outs**: what to expect / what it won't cover well, phrased neutrally
    ("fact-dense — expect *what/when* over *why*"), never "don't use this".
  - **Existing questions**: count → the extract-vs-generate choice.
  Model-backed when a key is present; heuristic fallback otherwise.
  _(Parked: source-derived draft objectives. They're content *targets*, complementary to a
  predesigned prompt's *framing* — would return as a separate `targetObjectives` chip field, not
  appended prompt text, and hidden in extract mode.)_
- **NEW — Question handling** when questions are detected:
  **[Extract as-is]** · **[Generate new]** · **[Both]**. Extraction lifts the educator's own
  questions into the target H5P type with minimal rewriting — faster, and their own wording.
- **NEW — Intent authoring** replaces the single Customization box. The educator picks **one
  mode** — *Write a prompt* **or** *Guided brief* — never both at once (a free-text prompt and a
  structured brief can contradict each other). Prompt mode carries **preset prompts** to start
  from and an **"improve this prompt"** action; brief mode is a structured form only.
- **Language** unchanged.

### Screen 2 — Select Activities _(existing, enhanced)_

- Activity cards grouped by category, unchanged layout.
- **NEW — Recommendations**: the pre-checked set + per-type item count + a one-line reason, from
  the **Activity recommendation engine** (see below); marginal / infeasible types shown unchecked
  with the reason.
- **NEW — Per-activity mini-controls** on the card: item count (pre-filled by the engine),
  difficulty.

### Screen 3 — Review & Approve _(NEW — the core)_

- **Proposed content list**, grouped by activity; each item shows its target concept / objective.
- **Two views of the selected activity:**
  - **Review** _(default)_ — every question laid out as a list, correct answer marked, so the
    educator can **scan without answering**. Each question carries its own trust signals.
  - **Play** — the real H5P player, the learner experience, for a feel check.
- **Actions — MVP.** Approve is the **default, not a click**; the educator acts on the exceptions.
  - **Item level** (one question / card / word): **Edit only** — inline text, manual, no AI.
    (Regenerating one question in isolation risks breaking coherence with the rest — so AI
    refinement is activity-level.)
  - **Activity level:**
    - **Refine ▾** — a bounded picker that *steers* a full regeneration of the activity, not
      just a re-roll. Grouped:
      - _Difficulty:_ Harder · Easier
      - _Language & tone:_ Simpler wording · More formal · In another language ▸ (fixed
        language list — note: questions change, it is not a translation)
      - _Coverage:_ Different focus ▸ (submenu built from the source read-back's concept list) ·
        Less repetitive
      - _Quality:_ Clearer wording · Answers look wrong
      - _Blunt:_ Just try again
      One click → the whole activity is regenerated for its type with that steer. Warns:
      "regenerates every question, including your edits." Refine keeps the **type** fixed.
    - **Remix ▾** — rebuild this activity as a *different* type (Single Choice Set → Drag Text,
      etc.), reusing the concepts it already covered. Picker lists the types the prototype can
      render; one click regenerates in the new format from the same source. Edits are dropped (the type
      changed) — the menu warns. This is the positive path for "wrong format" — it replaces the
      old "discard + re-pick on Screen 2" detour.
    - **Discard ▾** — a bounded reason picker: wrong activity type · quality too low · redundant
      with another · source doesn't support it · not useful. Drops the activity.
  - **Refine cap:** soft limit of **3 refines per activity**. Tries 1–3 behave normally; after
    the 3rd, the button stops being a plain re-roll and surfaces "three tries haven't landed
    this — the source may not support a strong [type] here" with Remix / Discard / Edit
    manually made primary. A 4th is still possible, just not the default. Remix is not capped
    (each remix changes type, so it is not slot-machine behaviour) but is logged.
  - **Gate button:** "Create N" — N = every activity not discarded.
  - _Deliberately out of MVP:_ item-level regenerate/drop · diagnosis→strategy branching on
    Refine · "refine instead of discard" redirects · difficulty/count/type as standalone
    controls (they're Refine steers) · coverage-grid-tied Add-item.
- **Trust signals are per question**, not per activity: each question shows the exact source
  sentence it was built from, a one-line answer-key note, and a confidence level.

**Feedback → eval stream.** Every review-stage action writes a `review_event`:
`{ importId, contentType, engine, model, sourceKind, readbackKind, sourceLength, intent{mode,
authoringMode, preset, emphasis, volume}, action: "edit"|"refine"|"remix"|"discard", reason (the
picker value / steer / from-type), toType? (remix), field?, charsDelta?, attempt?, timestamp }`
— plus one `create_summary` per import (generated / created / edited / refined / remixed /
discarded). The `create_summary` is additionally **persisted in full as an `ImportRecord`**
(`POST /api/imports` → `.imports.jsonl`, beside `.review-events.jsonl`, gitignored):
`{ id (=importId), name, createdAt, source{kind, value (the real text/URL), wordCount,
readbackKind}, intent, promptPresetId, engine, model, outcome{generated,kept,edited,refined,
remixed,discarded}, decisions[{itemId, contentType, kept, edited, charsDelta, refineAttempts,
refineSteers[], remixCount, remixFrom, discarded, discardReason}], items[{id,title,contentType,
concepts,contentJson}] }`. That record is the receipt — reached from any content item's `from:`
tag — and it survives "Start another import" and a reload. This is the labelled dataset
that gives **approve-without-edit rate**, **which steer people reach for** (→ tune defaults: lots
of "Harder" = generate harder), **discard reasons per source kind**, **edit magnitude per
field**, and **refine attempt-loops** (≥3 = the source can't support that type). It also answers
"is quality good enough" with data instead of opinion.
- **Coverage grid**: objectives × activities.
- **Cost line**: "This will use 2 credits and create 18 items."
- **[Approve N & create]**.

### After "Create N" — land in the content library _(NEW — replaces the silent auto-file)_

Not a step. "Create N" creates the activities in the **content library** — where all H5P content
lives — and drops the educator there, **filtered to this import**:

- Each new item is stamped **`from: <import>`** (auto-named: source/title + date) and shows up
  among the rest of the library, not in a separate folder. Items land as **draft**.
- A banner confirms "N created", and **"Open import details"** expands the receipt inline:
  source, prompt/brief, engine + model, and the outcome — N generated → kept / edited / refined /
  remixed / discarded (with per-item discard reasons). It is a click-through, not a screen you
  pass through. The receipt is a **persisted `ImportRecord`** (see the eval-stream note above),
  so it is still there after "Start another import" or a reload.
- The import mapping *is* the organisation: the library view lists items across every persisted
  import, and each item's `from:` tag opens that import's receipt. No name step, no destination
  picker, no publish gate.
- **Start another import** re-enters the flow; the just-finished import stays in the library.

**Two objects, one home each.** The import is an event (immutable receipt: source, intent,
decisions); the content items are living objects that live in the library. Keep both indexes —
"what did I import?" (the Smart Imports list) and "what content do I have?" (the library) —
bound by a two-way link, **not** by a folder. Collapse today's two folders (per-import subfolder
+ global catch-all) into nothing: content is just in the library, found via the import filter.

_Phase 2:_ per-import destination on create (course/unit) for teams that want it · a
post-creation Refine workspace — scoped natural-language edits ("shorten all summary
statements"), propagate-a-fix-and-remember, inline flag-distractor · publish-set-as-a-batch.

---

## Stages (detail)

### Stage 1 — Intent authoring

The educator authors intent in **exactly one mode** — a written prompt **or** a guided brief.
They are mutually exclusive: a free-text prompt and a set of structured fields can contradict
each other, and it's ambiguous which wins. A segmented toggle switches between them.

**Write a prompt**

| Element | Behaviour |
|---|---|
| Free-text box | The primary input. Lowest friction; default mode. |
| **Preset prompts** | Clickable, each fills the box with a best-practice prompt: _Exam revision · Introduce a topic · Check prior knowledge · **Extract existing questions**_. |
| **"Improve this prompt"** | Model rewrites the rough text to prompt-engineering best practice — imperative, specific, and only filling in audience / focus / count / difficulty **where the rough text states or implies it** (never invents them). One-click revert. **Shown only in Scratch** (a predesigned prompt is already best practice; there's nothing to improve). |

**Guided brief** — same three-part shape as *Write a prompt*: a **"Start from:"** row, one
editable panel, contextual save actions.

- **Start from:** `Recommended` (selected by default — the recommended field values, *not* an
  empty form) · `★ <saved brief>` for the educator's own saved briefs.
- **The panel** is one uniform list of parameter rows. Five standard fields — learning goal,
  audience, emphasis, volume, language — drive the recommendation engine and analytics and stay
  fixed. Then the educator's own **`+ Add parameter`** rows: a name and a value
  (*Curriculum: AP Biology* · *Tone: encouraging* · *Avoid: exam dates*). Everything serialises
  into one instruction internally — the standard fields plus `name: value;` for each added one.
- **Save:** `Save this brief` (always available) captures the field values **and** the added
  parameters as a named, reusable **brief format**; `Update "<name>"` / `Save as a new brief`
  appear when a loaded brief has been edited, exactly like the prompt section.

TTV is unchanged on the fast path — *Recommended* → type a learning goal → Choose activities;
the added parameters are opt-in. _Phase 2:_ admins publish brief formats (required parameters,
house values) org-wide; for now every educator builds their own.

**Template library** — one library, holds both **prompts** and **brief formats**, three tiers:

| Tier | Source | Editable |
|---|---|---|
| **System templates** | The predesigned prompts (Exam revision, Introduce a topic, Check prior knowledge, Extract existing questions) | Read-only, used as-is |
| **Personal templates** | Any Scratch prompt **or** guided brief (fields + custom parameters) the author saved — named | Author's own (rename / delete) |
| **Org templates** _(admin layer, later)_ | Admins publish org-wide prompts and brief formats | Read-only to authors |

Personal templates appear in the "Start from:" row for their mode — prompt templates next to the
system ones (`[Scratch] [system…] [★ My Grade 9 Bio]`), brief templates next to `Recommended` —
and in a searchable **📚 Template library** dropdown.

**Reuse — how an educator picks up a saved prompt on a future import:**

- **Bundled scope.** A template optionally carries the **activity selection** too (and, later,
  the destination folder). Reuse then collapses to: pick template → activities already chosen →
  add source → generate. One real step.
- **Surface the likely one.** Templates sort most-recently-used first; the last-used one carries a
  "recent" marker so a regular user's default is one glance away.
- **Edit without clobbering.** Loading a template puts a prompt into editable Scratch — tweak it
  for this import freely. If the tweak is worth keeping, an **"Update '<name>'"** action appears;
  otherwise "Save as new".
- **Manage.** A "Your templates" list — rename, delete.
- **Productionisation:** in the prototype templates live in `localStorage` (per browser). In the
  product they must be **account-scoped** so they follow the educator across devices, and become
  the substrate for org-published templates.

This turns intent authoring from per-import typing into pick-a-template for regular users — the
core repeat-use / TTV win.

_Governance (Phase 3):_ authors keep full freedom over their own briefs and templates. Org
consistency (house style, spelling, accessibility, integrity) is enforced through an **invisible
admin-set generation policy** appended to every prompt — not by locking the author-facing brief.
Admins may *add* org templates and at most 1–2 required fields (course, curriculum standard),
never *remove* the core fields or restrict free-text prompt mode. Heavy admin-controlled forms
would work against the TTV guardrail.

**Question extraction** — the *Extract existing questions* preset (and the read-back's "Extract
them as-is" action) sets a verbatim-extraction instruction and switches the run to extract mode:
pull each question from the source exactly as written, carry over options and marked answers,
invent nothing.

_Prompt vs. architecture:_ the **prompt does the extraction reasoning** — finding questions,
mapping each to an H5P type. That much is prompt-only and is verified working on clean text
(a pasted quiz → 3 questions pulled verbatim with answers preserved). The **architecture owns
input handling and the trust guarantee:**

| Case | Prompt-only enough? | Needs |
|---|---|---|
| Pasted text, linear questions | Yes | — |
| PDF / DOCX / scanned exam papers | No — prompt assumes clean text | Layout-aware extraction (+ OCR) — the same ingestion pipeline `.pptx` needs |
| Verbatim guarantee on a teacher's own exam | No — LLMs quietly paraphrase, drop options, renumber, or invent a key | A verification pass: extracted item ↔ source-span diff, flag every mismatch |
| Long banks (50–200 Qs) | No — quality degrades with length | Chunk + stitch + dedup |
| Separate answer keys | Weak | Structured key resolution |
| Image-dependent questions | No | Media handling — deferred with image support |

**What makes prompt-only viable now:** the approval gate. The educator checks every extracted
question against its source span before anything is created, so an imperfect extraction is
caught, not shipped. Sequencing: ship prompt-only extraction for **Pasted Text** in Phase 1;
file-based extraction (PDF/DOCX) rides on the `.pptx` ingestion pipeline in Phase 2, with the
automated verbatim-diff check added then.

**Also in Stage 1:**

- **Source read-back** before activity selection — advisory, non-blocking: type · length ·
  reading level · weighted themes · substantive concepts · Strengths · Watch-outs · draft
  objectives. Describes the material; never a go/no-go verdict.
- **Content-type recommendation** — the pre-checked activity set + item counts, from the
  **Activity recommendation engine (v1)** documented below (feasibility gate from the source,
  desirability rank from the intent, count 1–3, explicit prompt instructions override).
- **Auto-propose learning objectives** from the source.
- **Verbatim question extraction** — when the source already contains questions (worksheet,
  question bank, past paper), detect them and offer to import as-is into the chosen H5P type
  rather than generating new ones. Faster, and it is the educator's own material.
- **PowerPoint (.pptx) as a first-class source** — lecturers live in PowerPoint; today's
  generation from `.pptx` is weak. Proper slide + speaker-notes + structure parsing. _(Assumption
  to validate: `.pptx` is a very common lecturer format.)_
- **Images — deprioritized.** Complex, and low value for the content types Smart Import currently
  produces — Crosswords, Question Set, Single Choice Set, Summary, Glossary (difficult words /
  key concepts), Higher-Order Questions, Interactive Book, Dialog Cards (conceptual / contextual),
  Drag the Words, The Chase are all text-based; only Interactive Video needs media. Revisit when
  image-based content types (Image Hotspots, image Drag-and-Drop, Find the Hotspot) enter the
  Smart Import catalog.

**Considered and not pursuing — "suggest a full prompt from the source."** Mechanically easy, but
the prompt exists to carry the educator's *intent* — audience, purpose (formative vs. summative),
depth, the sub-topic students struggle with — none of which is in the learning material. A prompt
derived from the source alone can only restate the read-back and do what Smart Import already
does by default. If a source-only prompt were good enough, the prompt wouldn't be needed. What
the source *can* inform stays in: proposed objectives, content-shape guardrails, mode
pre-selection, and nudges after the educator has written something. _Backlog exception:_ if the
input is a **lesson plan / syllabus / outcomes doc** (source-as-brief, not source-as-content), it
does contain intent and could auto-fill objectives + prompt.

### Activity recommendation engine (v1)

**In one paragraph.** The engine decides *which activity types to pre-check on Screen 2*, how
many, and how many items each — nothing else. It reads two inputs. The **source** (via the
read-back) tells it what a *good* activity of each type would need and whether this material has
it — that's **feasibility**, a hard gate. The **intent** (the prompt or brief) tells it which of
the feasible types serve the teacher's goal — that's **desirability**, which only ranks *within*
what's feasible. Count and item-count are rules layered on top. Every output is a suggestion the
teacher overrides on Screen 2; an explicit instruction in the prompt ("make 3 crosswords") wins
outright, bounded only by what the source can support without padding.

**What each decision depends on, and the rule:**

| Decision | Depends on | The rule |
|---|---|---|
| **Is type X feasible?** | source read-back: `kind`, whether `concepts` are short terms vs. ideas, `wordCount`, number of `themes`, `detectedQuestions` | a per-type checklist (Step 1) — e.g. Crossword needs many short named terms; Interactive Book needs length **and** multiple sections; Summary needs paraphrasable claims |
| **Which feasible types?** | intent: `emphasis`, prompt keywords (*vocab / terms / definitions* · *teach / introduce / explain* · *exam / quiz / assess*), the brief's goal | purpose slots (recall / understanding / practice / teach) + an intent tilt; Single Choice Set is the default first pick (Step 2, 4) |
| **How many types — 1 / 2 / 3?** | `wordCount`, number of `themes`, prompt breadth vs. narrowness (*quick / warm-up / diagnostic* → narrow; *full / comprehensive / cover the unit* → broad) | 2 by default (one recall + one understanding); 1 if the source is short/single-topic or the intent is narrow; 3 only if the source is long **and** multi-section **and** the intent signals breadth. Never > 3 (Step 3) |
| **Items per type?** | `volume` (light 4 / standard 6 / thorough 10), `wordCount`, number of `concepts` | start at `volume`; cap at ~1 item per 60–100 words of substantive content, or ~1.5 × distinct concepts, whichever is lower; with 2–3 activities, target **10–15 items total across the set**, not per activity (Step 5) |

**Why this shape:**

- **Feasibility before desirability**, always. An intent that wants a Crossword can't force one
  onto a source with no short terms — a contrived crossword fails the educator at the review gate
  anyway. Ranking only happens inside the feasible set.
- **Feasibility is an LLM job; everything else is deterministic rules.** Feasibility needs to
  *read* the source (short terms? definitional sentences? multiple sections?), so it's folded
  into the one analyze call that produces the read-back. Purpose slots, count, type selection and
  item counts are pure functions of the read-back + intent — so they **re-rank instantly** when
  the teacher changes emphasis, volume, or the prompt, with no extra API call.
- **A hard cap of 3**, because each activity is another block to review at the gate and multiple
  activities from one source tend to overlap — more types is usually worse, not better.
- **Every threshold is a dial.** This is v1; the count boundaries, the words-per-item ratio, the
  purpose→type mappings and the intent-keyword lists are all expected to move with real usage
  (see *v1 — expected to be refined* below).

**Output contract.** The engine produces exactly one thing: the **recommended (pre-checked) set
of content types on Screen 2**, each with a suggested **item count** and a **reason that names
the source trait and the intent trait it is responding to**. It does not generate content, pick
destinations, or gate progression. Everything it proposes is overridable on Screen 2.

#### Step 1 — Feasibility gate (from the source read-back)

Each catalogue type is marked `feasible | marginal | infeasible`:

| Type | Feasible when the source has… | Infeasible / weak when… |
|---|---|---|
| Single Choice Set | assertable facts with clear right answers | pure opinion, nothing assertable |
| Question Set | enough distinct facts for a multi-item quiz, or existing questions to hold | very short source |
| Summary | paraphrasable explanatory claims | lists / tables / reference data — nothing to paraphrase |
| Crossword | many single-word / short named terms (terminology, people, places) | explanatory prose, few named terms → contrived clues |
| Drag the Words | definitional or structural sentences with an unambiguous removable key word | narrative prose, no clean gaps |
| Dialog Cards | term↔definition or Q↔A pairs | continuous narrative |
| Interactive Book | length **+** multiple sub-topics / sections | short single-topic blurb |
| Interactive Video | a video source | text source (disabled) |

Signals used: read-back `kind`; whether `concepts` are short terms vs. ideas; `wordCount` +
number of `themes`; `detectedQuestions`; `watchOuts`. Marginal / infeasible types still appear on
Screen 2 — unchecked, with the reason shown.

#### Step 2 — Purpose slots

A recommendation covers **distinct pedagogical purposes**; at most one activity per purpose:

| Purpose | Types |
|---|---|
| Check recall | Single Choice Set · Dialog Cards · Crossword |
| Check understanding | Summary · Question Set |
| Practice / consolidate | Dialog Cards · Drag the Words · Crossword |
| Present / teach | Interactive Book |

#### Step 3 — How many activity types

- **Default 2** — one *recall* + one *understanding* (Single Choice Set + Summary, or + Question
  Set for a richer source). Different cognitive levels, minimal overlap.
- **1** if any of: source < ~400 words or single-topic · only one purpose feasible · intent is
  narrow ("quick check", "diagnostic", "warm-up"). → the single best-fit type for the dominant
  purpose.
- **3** only if **all** of: source long **and** multi-section · intent signals breadth ("full
  revision set", "cover the unit") · a third distinct purpose is feasible.
- Never auto-check more than 3 — each activity is another block to review at the gate, and
  multiple activities from one source tend to overlap.

#### Step 4 — Which types, within the count

1. Feasible only.
2. One per purpose slot — never two recall types.
3. **Single Choice Set is the default first pick** — it works on almost any expository source, for
   both assessment and practice.
4. Intent tilts the rest: assessment emphasis → + Question Set; teaching emphasis → + Summary /
   Interactive Book; prompt mentions "terms / vocabulary / definitions" → swap in Crossword /
   Drag the Words.

#### Step 5 — Item count per recommended type

- Start at `volume` (light ≈ 4 · standard ≈ 6 · thorough ≈ 10).
- **Cap up** by source: ≤ ~1 item per 60–100 words of substantive content, or ~1.5 × the
  read-back's distinct concepts — whichever is lower.
- **Cap down** for coherence: with 2–3 activities, ~4–5 each; target **~10–15 items total across
  the set**, not per activity.
- Never pad to hit a number.

#### Explicit user instructions override

If the prompt names types, a count of activities, or an item count, **that instruction wins** and
the engine becomes advisory — it still shows feasibility warnings ("you asked for a Crossword but
this source has few single-word terms"), it does not override the choice.

```
explicit prompt instruction
  >  on-screen manual activity selection (types only)
  >  volume setting
  >  engine default
        ↓  every level capped by  ↓
   what the source supports without repetition (quality floor)
```

An explicit number is still bounded by feasibility: "10 questions" on a source that yields 7 good
ones → generate 7, and say so at the approval gate ("requested 10; source supported 7 without
repetition"). Never silently ignore, never silently pad. Detected via the LLM intent pass
(`requestedTypes`, `requestedActivityCount`, `requestedItemCount`) with a regex fast-path.

#### Implementation split

- **Feasibility = LLM** — it needs to read the source (single-word terms? definitional sentences?
  multiple sections?). Folded into the analyze call that produces the read-back.
- **Purpose slots, count, type selection, item count = deterministic rules** on the feasible set +
  intent. Keeps re-ranking **instant** when the user changes emphasis / volume / prompt — no
  extra API call.

#### v1 — expected to be refined

This is a starting rule set; every threshold is a dial. Refinements we anticipate from real
usage: the 1/2/3 count thresholds, the words-per-item ratio, the purpose→type mappings, whether
"marginal" types should ever be pre-checked, and how aggressively intent keywords swap types.

### Stage 2 — Approval (a checkpoint before content is committed)

Plan preview → proposed-content list → **live interactive H5P preview per item** → per-item
approve / drop / edit / refine → per-activity controls → coverage grid → cost line →
review workspace (not auto-filed).

**Review assist** (not eval infrastructure — lightweight checks that make approval faster and
more confident, built largely from approval-gate telemetry once edit patterns are visible):
reading level vs. target · duplicate-concept detection · "distractor may be defensible" ·
answer-key sanity · coverage vs. objectives · consistency with source. The educator's
approve/drop/edit decisions are a free measurement stream — the gate exists anyway.

### Stage 3 — Refinement

**MVP (built into Screen 3 — see that section for detail).** Two bounded levers, no free-form
natural-language editing:

- **Item level: Edit only.** Inline manual text edit of one question / card / gap. No per-item
  AI refine — regenerating a single item in isolation breaks coherence with the rest of the
  activity.
- **Activity level: Refine ▾, Remix ▾ and Discard ▾.**
  - **Refine** re-runs the whole activity *for the same type* with one *steer* from a closed,
    grouped list — Difficulty (Harder / Easier), Language & tone (Simpler wording / More formal /
    In another language), Coverage (Different focus / Less repetitive), Quality (Clearer wording /
    Answers look wrong), or just "Try again". Each steer rewrites the generation prompt; it is
    not just logged. Language, tone and difficulty are Refine steers, not a separate mechanism.
  - **Remix** rebuilds the activity as a *different* type, reusing the concepts it covered — the
    positive path for "wrong format", replacing the old "discard + re-pick" detour.
  - **Discard** takes a reason from a closed list (wrong activity type · quality too low ·
    redundant · source doesn't support it · not useful).
  - Refine and Remix both regenerate every item, edits included — the UI warns.
- **Refine cap: soft limit of 3 per activity.** After 3 unsuccessful refines, the control stops
  offering a plain re-roll and points at Remix / Discard / manual edit — the source×type pairing
  is the likely problem, and a 3-refine activity is a strong "this source can't support this
  type" label for the recommendation engine. Remix is uncapped (each changes type) but logged.

Every action writes a `review_event` (schema in the Screen 3 section); this is the labelled
eval stream — approve-without-edit rate, which steer people reach for, remix from→to pairs,
discard reasons by source kind, refine attempt-loops.

**Phase 2 (not built).** Scoped natural-language edits · propagate-a-fix (and remember) ·
diagnosis→strategy branching on Refine · "refine instead of discard" redirect ·
difficulty / count / activity-type as standalone controls · post-generation coverage report
with "fill the gap" / coverage-grid-tied Add-item · attempt-loop escalation ("this source keeps
failing for this type — try a different type").

### Stage 4 — Discoverability & organization

Per-import stamp on every item · provenance as a library filter · two-way navigation (import ↔
content) · import-details receipt · lifecycle (archive/delete import + its content together).

**No dedicated "Smart Import" content folder.** Today's product has two — a per-import subfolder
*and* a global catch-all — with no clear mapping between an import and its content. Drop both:
content just lives in the library, and the **import mapping** (a `from:` tag + a filter) is what
ties a set together.

**Built (prototype):** each finished import is a server-persisted `ImportRecord`
(`.imports.jsonl`); the library view lists items across every persisted import, and each item's
`from:` tag opens that import's receipt. Survives "Start another import" and reload.

**Phase 3:** a standalone **Smart Imports list** screen (the second index — "what did I import?"),
full two-way navigation, and lifecycle (archive/delete an import + its content together). Render
output is not yet namespaced by import (`public/h5p/_render/<itemId>/` collides across imports),
so a *reopened* past import shows item metadata but is not re-playable — namespacing + `_render`
GC is a Phase-3 item.

### Stage 5 — Trust

Source grounding per item · extraction-vs-inference flag · answer-key justification ·
factual-consistency-vs-source flag · confidence indicator · objective + Bloom's alignment ·
nothing published without approval · educator is author of record · generate-vs-edit audit
trail · AI-generated labeling · source-reliability signal · known-limitations disclosure ·
personal track record · confusion-report loop · generation transparency.

---

## Measurement

**North star — W1→W2 creator retention** (~20% today). Everything below is a leading indicator of it.

### The funnel — adoption → activation → retention

| Stage | Event | Metric |
|---|---|---|
| Opened the flow | `import_started` | starts per eligible user per week |
| Finished setup | `generate_requested` | setup-completion rate |
| Generation returned | `generate_completed {ok, latencyMs}` | success rate · latency |
| Acted in review | `review_opened` · `item_previewed {itemId}` | % of items actually previewed |
| Shipped | `create_completed {kept, discarded}` | **activation — % of starts that create ≥ 1** (target ≥ 60%) |
| Used it | `content_published` / `content_embedded` | published-not-just-created rate |
| Returned | next `import_started` by the same user within 7 d | **W1→W2 retention** |

Today the prototype logs `create_completed` (as `create_summary` + the full `ImportRecord`) and
every review-stage action. The rest are new one-line events.

### Time to value — measure two ways

- **In-flow TTV** = `create_completed − import_started`. Split out `generate_completed →
  create_completed` — that is **the cost of the review gate**, and it must not balloon vs. today.
- **Time to usable** = `first content_published − import_started`, plus **total edit-minutes in
  the 7 days after create** (later edits tied back to `importId`). This is where the rework should
  *win*: today's path is fast to "content in a folder", slow to "content I'd show a class".
- **Baseline to beat:** today's Smart Import = source → dump → open each editor → fix. If the
  live product can't be instrumented, stopwatch 3–5 educator sessions.

### Usage & quality

| Metric | Derived from |
|---|---|
| imports per active user per week | `import_started` |
| activities kept / generated per import | `ImportRecord.outcome` |
| **approve-without-edit rate** (kept ∧ ¬edited ∧ ¬refined ∧ ¬remixed) | `ImportRecord.decisions` |
| **rubber-stamp rate** (kept ∧ never `item_previewed`) | events |
| refine / remix / discard rates + reason breakdown | `review_event` |
| edit magnitude (`charsDelta`) | `review_event` |
| post-create edit rate at 7 / 30 d | later content edits keyed by `importId` |
| learner confusion reports per 100 activities | product signal (later) |

### Retention

W1→W2 and W1→W4 return rate · % of W1 imports whose creator does another in W2 · content-reuse
rate (created activities embedded in a course).

### A vs B — the two UI shapes

Both variants share the event stream. Tag every event and every `ImportRecord` with `uiVariant`
and an anonymous `sessionId`. Then, **unit = import**, compare A vs B on: activation rate ·
in-flow TTV · review-gate cost · approve-without-edit rate · refine actions per import. Live:
retention by variant.

### To add to the prototype

1. `uiVariant` + `sessionId` (one per browser, `localStorage`) on `review_event` and `ImportRecord`.
2. Milestone events: `import_started` · `generate_requested` / `generate_completed {latencyMs}` ·
   `item_previewed` · `create_completed` (rename the current summary).
3. A small roll-up (a script or `/api/metrics`) that turns `.review-events.jsonl` +
   `.imports.jsonl` into the funnel + TTV + approve-without-edit numbers — so the demo can *show*
   the dashboard, not just describe it.

---

## Roadmap — prioritization, sequencing, success measures

### North star & guardrail

- **North star: W1→W2 retention** (currently ~20%). Target **35%+ end of Phase 1**, **40%+ end
  of Phase 2**. Full metric tree in [Measurement](#measurement).
- **Guardrail — reduce, don't add, time-to-value.** The approval gate must make the *whole* job
  (idea → usable content) faster, not just add a review step. Levers: source read-back runs
  automatically; recommended activities pre-checked; a **Quick generate** path that skips activity
  selection entirely; everything **approved by default** so review is opt-out. Target:
  **time from source pasted → first approved set is lower than today's source → cleaned-up
  content**, even though a review screen now exists.

### Phase 1 — Fix the cliff (first-run trust + the gate)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Approval gate: proposed-content list + **live H5P preview per item** + approve/drop/refine | P0 | ≥ 60% of imports reach an approved set (vs. abandon after generate); median generate→approved < 5 min |
| 2 | Source grounding per item (show the source sentence) | P0 | Educator "I could tell if each item was right" ≥ 4/5 in usability test |
| 2 | Answer-key justification per item | P1 | Contributes to approve-without-edit rate ≥ 55% |
| 3 | Activity recommendation engine v1 (feasibility gate + desirability rank + count logic; see spec) | P1 | ≥ 50% of imports keep the recommended activity set unchanged; "created an activity then deleted it whole" rate ↓ |
| 3 | Source read-back panel | P1 | Leading indicator: poor-fit activity selections ↓ |
| 3 | Verbatim question extraction — **Pasted Text only**, prompt + approval-gate verification | P1 | For question-bearing sources, ≥ 50% choose Extract; edit rate on extracted items < 10% |
| 4 | Known-limitations disclosure at create time | P2 | First-run on unsupported sources (math/procedural) ↓ |
| — | **Phase gate** | | **W1→W2 retention 20% → 35%+** |

### Phase 2 — Fast & repeatable (returners → regulars)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Document ingestion pipeline: `.pptx` + PDF/DOCX (layout-aware, OCR) — file-based question extraction rides on this | P1 | `.pptx` approve-without-edit rate reaches clean-article parity; W2 retention for `.pptx`-first users reaches cohort average |
| 2 | Extraction verification pass (extracted item ↔ source-span diff, flag paraphrase/drop/renumber, unresolved keys) | P1 | Verbatim-mismatch rate on extracted items < 2%; educator-reported trust in extraction ≥ 4/5 |
| 1 | Full intent authoring: prompt-XOR-brief toggle · preset prompts · "improve" (user text only) | P1 | Prompt or brief used in ≥ 30% of imports by users with ≥ 2 imports; approve-without-edit higher for intent-driven imports |
| 2 | **Prompt & brief library** — system + author-saved templates (prompt or brief), optionally bundling the activity selection; MRU-sorted, recent marker, edit-without-clobber ("Update" vs "Save as new"). Account-scoped storage. | P1 | Among users with ≥ 3 imports, ≥ 40% start from a saved or system template; median time-to-generate ↓ for template starts; ≥ 20% of template users reuse the same template 3+ times |
| 2 | Inline item actions + scoped natural-language edits (Refine) | P1 | Median edits per approved item trends **down** across a user's successive imports |
| 2 | Per-activity controls + coverage grid | P2 | Cross-activity concept overlap ↓ (measured); "too many/few questions" feedback ↓ |
| 3 | Propagate-a-fix + preference memory | P2 | Same correction made twice by the same user → near zero |
| 3 | Personal track record + confidence indicators | P2 | Approval time decreases as track record accumulates |
| — | **Phase gate** | | **W2 retention 40%+; imports/active user/week ↑** |

### Phase 3 — Stickiness (habit + team expansion)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Per-session containers + provenance + two-way navigation | P1 | % of users who re-open a past import ↑; "find the content from last week's import" task success ≥ 90% |
| 2 | Session workspace (refine / add / export / publish set / bulk-move) | P2 | Published (not just created) rate ↑; bulk actions used |
| 2 | Choose destination at import time | P2 | ≥ 50% of imports placed outside the "Smart Import" folder |
| 3 | Confusion-report loop | P2 | % of confusion-flagged items regenerated ↑; downstream confusion rate on regenerated items ↓ |
| 3 | Assemble into a coherent Interactive Book | P2 | "Assemble" adoption; retention delta assembled vs. loose output |
| 3 | **Org layer**: admin-set generation policy (invisible: house style, spelling, accessibility, integrity) + org-published prompt/brief templates + optional 1–2 admin brief fields (course, standard) | P2 | Orgs with a policy set show lower cross-author style variance; ≥ 25% of enterprise/K-12 authors start from an org template |
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

### How the prototype de-risks this

The prototype is a working reproduction of Smart Import's generate-from-source behaviour, on which
the reworked workflow (intent → approval → refine → discover → trust) is built and demoed as if
live — without waiting on H5P engineering. It runs the same input Smart Import takes (a source +
an activity choice) and produces the same kind of output (H5P content.json rendered in the real
player). All generated content comes strictly from the source the educator provides; nothing is
canned. The prototype is the vehicle for testing whether the approval gate + grounding move the
retention needle before committing engineering to it.

---

## Sprint 2 demo

**Review & Approve → content library, built end-to-end**, with a slice of Screen 1 (auto source
read-back + intent + recommended activities) feeding it: an educator pastes a source (or a
Wikipedia URL), optionally states intent → recommended activities are pre-checked → generates →
sees a proposed-content list with a **live playable H5P preview per item** rendered in the real
player, plus grounding / answer-key trust signals → edits / refines / remixes / discards →
"Create N" → lands in the content library, each item tagged `from:` its import, with the
import-details receipt (a persisted `ImportRecord`) one click away — still reachable after
starting another import or reloading.

All previewed content is generated from that source in the session. Feedback question for
mentors: *"Would you trust this enough to put it in front of learners with only light review?"*
