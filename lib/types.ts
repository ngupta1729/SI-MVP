// Shared types for the H5P Smart Import twin.

export type SourceKind = "text" | "url";

/** @deprecated superseded by BriefField — kept only so old saved templates parse. */
export interface BriefParam {
  label: string;
  value: string;
}

export type BriefFieldType = "select" | "text" | "number";

/**
 * One row of a guided brief. The educator designs these in the brief's edit
 * mode — label, control type, the allowed values of a dropdown, whether it is
 * required — then the saved brief renders exactly those fields for filling in.
 */
export interface BriefField {
  id: string;
  label: string;
  type: BriefFieldType;
  /** Allowed values — used when `type === "select"`. */
  options: string[];
  required: boolean;
  /** The educator's filled-in value (empty until picked / typed). */
  value: string;
}

export interface TwinSource {
  kind: SourceKind;
  /** Raw pasted text, or the URL string. */
  value: string;
}

/**
 * The reworked "intent" step. Intent is authored in ONE mode — a written prompt
 * OR a guided brief — never both. `authoringMode` says which fields are live.
 */
export interface ImportIntent {
  authoringMode: "prompt" | "brief";

  /**
   * Live when authoringMode === "prompt". Either the exact text of a pre-designed
   * prompt (when promptPresetId is set) or the educator's own text (scratch).
   */
  prompt: string;
  /** null = writing from scratch (editable, improvable); else a preset id (used as-is). */
  promptPresetId: string | null;

  /**
   * Live when authoringMode === "brief". Emphasis and Volume stay fixed — the
   * recommendation engine reads them as structured values. Everything else the
   * educator says is in `briefFields`, a form they design and can save by name.
   */
  emphasis: "assessment" | "concept_explanation" | "balanced";
  volume: "light" | "standard" | "thorough";
  briefFields: BriefField[];

  /** "generate" new items, or "extract" questions already present in the source. */
  mode: "generate" | "extract";
  /** H5P content-type machine names the educator wants generated. */
  contentTypes: string[];
}

/**
 * What the source read-back surfaces before activity selection. Purely advisory —
 * it describes the material's strengths and watch-outs so the author knows what to
 * expect; it never blocks or discourages use.
 */
export interface SourceAnalysis {
  kind: "conceptual" | "procedural" | "narrative" | "reference" | "mixed";
  wordCount: number;
  /** Reading level in the author's terms, e.g. "upper-secondary", "introductory". */
  readingLevel: string;
  /** Substantive concepts a teacher would assess — multi-word allowed. */
  concepts: string[];
  /** Themes the generated content will draw on, roughly weighted (heaviest first). */
  themes: string[];
  /** What this source is good raw material for. */
  strengths: string[];
  /** What to expect / what it won't cover well — neutral, not a verdict. */
  watchOuts: string[];
  /** Questions already present in the source (drives the extract-as-is offer). */
  detectedQuestions: number;
  /** Suggested learning objectives read off the source — real, measurable, editable. */
  suggestedObjectives: string[];
  /** Activity types the engine recommends (pre-checked on Screen 2), 1–3, best first. */
  recommendations: ActivityRecommendation[];
  /** "model" when the LLM produced this, "heuristic" for the offline fallback. */
  engine: "model" | "heuristic";
}

export interface ActivityRecommendation {
  /** H5P machine name, e.g. "H5P.SingleChoiceSet". */
  name: string;
  /** true = pre-check it on Screen 2. */
  recommended: boolean;
  /** one line: why (or why not) — shown on the card. */
  reason: string;
  /** suggested item count for this activity. */
  itemCount: number;
}

/** One planned artifact, shown in the approval step before it is finalized. */
export interface PlanItem {
  id: string;
  contentType: string;
  title: string;
  /** Key concepts from the source this artifact is built on — surfaced for approval. */
  concepts: string[];
  rationale: string;
}

export interface QuestionSignal {
  /** the source sentence(s) this question was built from */
  grounding: string;
  /** one line: why the marked key is correct */
  answerKeyNote: string;
  confidence: "high" | "medium" | "low";
}

export interface GeneratedItem extends PlanItem {
  /** H5P content.json payload for this artifact (null if no mock builder yet). */
  contentJson: unknown;
  /** h5p.json params library string, e.g. "H5P.Summary 1.10". */
  mainLibrary: string;
  /** Per-question trust signals, parallel to contentJson.choices. */
  questionSignals?: QuestionSignal[];
  /** Activity-level trust signals (fallback / summary). */
  grounding?: string;
  answerKeyNote?: string;
  confidence?: "high" | "medium" | "low";
  provenance?: "extracted" | "inferred"; // lifted from source vs. reasoned beyond it
}

export interface TwinResult {
  /** One-paragraph read of what the source is about. */
  sourceSummary: string;
  planNarrative: string;
  items: GeneratedItem[];
  /** "model" when produced by an LLM, "mock" for the deterministic fallback. */
  engine: "model" | "mock";
  /** Model id when engine === "model", else null. Set by the API route. */
  model?: string | null;
}
