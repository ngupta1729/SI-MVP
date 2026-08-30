// The twin transform: (source + intent) -> H5P content plan + content.json per item.
// Uses an LLM when AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY is set; otherwise a
// deterministic mock so the whole pipe runs offline.

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type {
  ImportIntent,
  TwinResult,
  TwinSource,
  GeneratedItem,
  SourceAnalysis,
  ActivityRecommendation,
} from "./types";
import { contentType, CONTENT_TYPES } from "./h5p/contentTypes";
import {
  buildSummary,
  buildSingleChoiceSet,
  buildQuestionSet,
  buildDialogCards,
  buildDragText,
  buildCrossword,
  buildAccordion,
} from "./h5p/mockContent";
import { structureRef } from "./calibration";

const TWIN_MODEL = process.env.TWIN_MODEL || "gpt-4o-mini";

function hasModel() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function resolveSourceText(source: TwinSource): Promise<string> {
  if (source.kind === "text") return source.value;
  // url
  try {
    const res = await fetch(source.value, { headers: { "user-agent": "h5p-twin/0.1" } });
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  } catch {
    return `(could not fetch ${source.value})`;
  }
}

// --- improve a rough prompt (Stage 1) --------------------------------------

export async function improvePrompt(rough: string): Promise<string> {
  const trimmed = rough.trim();
  if (!trimmed || !hasModel()) return trimmed;
  try {
    const { text } = await generateText({
      model: openai(process.env.TWIN_ANALYZE_MODEL || "gpt-4o-mini"),
      temperature: 0.3,
      prompt: `An educator wrote a rough instruction for an AI that generates H5P quiz / assessment activities from source material. Rewrite it into a clear, well-structured instruction that follows prompt-engineering best practice: imperative voice, specific and unambiguous, and — only where the rough text states or clearly implies it — the audience/level, the focus or scope, the number of questions, and the difficulty.

HARD RULE: use only what is in or directly implied by the rough text. Do NOT invent an audience, a topic focus, a question count, or a difficulty the educator did not indicate. If they didn't say, leave it out — do not fill gaps with assumptions.

Keep it concise (2–5 sentences). Return ONLY the rewritten instruction — no preamble, no quotes, no explanation.

ROUGH INSTRUCTION:
${trimmed}`,
    });
    return text.trim().replace(/^["']|["']$/g, "") || trimmed;
  } catch (err) {
    console.error("improvePrompt failed:", err);
    return trimmed;
  }
}

// --- source read-back (Stage 1) ----------------------------------------------
// Advisory only. Describes strengths and watch-outs; never blocks or discourages.

const PROCEDURAL = /\b(step \d|first,|next,|then,|finally,|how to|procedure|install)\b/i;

const VOLUME_ITEMS: Record<ImportIntent["volume"], number> = {
  light: 4,
  standard: 6,
  thorough: 10,
};

/** How many activity types to pre-check: 1 (thin/narrow) / 2 (default) / 3 (long+broad). */
export function maxRecommended(
  analysis: SourceAnalysis,
  intent: ImportIntent,
): number {
  const promptText = (
    intent.authoringMode === "prompt" ? intent.prompt : intent.learningGoal
  ).toLowerCase();
  const narrow = /\b(quick|short|warm.?up|diagnostic)\b/.test(promptText);
  const broad = /\b(comprehensive|full|thorough|cover (the |everything)|unit|revision set)\b/.test(
    promptText,
  );
  if (analysis.wordCount < 150 || narrow) return 1;
  if (analysis.wordCount > 1500 && analysis.themes.length >= 4 && broad) return 3;
  return 2;
}

/**
 * Deterministic recommendation — the no-model fallback and the desirability
 * refinement. Guarantees a non-empty set. See spec "Activity recommendation
 * engine (v1)".
 */
export function recommendActivities(
  analysis: SourceAnalysis,
  intent: ImportIntent,
): ActivityRecommendation[] {
  const sourceCap = Math.max(
    3,
    Math.min(
      15,
      Math.round(analysis.wordCount / 80),
      Math.round((analysis.concepts.length || 4) * 1.5),
    ),
  );
  const baseCount = Math.min(VOLUME_ITEMS[intent.volume], sourceCap);
  const promptText = (
    intent.authoringMode === "prompt" ? intent.prompt : intent.learningGoal
  ).toLowerCase();
  const wantsVocab = /\b(vocab|terms?|terminology|definition|glossary)\b/.test(
    promptText,
  );
  const wantsTeach = /\b(introduc|teach|explain|present|lesson|overview)\b/.test(
    promptText,
  );
  const assess =
    intent.emphasis === "assessment" || /\b(exam|quiz|assess|test|graded)\b/.test(promptText);

  // feasibility per type (heuristic, from the source read-back)
  const feasible = (name: string): boolean => {
    const def = CONTENT_TYPES.find((c) => c.name === name);
    if (!def) return false;
    if (def.goodFor.includes("video")) return false; // no video source in this build
    const vocabHeavy = def.goodFor.some((g) =>
      ["vocabulary", "terminology", "definitions", "memorization"].includes(g),
    );
    if (vocabHeavy) return analysis.concepts.length >= 4 && analysis.wordCount >= 150;
    if (def.name === "H5P.InteractiveBook")
      return analysis.wordCount >= 900 && analysis.themes.length >= 3;
    if (def.name === "H5P.QuestionSet") return analysis.wordCount >= 250;
    if (def.name === "H5P.TheChase") return analysis.wordCount >= 200;
    return analysis.wordCount >= 80; // SingleChoiceSet, Summary, glossaries, essay
  };

  // pick order: SCS first, then intent tilt, then the safe understanding pick
  const ranked: string[] = [];
  const add = (n: string) => {
    if (feasible(n) && !ranked.includes(n)) ranked.push(n);
  };
  add("H5P.SingleChoiceSet");
  if (wantsVocab) {
    add("H5P.Crossword");
    add("H5P.DragText");
    add("H5P.Dialogcards:conceptual");
  }
  if (wantsTeach) {
    add("H5P.Accordion:key-concepts");
    add("H5P.InteractiveBook");
    add("H5P.Summary");
  }
  if (assess) add("H5P.QuestionSet");
  add("H5P.Summary");
  add("H5P.QuestionSet");

  // count: 1 for thin/narrow, 3 for long+broad, else 2
  const narrow = /\b(quick|short|warm.?up|diagnostic)\b/.test(promptText);
  let count = 2;
  if (analysis.wordCount < 400 || narrow || ranked.length === 1) count = 1;
  else if (analysis.wordCount > 1500 && analysis.themes.length >= 4 && ranked.length >= 3)
    count = 3;
  const picked = new Set(ranked.slice(0, count));

  const reasonFor = (name: string, isRec: boolean) => {
    if (!feasible(name))
      return name === "H5P.InteractiveBook"
        ? "source is short for a chapter book"
        : name === "H5P.Crossword" || name === "H5P.DragText"
          ? "few short terms in the source for this"
          : "marginal fit for this source";
    if (!isRec) return "feasible — add it if you want it";
    if (name === "H5P.SingleChoiceSet") return "works well on this source; covers recall";
    if (name === "H5P.Summary") return "checks understanding of the key claims";
    if (name === "H5P.QuestionSet") return "a fuller scored quiz for this material";
    if (name === "H5P.Crossword") return "the source has good terminology";
    return "fits your source and intent";
  };

  return CONTENT_TYPES.map((ct) => ({
    name: ct.name,
    recommended: picked.has(ct.name),
    reason: reasonFor(ct.name, picked.has(ct.name)),
    itemCount: ct.name === "H5P.Crossword" ? 8 : Math.max(3, baseCount - (count > 1 ? 1 : 0)),
  })).sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );
}

function heuristicAnalysis(text: string, intent: ImportIntent): SourceAnalysis {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = (text.match(/[^.!?]{15,}[.!?]/g) ?? []).map((s) => s.trim());
  const concepts = extractConcepts(text, 6);
  const base: SourceAnalysis = {
    kind: PROCEDURAL.test(text)
      ? "procedural"
      : sentences.length > 6
        ? "conceptual"
        : "mixed",
    wordCount: words.length,
    readingLevel: "not assessed",
    concepts,
    themes: concepts.slice(0, 4),
    strengths: [
      `${words.length} words — enough for roughly ${Math.max(4, Math.min(20, Math.round(words.length / 120)))} questions`,
    ],
    watchOuts: [
      "Read-back is running without the model — concepts are frequency-based only",
    ],
    detectedQuestions: (text.match(/\?/g) ?? []).length,
    suggestedObjectives: [],
    recommendations: [],
    engine: "heuristic",
  };
  return { ...base, recommendations: recommendActivities(base, intent) };
}

export async function analyzeSource(
  source: TwinSource,
  intent: ImportIntent,
): Promise<SourceAnalysis> {
  const text = await resolveSourceText(source);
  const words = text.split(/\s+/).filter(Boolean);
  const detectedQuestions = (text.match(/\?/g) ?? []).length;

  if (!hasModel()) return heuristicAnalysis(text, intent);

  try {
    const intentLine =
      intent.authoringMode === "prompt"
        ? `The teacher's instruction: "${intent.prompt || "(none)"}". Emphasis: ${intent.emphasis}. Volume: ${intent.volume}. Mode: ${intent.mode}.`
        : `Brief — goal: "${intent.learningGoal || "(none)"}", audience: ${intent.audienceLevel}, emphasis: ${intent.emphasis}, volume: ${intent.volume}.`;
    const prompt = `Read this source material that a teacher wants to turn into H5P quiz/assessment activities. Return a neutral read-back — describe it so the teacher knows what to expect. Do NOT tell them whether to use it; that is their choice.

SOURCE:
${text.slice(0, 12000)}

${intentLine}

Also recommend which Smart Import activity types to pre-check. The full catalogue (use these exact "name" values):
- "H5P.Crossword" — Crosswords: needs MANY single-word / short named terms. Recall / vocabulary.
- "H5P.QuestionSet" — Question Set: a fuller scored quiz; needs enough distinct facts. Understanding / mixed.
- "H5P.SingleChoiceSet" — Single Choice Set: assertable facts with clear answers (works on almost anything). Recall.
- "H5P.Summary" — Summary: pick the correct statement; needs paraphrasable explanatory claims. Understanding.
- "H5P.Accordion:difficult-words" — Glossary of difficult vocabulary; needs technical terms to define.
- "H5P.Accordion:key-concepts" — Glossary of key concepts; needs clear concepts to explain. Teaching.
- "H5P.Essay:higher-order" — Higher-Order Questions: open-ended prompts for deeper thinking. Application.
- "H5P.InteractiveBook" — Interactive Book: needs length AND multiple sub-topics. Teaching.
- "H5P.Dialogcards:conceptual" — Dialog Cards reviewing key concepts; needs term↔definition pairs.
- "H5P.Dialogcards:contextual" — Dialog Cards tied to a specific example/case/scenario.
- "H5P.DragText" — Drag the Words: fill-the-gap; needs definitional sentences with a removable key word.
- "H5P.TheChase" — fast multiplayer quiz; needs enough recall questions.
- "H5P.InteractiveVideo" — needs a video source (NOT available here — always recommended:false).
Rules: recommend 2 by default (one recall + one understanding, usually Single Choice Set + Summary or + Question Set); 1 if the source is short (<400 words) or the teacher wants something quick; 3 only if the source is long AND multi-section AND the teacher wants breadth. Never recommend a type the source can't support well — mark it recommended:false with the reason. itemCount from volume (light 4 / standard 6 / thorough 10), capped by what the source can support without repeating; Crossword ~8.

Return ONLY JSON:
{
  "kind": "conceptual" | "procedural" | "narrative" | "reference" | "mixed",
  "readingLevel": "<in a teacher's words>",
  "concepts": ["<5-8 substantive things a teacher would assess; multi-word allowed>"],
  "themes": ["<3-5 themes the generated questions will draw on, heaviest first>"],
  "strengths": ["<2-3 short phrases>"],
  "watchOuts": ["<2-3 short neutral phrases; NOT 'don't use this'>"],
  "recommendations": [
    { "name": "<one of the catalogue names above>", "recommended": true|false, "reason": "<one line>", "itemCount": <int> }
  ]
}
Include an entry for every catalogue type listed above.`;
    const { text: out } = await generateText({
      model: openai(process.env.TWIN_ANALYZE_MODEL || "gpt-4o-mini"),
      prompt,
      temperature: 0.2,
    });
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Omit<
      SourceAnalysis,
      "wordCount" | "detectedQuestions" | "engine" | "suggestedObjectives"
    >;
    const analysis: SourceAnalysis = {
      ...parsed,
      wordCount: words.length,
      detectedQuestions,
      suggestedObjectives: [],
      recommendations: parsed.recommendations ?? [],
      engine: "model",
    };
    // safety net: if the model recommended nothing, fall back to the deterministic pick
    if (!analysis.recommendations.some((r) => r.recommended)) {
      analysis.recommendations = recommendActivities(analysis, intent);
    }
    // enforce the count rule — the model tends to over-recommend
    const cap = maxRecommended(analysis, intent);
    let kept = 0;
    analysis.recommendations = analysis.recommendations.map((r) => {
      if (r.recommended && kept < cap) {
        kept++;
        return r;
      }
      return r.recommended
        ? { ...r, recommended: false, reason: `also a fit — add it if you want it` }
        : r;
    });
    return analysis;
  } catch (err) {
    console.error("analyze model call failed, using heuristic:", err);
    return heuristicAnalysis(text, intent);
  }
}

// --- crude concept/QA extraction for the mock engine ---------------------------

function extractConcepts(text: string, n = 5): string[] {
  const stop = new Set(
    "the a an and or of to in on for with is are was were be been being this that these those it its as at by from into than then so such not no yes you your we our they their he she his her".split(
      " ",
    ),
  );
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (stop.has(raw)) continue;
    freq.set(raw, (freq.get(raw) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w[0].toUpperCase() + w.slice(1));
}

function mockEngine(text: string, intent: ImportIntent): TwinResult {
  const concepts = extractConcepts(text, 6);
  const sentences = (text.match(/[^.!?]{20,}[.!?]/g) ?? []).map((s) => s.trim());
  const qa = concepts.map((c, i) => ({
    question: `Which statement about ${c} is correct?`,
    correct: sentences[i]?.slice(0, 140) ?? `${c} is a key idea in this material.`,
    distractors: [
      `${c} does not appear in this material.`,
      `${c} contradicts the source.`,
    ],
    grounding: sentences[i] ?? "",
  }));

  const items: GeneratedItem[] = [];
  intent.contentTypes.forEach((typeName, idx) => {
    const def = contentType(typeName);
    if (!def) return;
    const base = {
      id: `item-${idx}`,
      contentType: typeName,
      title: `${def.label}: ${intent.learningGoal || concepts[0] || "Overview"}`,
      concepts: concepts.slice(0, 4),
      rationale: `Generated by the mock engine from the ${concepts.length} most frequent concepts; ${intent.emphasis} emphasis.`,
      mainLibrary: def.library,
      grounding: qa[0]?.grounding || sentences[0] || "",
      answerKeyNote:
        intent.mode === "extract"
          ? "Question lifted from the source; answer marked as given in the original."
          : `Key derived from: "${(qa[0]?.grounding || sentences[0] || "").slice(0, 90)}…"`,
      confidence: (sentences.length > 6 ? "high" : "medium") as "high" | "medium",
      provenance: (intent.mode === "extract" ? "extracted" : "inferred") as
        | "extracted"
        | "inferred",
    };
    const perQ = qa.map((q) => ({
      grounding: q.grounding || "",
      answerKeyNote:
        intent.mode === "extract"
          ? "Lifted from the source; answer as given in the original."
          : `Answer supported by: "${(q.grounding || "").slice(0, 80)}…"`,
      confidence: (q.grounding ? "high" : "medium") as "high" | "medium",
    }));
    const defs = concepts.map((c, i) => ({
      term: c,
      definition: sentences[i]?.slice(0, 160) ?? `A key idea about ${c} from the source.`,
      body: sentences[i]?.slice(0, 300) ?? `${c}.`,
      clue: `${sentences[i]?.slice(0, 70) ?? c} (one word)`,
    }));

    let contentJson: unknown;
    let questionSignals: GeneratedItem["questionSignals"];
    switch (typeName) {
      case "H5P.Summary":
        contentJson = buildSummary(concepts);
        break;
      case "H5P.SingleChoiceSet":
        contentJson = buildSingleChoiceSet(qa);
        questionSignals = perQ;
        break;
      case "H5P.QuestionSet":
        contentJson = buildQuestionSet(qa);
        questionSignals = perQ;
        break;
      case "H5P.Dialogcards:conceptual":
      case "H5P.Dialogcards:contextual":
        contentJson = buildDialogCards(defs);
        break;
      case "H5P.DragText":
        contentJson = buildDragText(
          defs.map((d) => ({ text: d.definition, answer: d.term })),
        );
        break;
      case "H5P.Crossword":
        contentJson = buildCrossword(
          defs.map((d) => ({ clue: d.clue, answer: d.term })),
        );
        break;
      case "H5P.Accordion:difficult-words":
      case "H5P.Accordion:key-concepts":
        contentJson = buildAccordion(
          defs.map((d) => ({ title: d.term, body: d.body })),
        );
        break;
      default:
        contentJson = null;
    }
    items.push({ ...base, contentJson, questionSignals });
  });

  return {
    sourceSummary: sentences.slice(0, 2).join(" ") || text.slice(0, 240),
    planNarrative: `Mock plan: ${items.length} artifact(s) from concepts ${concepts
      .slice(0, 4)
      .join(", ")}. Set AI_GATEWAY_API_KEY (or ANTHROPIC_API_KEY) for model-generated output.`,
    items,
    engine: "mock",
  };
}

// --- model engine -------------------------------------------------------------

const TYPE_RULE: Record<string, string> = {
  "H5P.SingleChoiceSet":
    'contentJson.choices[]: { "subContentId": <uuid v4>, "question": <plain text>, "answers": [<CORRECT answer first>, <distractor>, <distractor>, <distractor>] }.',
  "H5P.QuestionSet":
    'contentJson.questions[]: each { "library": "H5P.MultiChoice 1.16", "subContentId": <uuid v4>, "params": { "question": "<p>text</p>", "answers": [{ "text": "<div>opt</div>", "correct": true|false }], "behaviour": { "singleAnswer": true } } } — exactly one answer per question has correct:true.',
  "H5P.Summary":
    'contentJson.summaries[]: each { "subContentId": <uuid v4>, "tip": "", "summary": [<the CORRECT statement first>, <a false variant>, <a false variant>] }. Also set "intro".',
  "H5P.Dialogcards:conceptual":
    'contentJson.dialogs[]: each { "text": "<p>term / prompt</p>", "answer": "<p>definition / answer</p>", "tips": {} }.',
  "H5P.Dialogcards:contextual":
    'contentJson.dialogs[]: each { "text": "<p>scenario / example</p>", "answer": "<p>what applies / the point</p>", "tips": {} }.',
  "H5P.DragText":
    'contentJson.textField: ONE string, sentences separated by \\n, each key answer wrapped in asterisks e.g. "The powerhouse of the cell is the *mitochondrion*.". Also set "taskDescription".',
  "H5P.Crossword":
    'contentJson.words[]: each { "clue": <the clue>, "answer": <ONE word, letters only, UPPERCASE>, "orientation": "across"|"down", "fixWord": false }.',
  "H5P.Accordion:difficult-words":
    'contentJson.panels[]: each { "title": <the difficult word>, "content": { "library": "H5P.AdvancedText 1.1", "subContentId": <uuid v4>, "params": { "text": "<p>plain-language definition</p>" } } }. Also set "hTag": "h3".',
  "H5P.Accordion:key-concepts":
    'contentJson.panels[]: each { "title": <the concept>, "content": { "library": "H5P.AdvancedText 1.1", "subContentId": <uuid v4>, "params": { "text": "<p>explanation</p>" } } }. Also set "hTag": "h3".',
};

function adjustLine(adjustment: string | undefined, intent: ImportIntent): string {
  if (!adjustment) return "";
  if (adjustment.startsWith("language:")) {
    const lang = adjustment.slice("language:".length);
    return `\n\nADJUSTMENT: write ALL generated content in ${lang}.`;
  }
  if (adjustment.startsWith("focus:")) {
    return `\n\nADJUSTMENT: focus the questions on this concept from the source: "${adjustment.slice(6)}".`;
  }
  const d = REGEN_ADJUSTMENTS[adjustment];
  return d ? `\n\nADJUSTMENT (regeneration): ${d}` : "";
}

/** Review-stage regenerate adjustments → a directive appended to the generation prompt. */
export const REGEN_ADJUSTMENTS: Record<string, string> = {
  harder:
    "The previous version was too easy. Keep the same concepts but raise the cognitive demand — require applying, comparing, or reasoning about the ideas, not just recalling them.",
  easier:
    "The previous version was too hard. Keep the same concepts but lower the demand — shorter stems, one idea per question, plainer options.",
  simpler:
    "Rewrite at a simpler reading level — short sentences, everyday words, define any term you must use.",
  formal:
    "Use a more formal, academic register throughout.",
  "less-repetitive":
    "The previous version was repetitive. Spread the questions across DIFFERENT parts of the source; no two questions should test the same fact.",
  clearer:
    "The previous version was awkwardly worded. Keep the same concepts and correct answers, but make every question unambiguous and cleanly phrased.",
  "different-focus":
    "Shift the focus: prioritise concepts the previous version under-covered.",
  retry: "Produce a fresh set of items from the source.",
};

async function generateOneItem(
  typeName: string,
  text: string,
  intent: ImportIntent,
  idx: number,
  adjustment?: string,
): Promise<GeneratedItem | null> {
  const def = contentType(typeName);
  if (!def) return null;
  const ref = await structureRef(typeName);
  const modeLine =
    intent.mode === "extract"
      ? "EXTRACTION: the source already contains questions. Pull each one out verbatim — do not reword, reorder, or invent. Carry over given options/answers."
      : "GENERATION: write new items grounded strictly in the source. Test understanding; distractors/false variants must be clearly wrong on a careful read.";
  const intentLine =
    intent.authoringMode === "brief"
      ? `Brief — goal: "${intent.learningGoal || "(none)"}", audience: ${intent.audienceLevel}, emphasis: ${intent.emphasis}, volume: ${intent.volume} (light≈4 / standard≈6 / thorough≈10).`
      : `Instruction: "${intent.prompt || "(none — sensible defaults)"}"  volume: ${intent.volume}`;
  const adjLine = adjustLine(adjustment, intent);

  const prompt = `You are H5P.com's Smart Import, producing content.json for ONE activity of type ${def.label} (${typeName}).

${modeLine}
${intentLine}${adjLine}

SHAPE (match exactly): ${TYPE_RULE[typeName] ?? "match the example below"}

REAL EXAMPLE content.json for this type (copy the structure, replace all content with material from the SOURCE):
${ref || "(no example — follow the shape line above)"}

SOURCE:
${text.slice(0, 11000)}

Return ONLY JSON:
{
  "title": string,
  "concepts": [<3-5 topics this activity covers>],
  "rationale": <one line>,
  "contentJson": <object exactly in the shape above>,
  "questionSignals": [ { "grounding": <exact source sentence this element came from>, "answerKeyNote": <one line: why the answer/statement is right>, "confidence": "high"|"medium"|"low" } ],
  "confidence": "high"|"medium"|"low",
  "provenance": "${intent.mode === "extract" ? "extracted" : "inferred"}"
}
"questionSignals": one entry per element you generated, same order.`;

  const { text: out } = await generateText({
    model: openai(TWIN_MODEL),
    prompt,
    temperature: 0.4,
  });
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as Omit<
    GeneratedItem,
    "id" | "contentType" | "mainLibrary"
  >;
  return {
    ...parsed,
    id: `item-${idx}`,
    contentType: typeName,
    mainLibrary: def.library,
  };
}

async function modelEngine(text: string, intent: ImportIntent): Promise<TwinResult> {
  const settled = await Promise.allSettled(
    intent.contentTypes.map((t, i) => generateOneItem(t, text, intent, i)),
  );
  const items = settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter((x): x is GeneratedItem => x !== null);

  if (!items.length) return mockEngine(text, intent);

  const sentences = (text.match(/[^.!?]{20,}[.!?]/g) ?? []).map((s) => s.trim());
  return {
    sourceSummary: sentences.slice(0, 2).join(" ") || text.slice(0, 240),
    planNarrative: `${items.length} activit${items.length === 1 ? "y" : "ies"} generated from the source: ${items
      .map((i) => contentType(i.contentType)?.label ?? i.contentType)
      .join(", ")}.`,
    items,
    engine: "model",
  };
}

export async function runTwin(
  source: TwinSource,
  intent: ImportIntent,
): Promise<TwinResult> {
  const text = await resolveSourceText(source);
  if (hasModel()) {
    try {
      return await modelEngine(text, intent);
    } catch (err) {
      console.error("model engine failed, falling back to mock:", err);
    }
  }
  return mockEngine(text, intent);
}

/** Regenerate one activity (Screen 3), steered by the picked adjustment. */
export async function regenerateItem(
  source: TwinSource,
  intent: ImportIntent,
  contentTypeName: string,
  adjustment: string,
  idx: number,
): Promise<GeneratedItem | null> {
  const text = await resolveSourceText(source);
  if (hasModel()) {
    try {
      const it = await generateOneItem(contentTypeName, text, intent, idx, adjustment);
      if (it) return it;
    } catch (err) {
      console.error("regenerate failed, falling back to mock:", err);
    }
  }
  // mock fallback: reuse mockEngine for a single type
  const one = mockEngine(text, { ...intent, contentTypes: [contentTypeName] });
  return one.items[0] ?? null;
}
