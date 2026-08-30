// Pre-designed prompts. These are already written to best practice — they are
// NOT offered for "improve this prompt". `isPreset()` lets the UI tell a pristine
// preset (hide "improve") from a user-authored / user-edited prompt (show it).

export interface IntentPreset {
  id: string;
  label: string;
  /** Sets intent.mode alongside the prompt. */
  mode: "generate" | "extract";
  prompt: string;
}

export const INTENT_PRESETS: IntentPreset[] = [
  {
    id: "exam-revision",
    label: "Exam revision",
    mode: "generate",
    prompt:
      "Audience: students who have already studied this topic and are revising for an exam. Prioritise the points most likely to be tested. Mix straightforward recall with a few application questions. Keep questions concise and unambiguous, with one clearly correct answer and plausible but clearly wrong distractors drawn from the source.",
  },
  {
    id: "introduce-topic",
    label: "Introduce a topic",
    mode: "generate",
    prompt:
      "Audience: beginners meeting this topic for the first time. Explain and check the core concepts in plain language. Define any term the source introduces before testing it. Favour understanding over recall of detail. Low-stakes, encouraging tone.",
  },
  {
    id: "check-prior-knowledge",
    label: "Check prior knowledge",
    mode: "generate",
    prompt:
      "Purpose: a short diagnostic to find out what learners already know before teaching. Keep it brief and low-stakes. Spread the questions evenly across the main sub-topics in the source rather than going deep on one. Avoid trick questions.",
  },
  {
    id: "deep-practice",
    label: "Deep conceptual practice",
    mode: "generate",
    prompt:
      "Audience: learners who know the basics and need to deepen understanding. Write questions that require connecting ideas, comparing cases, or reasoning about why something is true — not single-fact recall. Distractors should represent common misconceptions, and must still be clearly wrong on a careful reading of the source.",
  },
  {
    id: "extract-questions",
    label: "Extract existing questions",
    mode: "extract",
    prompt:
      "The source material already contains questions. Extract each question exactly as written — do not rephrase, reword, shorten, or invent new questions. Preserve the original wording and order. If answer options or a marked correct answer are present, carry them over unchanged. If the correct answer is not indicated in the source, use the answer best supported by the surrounding source text and note that it was inferred. Map each extracted question into the chosen H5P activity type without altering its substance.",
  },
];

const PRESET_PROMPTS = new Set(INTENT_PRESETS.map((p) => p.prompt.trim()));

/** True when `prompt` is exactly one of the presets, untouched. */
export function isPreset(prompt: string): boolean {
  return PRESET_PROMPTS.has(prompt.trim());
}

export function preset(id: string): IntentPreset | undefined {
  return INTENT_PRESETS.find((p) => p.id === id);
}
