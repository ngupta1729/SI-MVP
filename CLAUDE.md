# This Participant & Project

_Set during Orientation, 2026-08-30. Fuller detail in `reports/participant_profile.md`._

**Who:** A product manager who improves quality of life through AI-driven productivity gains, and
wants to build products/prototypes that weren't previously possible. Thinks visually (maps systems
as workflows). Comfortable at both no-code and code levels. Uses Claude Code and Cowork daily.

**Engineering level — calibrate to this:** Terminal basics are fine. **Git/GitHub is a known weak
spot** (branches, PRs, merging) and CLI-first tooling/scripting is unfamiliar — explain git and
shell steps before running them, and don't assume prior exposure. Match explanations to a strong
product thinker who is still building engineering fluency.

**Project:** A reworked **H5P Smart Import** — the AI feature in H5P.com that turns a source
document into H5P interactive content. This project redesigns that workflow end-to-end: how
educators author intent, how they review and approve what the AI generates, how they refine and
remix it, and how they find it afterward — anchored on Smart Import's declining retention
(~20% week-1 → week-2). Delivered as (a) a working Next.js prototype that reproduces Smart
Import's generate-from-source behaviour and layers the redesigned workflow on top, rendered in
the real H5P player, and (b) a product/UX spec (`specs/smart-import-ux.md`). Ground all examples
and scaffolding in H5P Smart Import specifically. _The early product walkthrough was only to
learn the existing flow — this project is dedicated to Smart Import, not a general
"product twin" tool._

**Starting autonomy level: L2 — AI as Collaborator.** The AI drafts the spec and prototype
changes; the participant reviews and approves each pass. Treat this as the current working mode,
and as a starting point they intend to level up from — flag opportunities to move toward L3 as
trust builds, don't silently operate more autonomously than L2.

**Constraints & cadence:** Cohort 2608, 4-week program ending Sep 18, 2026. **Weekends only**,
~2–3 weekends left. Sprint 2 Demo Sep 13, Final Demo Sep 18. Keep scope proposals sized for
weekend blocks. Chosen milestone shape: **one part of the workflow end-to-end** — take a single
meaningful slice of the Smart Import rework (e.g. the review/approve gate) all the way through
and demo it as if live, rather than redesigning the whole workflow at once.

**Motivation to reinforce:** giving PMs a fast, engineering-free path to prototype and demo a
real product change — here, making Smart Import's first output good enough that educators keep
using it instead of abandoning it after one try.

## Finding What to Work On

At the start of a session, or whenever a participant isn't sure what to do next, run the **`coach` skill**. It pulls the participant's upcoming Sherpa-B Blocks/Tasks (`task/get-upcoming`) alongside this repo's GitHub issues, discusses priority with the participant, hands off the chosen work to a second terminal, and verifies it actually got done before moving on. This is the intended entry point for "what should I work on" - don't try to reconstruct that flow manually from the individual MCP tools.

- `task/get-details`, `task/get-recent`, `task/update-status` - inspect or update a specific Sherpa-B Task; `coach` typically drives these, but use them directly if a participant asks about one specific task.

## Setup Troubleshooting

- **`project-init` skill** - binds this repo to a Sherpa-B project; must run once per repo, from the repo root, before any other Sherpa-B tool works. If a tool call fails with a project/auth-binding error, this is the first thing to check.
- **`shb-doctor` skill** - re-checks that orientation's workspace setup (telemetry install, seed files, settings) is actually in place, and fixes anything missing. Run this if a participant's workspace seems broken or incomplete (interrupted orientation, manual edits, a plugin version bump).

## Vocabulary

