# Smart Import — Educator Workflow UX Proposal

_Draft, 2026-08-30. Living document — still accumulating ideas._

## Context

**Smart Import** (H5P.com only) turns a document, URL, or pasted text into H5P interactive
content using AI. This proposal reworks the *educator workflow* around it — how they express
what they want, review what the AI produced, refine it, and find it later.

### Observed happy path (from a live run — "Plate Tectonics", pasted text → Single Choice Set + Summary)

1. Manage Content → **Smart Import** → **Create Content** (shows remaining import credits).
2. **Configure Content**: pick a source (File / YouTube / Wikipedia / Web Page / Pasted Text),
   optionally expand one **Customization** free-text box, choose output **language**. → Next
3. **Select Activities**: check any number from 4 categories (Test Knowledge / Present Content /
   Practice & Games / Interactive Media). No per-activity config. → Generate
4. **Generating Content** (~15–30s for two activities) → each activity becomes a **separate H5P
   content item** dumped flat into one "Smart Import" folder.
5. **Refine**: open each item → **Edit** in the full H5P editor, or **View**. Export via the
   player's Reuse → Download as `.h5p`.

### Core friction

| Stage | Problem |
|---|---|
| Intent | One optional, collapsed free-text box. Blank-page problem — the educator must know what to write. |
| Activity selection | Blind checkboxes. No fit-to-source signal, no item counts, no idea what each will cover. |
| Generation | Credits spent with **no preview**. Black-box wait. |
| Output | Activities generated independently → concept overlap, no coherent lesson. |
| Refinement | Per-artifact, in the full editor. No targeted regen, no natural-language edit, no propagating a fix. |
| Discoverability | Every import from every educator lands flat in one folder; the only session→content link is a title prefix. |
| Loop | Every import starts from zero. `Confusion feedback` on published content never feeds back in. |

---

## Stage 1 — Intent authoring

**One underlying intent object, four on-ramps** — meet educators at their level of willingness to
spec things out.

| On-ramp | What it is | For the educator who… |
|---|---|---|
| **Free-form prompt** | The plain text box that exists today. Stays the default, lowest-friction path. | knows what they want and will type a sentence |
| **Guided brief** | Toggle to a structured form: learning goal(s), audience / grade, assumed prior knowledge, difficulty, emphasis (recall ↔ understanding ↔ application), tone, terminology & spelling conventions, volume. Same intent object, different view. | wants scaffolding and doesn't know what "good" looks like |
| **Preset briefs** | Clickable starting points that drop in a well-crafted prompt **and** pre-fill the brief fields, ready to edit: _Exam revision · Introduce a new topic · Check prior knowledge · Deep conceptual practice · Accessible / ESL language._ | faces the blank page and wants a running start |
| **"Improve this prompt"** | Rewrites what they typed using prompt-engineering best practices — specificity, measurable objectives, structure, constraints. Shows a diff; accept or edit. Also teaches what a strong brief looks like. | typed something rough and wants it sharpened |

**How they interlock**
- Free-form and guided brief are two views of the same intent — switching loses nothing.
- Presets seed both views.
- "Improve this prompt" works on the free-text and **back-fills** the brief fields it inferred.
- Guided-brief fields are **pre-suggested from the source** (proposed objectives, detected level)
  — "guided" is not pure data entry.
- Any resulting intent can be **saved as a reusable named brief** ("My Grade 9 Biology default")
  — feeds preference memory and Stage 4.
- After generation, show **which parts of the brief actually shaped the output**.

### Content-type recommendation (uses source *and* intent)

Before activity selection, show a read-back:

> Your source is conceptual (~500 words, 6 key concepts: …) and your goal is application-level
> assessment for first-years → **Recommended: Single Choice Set, Question Set, Higher-Order
> Questions.** Not recommended: Crossword (few factual terms), Dialog Cards (goal is assessment,
> not memorization).

Activities are ranked and pre-checked, each with a one-line reason. The educator can override.

---

## Stage 2 — Approval (a review gate before spend) — highest leverage

Insert a checkpoint between "Generate" and "content exists". This is the single biggest shift.

- **Plan preview, cheap and fast**: generate only the outline first — per activity: title, target
  concepts / objectives, item count, 1–2 sample items.
- **Proposed content list**: every item that will be created, grouped by activity.
- **Live interactive preview per item**, rendered in the **real H5P player** — the educator plays
  it exactly as a learner would. No approving blind.
- Per item: **Approve · Drop · Edit (inline / natural-language) · Regenerate.**
- Per-activity controls: item count, difficulty override, "focus on objective X", "avoid overlap
  with [other activity]".
- **Coverage grid**: objectives × activities — redundancy and gaps visible at a glance.
- **Cost transparency**: "This plan will use 2 credits and produce ~18 items" before commit.
- Output lands in a **review workspace**, not auto-filed.

### The approval stage is also an eval surface

