// The full Smart Import activity catalogue, exactly as it appears on H5P.com
// (labels + descriptions verbatim). 13 activities across 4 categories.
//
// `twin`:
//   "full" — twin generates content.json AND an H5P library bundle exists → live Play preview
//   "mock" — twin generates the shape, no bundle yet → Review list only, no Play
//   "none" — catalogue-only for now (no generation, no preview)

export type TwinLevel = "full" | "mock" | "none";
export type Category =
  | "Test Knowledge"
  | "Present Content"
  | "Practice & Games"
  | "Interactive Media";

export interface ContentTypeDef {
  /** Unique id used throughout the app. */
  name: string;
  /** Smart Import's activity key/slug. */
  key: string;
  label: string;
  category: Category;
  /** Verbatim from the Smart Import UI. */
  blurb: string;
  /** H5P library string for h5p.json (best-effort for types we don't render). */
  library: string;
  /** Folder under public/h5p/ holding the render substrate, when twin === "full". */
  renderHost: string;
  twin: TwinLevel;
  /** Fit tags — feed the recommendation engine's heuristic fallback. */
  goodFor: string[];
}

export const CONTENT_TYPES: ContentTypeDef[] = [
  // --- Test Knowledge -------------------------------------------------------
  {
    name: "H5P.Crossword",
    key: "crosswords",
    label: "Crosswords",
    category: "Test Knowledge",
    blurb:
      "Create a crossword puzzle where learners solve clues to fill in the correct words.",
    library: "H5P.Crossword 0.5",
    renderHost: "crossword",
    twin: "none",
    goodFor: ["vocabulary", "terminology", "recall"],
  },
  {
    name: "H5P.QuestionSet",
    key: "question-set",
    label: "Question Set",
    category: "Test Knowledge",
    blurb:
      "Create a quiz made up of several activities with a combined final score.",
    library: "H5P.QuestionSet 1.20",
    renderHost: "question-set",
    twin: "mock",
    goodFor: ["conceptual", "assessment", "mixed", "understanding"],
  },
  {
    name: "H5P.SingleChoiceSet",
    key: "single-choice-set",
    label: "Single Choice Set",
    category: "Test Knowledge",
    blurb:
      "Create multiple-choice questions with one correct answer per question.",
    library: "H5P.SingleChoiceSet 1.11",
    renderHost: "single-choice-set",
    twin: "full",
    goodFor: ["conceptual", "assessment", "recall", "understanding"],
  },
  {
    name: "H5P.Summary",
    key: "summary",
    label: "Summary",
    category: "Test Knowledge",
    blurb:
      "Create an activity where learners select the most important statements from a list.",
    library: "H5P.Summary 1.10",
    renderHost: "summary",
    twin: "mock",
    goodFor: ["conceptual", "understanding", "review"],
  },

  // --- Present Content -----------------------------------------------------
  {
    name: "H5P.Accordion:difficult-words",
    key: "glossary-difficult-words",
    label: "Glossary: Difficult words",
    category: "Present Content",
    blurb: "Generate or curate definitions for difficult vocabulary.",
    library: "H5P.Accordion 1.0",
    renderHost: "accordion",
    twin: "none",
    goodFor: ["vocabulary", "terminology", "explanation"],
  },
  {
    name: "H5P.Accordion:key-concepts",
    key: "glossary-key-concepts",
    label: "Glossary: Key concepts",
    category: "Present Content",
    blurb:
      "Define and explain important concepts learners need to understand the topic.",
    library: "H5P.Accordion 1.0",
    renderHost: "accordion",
    twin: "none",
    goodFor: ["conceptual", "explanation", "review"],
  },
  {
    name: "H5P.Essay:higher-order",
    key: "higher-order-questions",
    label: "Higher-Order Questions",
    category: "Present Content",
    blurb:
      "Create open-ended questions that encourage deeper thinking and reflection.",
    library: "H5P.Essay 1.5",
    renderHost: "essay",
    twin: "none",
    goodFor: ["conceptual", "understanding", "application"],
  },
  {
    name: "H5P.InteractiveBook",
    key: "interactive-book",
    label: "Interactive Book",
    category: "Present Content",
    blurb: "Build chapter-based learning content with pages and activities.",
    library: "H5P.InteractiveBook 1.11",
    renderHost: "interactive-book",
    twin: "none",
    goodFor: ["explanation", "coherent-lesson", "teaching"],
  },

  // --- Practice & Games --------------------------------------------------
  {
    name: "H5P.Dialogcards:conceptual",
    key: "dialog-cards-conceptual",
    label: "Dialog Cards (Conceptual)",
    category: "Practice & Games",
    blurb:
      "Create two-sided cards for reviewing key concepts and explanations.",
    library: "H5P.Dialogcards 1.9",
    renderHost: "dialog-cards",
    twin: "none",
    goodFor: ["memorization", "terminology", "recall", "review"],
  },
  {
    name: "H5P.Dialogcards:contextual",
    key: "dialog-cards-contextual",
    label: "Dialog Cards (Contextual)",
    category: "Practice & Games",
    blurb:
      "Create two-sided cards tied to a specific example, case, or scenario.",
    library: "H5P.Dialogcards 1.9",
    renderHost: "dialog-cards",
    twin: "none",
    goodFor: ["memorization", "application", "recall"],
  },
  {
    name: "H5P.DragText",
    key: "drag-the-words",
    label: "Drag the Words",
    category: "Practice & Games",
    blurb:
      "Create a fill-in-the-blank activity where learners drag words into the correct places.",
    library: "H5P.DragText 1.10",
    renderHost: "drag-text",
    twin: "none",
    goodFor: ["vocabulary", "definitions", "recall"],
  },
  {
    name: "H5P.TheChase",
    key: "the-chase",
    label: "The Chase",
    category: "Practice & Games",
    blurb:
      "Create a fast-paced multiplayer quiz where learners answer questions to stay ahead.",
    library: "H5P.TheChase 1.0",
    renderHost: "the-chase",
    twin: "none",
    goodFor: ["recall", "assessment", "game"],
  },

  // --- Interactive Media -----------------------------------------------
  {
    name: "H5P.InteractiveVideo",
    key: "interactive-video",
    label: "Interactive Video",
    category: "Interactive Media",
    blurb: "Add a video and place interactions at chosen timestamps.",
    library: "H5P.InteractiveVideo 1.27",
    renderHost: "interactive-video",
    twin: "none",
    goodFor: ["video"],
  },
];

export const CONTENT_TYPE_NAMES = CONTENT_TYPES.map((c) => c.name);

export const CATEGORIES: Category[] = [
  "Test Knowledge",
  "Present Content",
  "Practice & Games",
  "Interactive Media",
];

export function contentType(name: string): ContentTypeDef | undefined {
  return CONTENT_TYPES.find((c) => c.name === name);
}
