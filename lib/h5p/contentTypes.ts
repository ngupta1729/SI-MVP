// The Smart Import activity catalog, as observed on H5P.com (Aug 2026).
// `twin: "full"`  -> the twin generates content.json AND a captured real .h5p
//                    render substrate exists (see scripts/prepare-h5p.mjs).
// `twin: "mock"`  -> the twin generates plausible content.json but there is no
//                    render substrate yet, so no live preview.
// `twin: "none"`  -> catalog-only for now.

export type TwinLevel = "full" | "mock" | "none";

export interface ContentTypeDef {
  name: string; // machine name, e.g. "H5P.SingleChoiceSet"
  key: string; // Smart Import's activity key, e.g. "single-choice-set"
  label: string;
  category: "Test Knowledge" | "Present Content" | "Practice & Games" | "Interactive Media";
  library: string; // h5p.json library string (reconcile with prepare-h5p.mjs output)
  renderHost: string; // folder under public/h5p/ for the render substrate
  twin: TwinLevel;
  blurb: string;
  /** Kinds of source this activity is a good fit for — drives recommendations. */
  goodFor: string[];
}

export const CONTENT_TYPES: ContentTypeDef[] = [
  {
    name: "H5P.SingleChoiceSet",
    key: "single-choice-set",
    label: "Single Choice Set",
    category: "Test Knowledge",
    library: "H5P.SingleChoiceSet 1.11",
    renderHost: "single-choice-set",
    twin: "full",
    blurb: "Fast sequence of single-answer multiple-choice questions.",
    goodFor: ["conceptual", "assessment", "recall", "understanding"],
  },
  {
    name: "H5P.QuestionSet",
    key: "question-set",
    label: "Question Set",
    category: "Test Knowledge",
    library: "H5P.QuestionSet 1.20",
    renderHost: "question-set",
    twin: "mock",
    blurb: "A quiz made of several question types with one combined score.",
    goodFor: ["conceptual", "assessment", "mixed"],
  },
  {
    name: "H5P.Summary",
    key: "summary",
    label: "Summary",
    category: "Test Knowledge",
    library: "H5P.Summary 1.10",
    renderHost: "summary",
    twin: "mock",
    blurb: "Learners pick the correct statement from each set.",
    goodFor: ["conceptual", "understanding", "review"],
  },
  {
    name: "H5P.Crossword",
    key: "crosswords",
    label: "Crosswords",
    category: "Test Knowledge",
    library: "H5P.Crossword 0.5",
    renderHost: "crossword",
    twin: "none",
    blurb: "Solve clues to fill in the correct words.",
    goodFor: ["vocabulary", "terminology", "recall"],
  },
  {
    name: "H5P.DragText",
    key: "drag-the-words",
    label: "Drag the Words",
    category: "Practice & Games",
    library: "H5P.DragText 1.10",
    renderHost: "drag-text",
    twin: "none",
    blurb: "Learners drag words into the correct gaps.",
    goodFor: ["vocabulary", "definitions", "recall"],
  },
  {
    name: "H5P.DialogCards",
    key: "dialog-cards-conceptual",
    label: "Dialog Cards (Conceptual)",
    category: "Practice & Games",
    library: "H5P.Dialogcards 1.9",
    renderHost: "dialog-cards",
    twin: "none",
    blurb: "Two-sided cards for reviewing key concepts.",
    goodFor: ["memorization", "terminology", "recall"],
  },
  {
    name: "H5P.InteractiveBook",
    key: "interactive-book",
    label: "Interactive Book",
    category: "Present Content",
    library: "H5P.InteractiveBook 1.11",
    renderHost: "interactive-book",
    twin: "none",
    blurb: "Chapter-based learning content with pages and activities.",
    goodFor: ["explanation", "coherent-lesson"],
  },
];

export const CONTENT_TYPE_NAMES = CONTENT_TYPES.map((c) => c.name);

export const CATEGORIES = [
  "Test Knowledge",
  "Present Content",
  "Practice & Games",
  "Interactive Media",
] as const;

export function contentType(name: string): ContentTypeDef | undefined {
  return CONTENT_TYPES.find((c) => c.name === name);
}