- **Automated quality checks, surfaced inline**: reading level vs. target; duplicate-concept
  detection across items; "this distractor is defensible"; answer-key sanity; coverage vs.
  stated objectives; factual consistency with the source.
- **The educator's decisions are labeled signal**: every approve / drop / edit / regenerate feeds
  (a) a quality score for this generation, (b) tuning signal for future generations, (c)
  preference memory ("this educator always drops pure-recall questions"). The approval history
  is stored in the item's provenance (Stage 4).

---

## Stage 3 — Refinement (targeted + conversational)

Move off "open the full editor and hunt through form fields".

- **Inline item actions** on any question / card: Regenerate · Easier / Harder · Rephrase ·
  "This distractor is actually correct" · Delete — no full editor.
- **Scoped natural-language edits**: "shorten all summary statements", "make Q3–5 about the
  evidence, not the mechanism", "swap crossword clues to definitions".
- **Propagate a fix**: correcting "plate boundary" → "plate margin" offers to apply across every
  artifact in the import, and remembers it for future imports.
- **Regenerate one artifact** with adjusted parameters without redoing the whole import.
- **Post-generation coverage report**: objectives × activities, with a "generate something for
  the gap" action.

---

## Stage 4 — Discoverability & organization of generated content

**Friction:** every import from every educator dumps into one flat "Smart Import" folder; the
only session→content link is a fragile title prefix (`<Import> - <activity>`); a content item
carries no provenance; the folder grows unbounded with no lifecycle.

**Improvements**
- **Per-session container**: each import creates its own collection / subfolder
  (`Plate Tectonics — 30 Aug`), or the import session becomes a first-class object that *owns*
  its generated content.
- **Provenance on every generated item**: source, link to the import session, the brief used,
  generation date, model version — in the item's detail panel and as a library filter
  (`Source: Smart Import → [session]`).
- **Two-way navigation**: Imports list → *that session's* content; content item → "Created by
  Smart Import · view session · view source · reopen brief".
- **Session page as a workspace**: shows its own outputs + status; regenerate / add activities /
  export the set / publish the set / bulk-move to a course folder.
- **Choose the destination at import time** (`Biology 101 / Unit 3`) instead of always "Smart
  Import".
- **Lifecycle**: archive or delete a session and (optionally) its generated content in one action.

**Connection to Stage 2:** the review workspace and this are the same surface — approved content
leaves the gate *with provenance attached* and goes to the educator's chosen destination, not an
anonymous pile.

---

## Stage 5 — Trust

The load-bearing layer. The whole project rests on whether educators (and reviewers) believe
AI-generated learning content enough to put it in front of learners.

- **Source grounding per item**: every question / statement shows the exact source sentence(s)
  it was derived from.
- **Extraction vs. inference flag**: mark items lifted from the source vs. those the AI reasoned
  beyond it.
- **Answer-key justification**: a one-line "why this is correct / why the distractors are wrong",
  checkable at a glance.
- **Factual-consistency check vs. source**: flag hallucination risk before the educator reviews.
- **Confidence indicator per item**: direct review attention to where the model is least sure.
- **Objective + Bloom's alignment shown**: each item mapped to the objective it serves and its
  cognitive level.
- **Nothing published without approval**: the Stage 2 gate as an explicit, non-bypassable
  guarantee.
- **Educator is author of record**: the AI is assistive; the educator's name and approval are
  what's attached to the content.
- **Generate-vs-edit audit trail**: per item, what the AI produced vs. what the educator changed.
- **AI-generated labeling**: provenance label on content; optional learner-facing disclosure.
- **Source reliability signal**: "Wikipedia (curated)" vs. "arbitrary web page" — warn on weak
  sources.
- **Known-limitations disclosure**: "best for conceptual content; weak for procedural / math"
  shown at create time.
- **Personal track record**: "you approved 85% / edited 10% / dropped 5% across your last 5
  imports" — calibrated trust over time.
- **Confusion-report loop**: learner confusion on published items flows back with a one-click
  regenerate.
- **Generation transparency**: stream what the AI extracted and is drafting per activity, with
  cancel / adjust.

---

## Master opportunity list

