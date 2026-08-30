// The subset of H5P content types the twin can generate for the MVI.
// These mirror what H5P.com Smart Import most commonly produces.
// `library` strings must match the versions bundled in the extracted real .h5p
// exports under public/h5p/ — prepare-h5p.mjs prints the actual versions it found,
// reconcile if they differ.

export interface ContentTypeDef {
  /** Machine name, e.g. "H5P.Summary". */
  name: string;
  label: string;
  /** Default library string for h5p.json (version may be reconciled after extraction). */
  library: string;
  /** Folder under public/h5p/ holding the extracted real export used as the render host. */
  renderHost: string;
  blurb: string;
}

export const CONTENT_TYPES: ContentTypeDef[] = [
  {
    name: "H5P.Summary",
    label: "Summary",
    library: "H5P.Summary 1.10",
    renderHost: "summary",
    blurb: "Statement sets where the learner picks the correct summary line.",
  },
  {
    name: "H5P.SingleChoiceSet",
    label: "Single Choice Set",
    library: "H5P.SingleChoiceSet 1.11",
    renderHost: "single-choice-set",
    blurb: "Fast sequence of single-answer questions.",
  },
  {
    name: "H5P.TrueFalse",
    label: "True/False",
    library: "H5P.TrueFalse 1.8",
    renderHost: "true-false",
    blurb: "One true-or-false statement.",
  },
  {
    name: "H5P.Flashcards",
    label: "Flashcards",
    library: "H5P.Flashcards 1.6",
    renderHost: "flashcards",
    blurb: "Term/definition cards for recall practice.",
  },
];

export const CONTENT_TYPE_NAMES = CONTENT_TYPES.map((c) => c.name);

export function contentType(name: string): ContentTypeDef | undefined {
  return CONTENT_TYPES.find((c) => c.name === name);
}
