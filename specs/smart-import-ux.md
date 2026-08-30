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
- **Live interactive H5P preview** of the selected item, rendered in the real player — the
  educator *plays* it as a learner would.
- Per item, three actions only: **Approve · Edit · Discard.** (Edit = inline question/answer
  editing, no full editor. Regenerate lives inside Edit as "redo this item".)
- Everything is **approved by default** — the educator scans, edits or discards the exceptions,
  and ships. Reviewing is opt-out, not opt-in.
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

The educator authors intent in **exactly one mode** — a written prompt **or** a guided brief.
They are mutually exclusive: a free-text prompt and a set of structured fields can contradict
each other, and it's ambiguous which wins. A segmented toggle switches between them.

**Write a prompt**

| Element | Behaviour |
|---|---|
| Free-text box | The primary input. Lowest friction; default mode. |
| **Preset prompts** | Clickable, each fills the box with a best-practice prompt: _Exam revision · Introduce a topic · Check prior knowledge · **Extract existing questions**_. |
| **"Improve this prompt"** | Rewrites the text to best practice. **Shown only for text the educator wrote or edited** — never for a pristine preset (a preset is already best practice; offering to "improve" our own suggestion makes no sense). It reappears the moment the educator edits a preset. |

**Guided brief**

Structured form: learning goal, audience level, emphasis (recall ↔ understanding ↔ application),
volume (light / standard / thorough), language. No free-text prompt, no presets, no "improve" —
the brief *is* the intent; the twin serialises it into an instruction internally.

**Prompt & brief library** — one library, three tiers:

| Tier | Source | Editable |
|---|---|---|
| **System templates** | The predesigned prompts (Exam revision, Introduce a topic, Check prior knowledge, Extract existing questions) | Read-only, used as-is |
| **Personal templates** | Any Scratch prompt the author wrote, or any brief they configured — named and saved | Author's own (rename / delete) |
| **Org templates** _(admin layer, later)_ | Admins publish org-wide starting points | Read-only to authors |

A saved template captures whichever mode it was made in — a prompt **or** a brief. Personal
templates appear in the "Start from:" row next to the system ones
(`[Scratch] [system…] [★ My Grade 9 Bio]`); brief mode gets a "Load / Save brief" control.

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
  produces (Single Choice Set, Summary, Question Set, Crossword, Drag the Words are all
  text-based). Revisit when image-based content types (Image Hotspots, image Drag-and-Drop, Find
  the Hotspot) enter the Smart Import catalog.

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

**Output contract.** The engine produces exactly one thing: the **recommended (pre-checked) set
of content types on Screen 2**, each with a suggested **item count** and a one-line **reason**. It
does not generate content, pick destinations, or gate progression. Everything it proposes is
overridable on Screen 2.

**Two inputs, two roles.**

- **Source material → feasibility** _(a gate)_: can a *good* activity of this type be built from
  this raw material?
- **Intent (the prompt or the brief) → desirability** _(a ranker)_: among feasible types, which
  serve the teacher's stated goal?

Source is never overridden by an intent that wants something infeasible; intent never promotes a
type the source can't support.

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
- **Guardrail — reduce, don't add, time-to-value.** The approval gate must make the *whole* job
  (idea → usable content) faster, not just add a review step. Levers: source read-back runs
  automatically; recommended activities pre-checked; a **Quick generate** path that skips activity
  selection entirely; everything **approved by default** so review is opt-out. Target:
  **time from source pasted → first approved set is lower than today's source → cleaned-up
  content**, even though a review screen now exists.

### Phase 1 — Fix the cliff (first-run trust + the gate)

| Seq | Item | Priority | Success measure |
|---|---|---|---|
| 1 | Approval gate: proposed-content list + **live H5P preview per item** + approve/drop/regenerate | P0 | ≥ 60% of imports reach an approved set (vs. abandon after generate); median generate→approved < 5 min |
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
| 2 | Session workspace (regenerate / add / export / publish set / bulk-move) | P2 | Published (not just created) rate ↑; bulk actions used |
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

### How the twin de-risks this

The twin is a working reproduction of Smart Import's generate-from-source behaviour, on which the
reworked workflow (intent → approval → refine → discover → trust) is prototyped and demoed as if
live — without waiting on H5P engineering. It runs the same input Smart Import takes (a source +
an activity choice) and produces the same kind of output (H5P content.json rendered in the real
player). All generated content comes strictly from the source the educator provides; nothing is
canned. The twin is the vehicle for testing whether the approval gate + grounding move the
retention needle before committing engineering to it.

---

## Sprint 2 demo

**Screen 3 (Review & Approve) built end-to-end**, with a slice of Screen 1 (auto source read-back
+ intent + recommended activities) feeding it: an educator pastes a source (or a Wikipedia URL),
optionally states intent → recommended activities are pre-checked → generates → sees a
proposed-content list with a **live playable H5P preview per item** rendered in the real player,
plus grounding / answer-key trust signals → approves / edits / discards → creates the set.

All previewed content is generated from that source in the session. Feedback question for
mentors: *"Would you trust this enough to put it in front of learners with only light review?"*