- **Cognitive Gym** - the broader identity behind the program: a place to deliberately keep practicing thinking skills your job no longer demands. More: https://sherpa-b.ai.science/docs/
- **Agentic Buildcamp** - this program's specific instance of a Cognitive Gym: a mentor-led, cohort-based program for building a real AI product (formerly called "bootcamp"). More: https://sherpa-b.ai.science/docs/agentic-buildcamp/
- **KnowledgeOps** - the methodology behind Agentic Buildcamp: turning expert judgment into a repeatable, teachable process across phases from ideation through go-to-market, each producing a concrete artifact. More: https://sherpa-b.ai.science/docs/agentic-buildcamp/
- **Sherpa-B** - the guidance tool (this MCP server plus the Claude Code plugin) that runs alongside Agentic Buildcamp, walking participants through KnowledgeOps phases as guided Tasks. More: https://sherpa-b.ai.science/docs/agentic-buildcamp/
- **Cohort** - the group of participants going through Agentic Buildcamp together at the same time.
- **Mentor** - gives a participant feedback on their specific build, both synchronously and asynchronously; distinct from the optional 1-on-1 mentorship add-on, which is direct extra mentor time on top of standard cohort feedback.
- **Zone** - groups a set of related Blocks.
- **Block** - a risk-driven arc of work within a Zone.
- **Task** - a unit of work within a Block; either `guided` (Claude Code walks the participant through it, internally run as a **workout** - see below) or `freestyle` (open-ended build work).
- **Workout** - the internal engine that drives a `guided` Task's step-by-step mechanics (`activity/get-workout` / `activity/get-step-prompt`, each state following an acquire/shape/deliver pattern). You don't need to drive this by hand - `coach` and the relevant workout-running skill handle it - but if you see `workout`/`on_success`/ASD terminology in tool output, that's what it refers to.
- Blocks and Tasks unlock gradually as prerequisites are met, so there is deliberately no fixed list to memorize or enumerate up front - always discover current, actionable work live rather than assuming a fixed catalog.

## shb_telemetry

The `shb_telemetry` package workouts call directly to log step progress and, if the participant opts in, fuller observation logs back to the Agentic Buildcamp dashboard. Run any of its commands (`shb-track-event`, `python3 -m shb_telemetry.config`, `shb-check-update`, `shb-read-log`) with `--help` to see what's available rather than assuming a fixed call shape.

Telemetry backup mode is participant-controlled (`shb_telemetry.config get`/`set`): `backup_only_progress_data` (default, keeps only which activity/step they're on) vs `backup_full_observation_log` (also backs up full decision/observation content). Don't change this without asking the participant.

### Troubleshooting shb_telemetry

- A workout step failing on an `shb_telemetry` call - first check the plugin (and its bundled `shb_telemetry`) is actually auto-updating: run `/plugins`, use Claude Code's in-UI navigation to reach "Marketplaces", select the sherpa-b marketplace, and enable auto-update (exact wording may vary by Claude Code version - follow what `/plugins` shows on screen).
- A workout step's `acquire` operations installing/upgrading `shb_telemetry` before using it is expected, not an error - it keeps every later step working without depending on a stale cached install path.

## Agentic Buildcamp Info

Run:

```
mcp__sherpa-b__activity__get-bootcamp-info
```

This returns the current program structure live from the Agentic Buildcamp dashboard (tiers, schedule, mentorship support, time commitment, sprint milestones, demo formats) - always check it rather than assuming a fixed cohort length or schedule, since these vary by cohort and change between runs of the program.

## Useful Tools

### MCP Tools

- `participant/get-profile` / `participant/update-profile` - read or update the participant's stored profile.
- `activity/submit-reflection` / `activity/get-reflections` - capture and retrieve participant reflections tied to a workout step.

### Plugin Skills

- **`warm-up` skill** - start a session by reviewing recently logged telemetry, letting the participant correct anything stale or wrong before diving in.
- **`cool-down` skill** - close out a freestyle (non-workout) session: commit changes, reflect, and persist notable decisions/facts/preferences.
- **`persist-content` skill** - persist notable info from a session ad hoc, outside of any workout checkpoint.
- **`open-dashboard` skill** - get a short-lived link to open the Sherpa-B web dashboard, optionally to a specific page (e.g. roadmap, progress).
- **`sprint-demo-prep` skill** - help a participant prepare a timed script and recording checklist for their sprint demo video.
- **`create-social-post` skill** - turn a workout reflection, planning doc, or observation into a ready-to-publish social post in the participant's own voice.

# Engineering Best Practices

Follow KISS and YAGNI principles:

**KISS (Keep It Simple, Stupid):**

- Use the simplest solution that solves the problem
- Avoid over-engineering or complex abstractions
- Prefer straightforward implementations

**YAGNI (You Aren't Gonna Need It):**

- Do not add features, code, or complexity that isn't required right now
- Only implement what is explicitly requested
- Do not anticipate future needs or build "just in case" features
