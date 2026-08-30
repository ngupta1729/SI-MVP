// Shared types for the H5P Smart Import twin.

export type SourceKind = "text" | "url";

export interface TwinSource {
  kind: SourceKind;
  /** Raw pasted text, or the URL string. */
  value: string;
}

/** The reworked "intent" step — richer than Smart Import's language + checkboxes. */
export interface ImportIntent {
  learningGoal: string;
  audienceLevel: "beginner" | "intermediate" | "advanced";
  /** What the educator wants to weight. */
  emphasis: "assessment" | "concept_explanation" | "balanced";
  language: string;
  /** H5P content-type machine names the educator wants generated. */
  contentTypes: string[];
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
  /** H5P content.json payload for this artifact. */
  contentJson: unknown;
  /** h5p.json params library string, e.g. "H5P.Summary 1.10". */
  mainLibrary: string;
}

export interface TwinResult {
  /** One-paragraph read of what the source is about. */
  sourceSummary: string;
  planNarrative: string;
  items: GeneratedItem[];
  /** "model" when produced by an LLM, "mock" for the deterministic fallback. */
  engine: "model" | "mock";
}