| Stage | Opportunity | What it does / why it matters | Priority |
|---|---|---|---|
| 1 · Intent | Free-form prompt (keep) | Lowest-friction default | Baseline |
| 1 | Guided brief | Structured form — goals, audience/grade, prior knowledge, difficulty, emphasis slider, tone, terminology/spelling, volume | High |
| 1 | Preset briefs | Clickable starts (Exam revision, Introduce a topic, Check prior knowledge, Deep practice, Accessible/ESL) that fill prompt + fields | High |
| 1 | "Improve this prompt" | Prompt-engineering rewrite with diff view; teaches what good looks like | Med |
| 1 | Prompt ↔ brief = one object | Two views, switching loses nothing | High |
| 1 | "Improve" back-fills brief fields | Inferred goal/audience/difficulty populate the form | Med |
| 1 | Brief fields pre-suggested from source | Proposed objectives, detected level | High |
| 1 | Auto-propose learning objectives | Reads source, suggests 1–5 to accept/edit | High |
| 1 | Save reusable named brief | "My Grade 9 Biology default" | Med |
| 1 | Source read-back before activity select | "Conceptual, ~500 words, 6 concepts: […]" | High |
| 1 | Content-type recommendation from source + intent | Ranked, pre-checked, one-line reason each; overridable | High |
| 1 | Post-gen: show which brief parts shaped output | Helps refine the brief next time | Low |
| 2 · Approve | Plan preview before full generation | Outline only before spending credits | High — demo |
| 2 | Proposed content list | Every item to be created, grouped by activity | High — demo |
| 2 | Live interactive H5P preview per item | Real player, playable as a learner — no approving blind | High — demo |
| 2 | Per-item: Approve / Drop / Edit / Regenerate | The decision surface | High — demo |
| 2 | Per-activity controls | Item count, difficulty, focus on objective, avoid overlap | High |
| 2 | Coverage grid (objectives × activities) | Redundancy and gaps at a glance | Med |
| 2 | Cost transparency before commit | "2 credits, ~18 items" | Med |
| 2 | Review workspace (not auto-filed) | Approved → published; rejected → discarded cleanly | High |
| 2 | Automated eval checks inline | Reading level, duplicate concepts, defensible distractor, answer-key sanity, coverage, source consistency | High |
| 2 | Decisions captured as eval/tuning signal | Approve/drop/edit/regenerate → quality score + future tuning | Med |
| 2 | Decisions feed preference memory | "Always drops pure-recall questions" | Med |
| 3 · Refine | Inline item actions | Regenerate · Easier/Harder · Rephrase · flag distractor · Delete — no full editor | High |
| 3 | Scoped natural-language edits | "Shorten all summary statements", "make Q3–5 about the evidence" | High |
| 3 | Propagate a fix across artifacts + remember | "plate boundary" → "plate margin" everywhere, sticks | Med |
| 3 | Regenerate one artifact | Adjusted params, no full redo | Med |
| 3 | Post-gen coverage report + "fill the gap" | One-click generate for a gap | Med |
| 4 · Discover | Per-session container | Each import owns its content — not a flat dump | High |
| 4 | Provenance on every item | Source, session link, brief, date, model version | High |
| 4 | Provenance as library filter | `Source: Smart Import → [session]` | Med |
| 4 | Two-way navigation | Session ↔ content, both directions | High |
| 4 | Session page as workspace | Outputs + status, regenerate, add activities, export/publish set, bulk-move | Med |
| 4 | Choose destination folder at import time | `Biology 101 / Unit 3`, not "Smart Import" | Med |
| 4 | Lifecycle: archive/delete session + content together | Folder stops growing unbounded | Low |
| 5 · Trust | Source grounding per item | Each question/statement shows the exact source sentence(s) it came from | High |
| 5 | Extraction vs. inference flag | Mark items lifted from the source vs. reasoned beyond it | High |
| 5 | Answer-key justification | One-line "why correct / why distractors wrong", checkable fast | High |
| 5 | Factual-consistency check vs. source | Flag hallucination risk before review | High |
| 5 | Confidence indicator per item | Direct review attention to where the model is least sure | Med |
| 5 | Objective + Bloom's alignment shown | Each item mapped to objective + cognitive level | High |
| 5 | Nothing published without approval | Stage 2 gate as explicit, non-bypassable guarantee | High |
| 5 | Educator is author of record | AI is assistive; educator's name + approval attached | High |
| 5 | Generate-vs-edit audit trail | Per item: what the AI produced vs. what the educator changed | Med |
| 5 | AI-generated labeling | Provenance label; optional learner-facing disclosure | Med |
| 5 | Source reliability signal | "Wikipedia (curated)" vs. "arbitrary web page" — warn on weak sources | Med |
| 5 | Known-limitations disclosure | "Best for conceptual; weak for procedural/math" at create time | Med |
| 5 | Personal track record | "Approved 85% / edited 10% / dropped 5% over last 5 imports" — calibrated trust | Med |
| 5 | Confusion-report loop | Learner confusion flows back with one-click regenerate | Med |
| 5 | Generation transparency | Stream what the AI extracted and is drafting per activity; cancel/adjust | Med |

---

## What to build for the Sprint 2 demo

**The Stage 2 plan-preview / approval gate**, with:
- a slice of Stage 1 structured intent feeding it,
- a proposed-content list with **live interactive H5P preview per item**,
- inline approve / drop / regenerate.

Rationale: biggest single UX shift; most demoable (clear before/after vs. "hit Generate and
pray"); stresses the digital twin hardest — it must produce a *faithful* plan and sample items
that a mentor believes match what real Smart Import would generate. Shown side-by-side with a
captured real Smart Import output for the same source.
