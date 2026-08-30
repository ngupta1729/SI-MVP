// Shared types for the H5P Smart Import twin.

export type SourceKind = "text" | "url";

export interface TwinSource {
  kind: SourceKind;
  /** Raw pasted text, or the URL string. */
  value: string;
}

/** The reworked "intent" step — richer than Smart Import's language + checkboxes. */
export interface ImportIntent {
  /** Free-form prompt (the default on-ramp). */
  prompt: string;
  learningGoal: string;
  audienceLevel: "beginner" | "intermediate" | "advanced";
  /** What the educator wants to weight. */
  emphasis: "assessment" | "concept_explanation" | "balanced";
  language: string;
  /** "generate" new items, or "extract" questions already present in the source. */
  mode: "generate" | "extract";
  /** H5P content-type machine names the educator wants generated. */
  contentTypes: string[];
}

/** What the source read-back surfaces before activity selection. */
export interface SourceAnalysis {
  kind: "conceptual" | "procedural" | "narrative" | "mixed";
  wordCount: number;
  concepts: string[];
  /** Questions already present in the source (drives the extract-as-is offer). */
  detectedQuestions: number;
  /** Suggested learning objectives read off the source. */
  suggestedObjectives: string[];
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

export interface GeneratedItem extends PlanItem {
  /** H5P content.json payload for this artifact (null if no mock builder yet). */
  contentJson: unknown;
  /** h5p.json params library string, e.g. "H5P.Summary 1.10". */
  mainLibrary: string;
  /** Trust signals surfaced at the approval gate. */
  grounding?: string; // the source sentence(s) this item was built from
  answerKeyNote?: string; // one-line "why the key is correct"
  confidence?: "high" | "medium" | "low";
  provenance?: "extracted" | "inferred"; // lifted from source vs. reasoned beyond it
}

export interface RealSampleMatch {
  name: string;
  sourceHint: string;
  h5pJsonPath: string;
  contentType: string;
  /** 0–1 token overlap between this import's source and the captured sample's. */
  similarity: number;
}

export interface TwinResult {
  /** One-paragraph read of what the source is about. */
  sourceSummary: string;
  planNarrative: string;
  items: GeneratedItem[];
  /** "model" when produced by an LLM, "mock" for the deterministic fallback. */
  engine: "model" | "mock";
  /** A captured real Smart Import run for THIS source, if one exists. */
  realSample: RealSampleMatch | null;
}
