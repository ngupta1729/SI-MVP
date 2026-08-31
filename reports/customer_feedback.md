# Customer feedback — shipped Smart Import (pre-rework)

_Compiled 2026-08-31. Raw inventory — the evidence base for `specs/smart-import-ux.md`
(§ "Existing customer feedback") and for the User Research block._

## What this is

Relayed customer voice on the **shipped** Smart Import, collected before this project began:

- **Slack** `customer-feedback-h5p` (H5P customer-success channel) — support tickets, CS calls,
  and one customer "test week" write-up. Messages dated Jan 2026 (thread history) through
  mid-2025.
- **Google Doc** "Customer feedback – Smart Import" (last edited Apr 21) — a CS-maintained log
  table (Sep 2025 – Apr 2026) plus a synthesis section by the product team.

It is **directional, not quantified** — no counts, no severity scoring, selection bias toward
customers who bothered to write in. Treat each item as a hypothesis for User Research to test,
not a settled fact.

## Verbatim / near-verbatim quotes

| # | Source | Customer / context | Quote or item |
|---|---|---|---|
| Q1 | Slack, ~Jan 30 | Foreign-language & soft-skills author, after a "Smart Import test week" | "Smart Import primarily identifies only a limited number of concepts from the documents. The format for these concepts is often just a simple 'keyword and definition' pair, and the resulting exercises lack variety. Consequently, Smart Import can't yet replace my current workflow, which involves using an LLM to generate diverse exercise types and then manually recreating them in H5P." |
| Q2 | Slack, ~Jan 15 | Norwegian customer | "When using SI in Norwegian, all buttons are still in English." · "The longest alternatives seem to always be the correct one." · "No option to choose to NOT have hotspots in Interactive Video." · "No option to decide number of questions / type of questions in Interactive Video." |
| Q3 | Slack, ~Jan 21 | Customer (via CS) | "A customer wish it was possible to generate activities based on their own templates and not the template we have created." |
| Q4 | Slack, Jul 31 | US customer (via CS) | "concerned about the increasing number of individual teachers in the US who are being sued by their students for using AI to create course content… less confident about recommending Smart Import… Would it be possible for us to have some kind of statement… that outlines what content is made and that the faculty members are responsible for the upload / editing / maintenance of content created by Smart Import… confirming that their expertise and experience still play a large part in the content creation process." |
| Q5 | Slack, Aug 1 | Customer (via CS) | "I would love any tips there are to getting better questions, and especially better distractors (it's always obvious that the long answer is the correct one)." |
| Q6 | Slack, ~Jan 19 | H5P product team, investigating Q2/Q5 | "there might indeed be some problems with the longest alternatives often appearing as the correct answer. This seems to be extra problematic for specific languages, and when the different options are longer sentences, and not just numerals or names… We need to iterate on our prompts to improve in this area." |

## CS log table (Google Doc)

| Org | Date | Type | Item |
|---|---|---|---|
| K2 Kompetanse | 2026-04-08 | Feature Request | Smart Import — select number of quiz questions |
| University of Australia | 2026-04-08 | Feature Request | Smart Import + Interactive Video auto-bookmarks |
| University of Australia | 2026-04-08 | Feature Request | Smart Import "Create All" |
| College of Veterinary Medicine | 2026-04-08 | Feature Request | Smart Import + branching scenario |
| Unknown | 2026-03-11 | — | Cannot edit captions for YouTube / MP4 in Smart Import and Interactive Video |
| Unknown | 2026-02-20 | — | AI-generated questions are too dry and miss visual info (graphs / drawings) |
| London Met | 2025-09-19 | Pricing Request | Dissatisfaction with Smart Import credit system; "feels old fashioned" |

## Product-team synthesis (Google Doc)

**Architecture**
- Move to thresholds / usage-based consumption models rather than credits _(work items exist)_

**Model / flow**
- Reduce friction by removing / automating steps in the generation process _(work items exist)_
- More flexibility in the format and structure of generated content — e.g. specify how many
  questions, with how many answers per question, in a Question Set _(Slack thread)_
- Ability to create organization templates for Smart Import content format and structure
  _(Slack thread)_
- Output quality: the longest answer is usually the correct one _(Slack thread)_
- Improved solution for where the generated content is saved
- Ability to navigate back and forth in the generation process (allow for more iterations
  underway)
- Rebrand Smart Import (internal strategic objective) and consolidate it with the AI assistant
  in the editor
- Ability to integrate multiple sources in one generation
- Ability to adjust the difficulty level of the questions generated
- Allow generating questions with audiovisual content
- Ensure all generated content is high quality — avoid feedback such as "your answer is wrong
  because it is wrong"

**General UI**
- Improved steps for submitting content and selecting content types _(work items exist)_
- Add more data to each generation: what language settings and customization prompts were used,
  which H5Ps were generated, etc.

**Other**
- Add a statement on responsible use of AI and what authors should do as part of the content
  generation process
- Clearly state when additional information is added by the LLM, and what is taken directly from
  the input material

## Themes (for citation)

| Theme | Items | Spec § | Status in the rework |
|---|---|---|---|
| T1 · Output lacks variety & depth | Q1, "too dry / misses visuals" | Existing customer feedback §1 | partial |
| T2 · No control over what's generated | K2 Kompetanse, "#Q × #answers", "adjust difficulty", Q2 (IV) | §2 | addressed (design); count/difficulty `next` |
| T3 · Obvious distractors ("longest = correct") | Q2, Q5, Q6 | §3 | partial — caught at review gate, generation fix open |
| T4 · Authors want their own output templates | Q3, "org templates" | §4 | addressed (personal); org `later` |
| T5 · Rigid flow, no mid-generation iteration | "navigate back and forth", "reduce friction", "where content is saved" | §5 | addressed |
| T6 · Transparency (LLM-added vs. source) | "clearly state what the LLM added", "add more data per generation" | §6 | addressed (design); line-level diff `next`/`later` |
| T7 · Responsible-AI / author liability | Q4, "wrong because it is wrong" | §7 | partial — workflow supports it; customer statement is H5P's |
| T8 · Out of this slice | multiple sources, IV/media/captions, branching, i18n, credits, rebrand | §8 | not taken on (platform or later phase) |

## Notes for User Research

- **Q1 is the load-bearing one** — a paying customer running a structured trial concluded Smart
  Import "can't yet replace my workflow." Same shape as the W1→W2 retention cliff. Worth a
  dedicated interview probe: *what would "enough variety / depth" look like on your material?*
- **T3 is confirmed by internal investigation**, not just customer perception — lower priority to
  re-validate, higher priority to fix.
- Language / locale recurs (Q2, Q6): non-English output quality and untranslated UI. The rework
  only touches the content side (a Refine "in another language" steer); the UI-string gap is
  platform i18n.
