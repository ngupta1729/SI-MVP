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
import { buildSummary, buildSingleChoiceSet } from "./h5p/mockContent";
import { STRUCTURE_REFERENCE } from "./calibration";

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
    let contentJson: unknown;
    let questionSignals: GeneratedItem["questionSignals"];
    switch (typeName) {
      case "H5P.Summary":
        contentJson = buildSummary(concepts);
        break;
      case "H5P.SingleChoiceSet":
      case "H5P.QuestionSet":
        contentJson = buildSingleChoiceSet(qa);
        questionSignals = qa.map((q) => ({
          grounding: q.grounding || "",
          answerKeyNote:
            intent.mode === "extract"
              ? "Lifted from the source; answer as given in the original."
              : `Answer supported by: "${(q.grounding || "").slice(0, 80)}…"`,
          confidence: (q.grounding ? "high" : "medium") as "high" | "medium",
        }));
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

async function modelEngine(text: string, intent: ImportIntent): Promise<TwinResult> {
  const wantedStructures = intent.contentTypes
    .map((t) => STRUCTURE_REFERENCE[t] && `=== ${t} content.json shape ===\n${STRUCTURE_REFERENCE[t]}`)
    .filter(Boolean)
    .join("\n\n");
  const sampleBlock =
    wantedStructures ||
    "Follow the public H5P content specs for each requested content type.";

  // Intent is authored in exactly one mode.
  const intentInstruction =
    intent.authoringMode === "brief"
      ? `The educator specified a structured brief:
- Learning goal: ${intent.learningGoal || "(not set)"}
- Audience level: ${intent.audienceLevel}
- Emphasis: ${intent.emphasis}
- Volume: ${intent.volume} (light ≈ 4 questions, standard ≈ 6, thorough ≈ 10)
- Language: ${intent.language}`
      : `The educator wrote this instruction:
"""
${intent.prompt || "(none — use sensible defaults for a general audience)"}
"""`;

  const mode =
    intent.mode === "extract"
      ? `EXTRACTION MODE. The source already contains questions. Extract each one exactly as written — do not rephrase, reword, shorten, reorder, or invent questions. Carry over any answer options and marked correct answers unchanged. Where the source does not indicate the correct answer, choose the one best supported by the source text and set that item's "provenance" to "inferred". Map each into the requested H5P type without changing its substance.`
      : `GENERATION MODE. Write new questions grounded strictly in the source. Questions must test understanding, not shallow recall. Distractors must be clearly wrong on a careful reading of the source — never defensibly correct.`;

  const prompt = `You are a faithful digital twin of H5P.com's Smart Import. Given source material and an educator's intent, produce a content plan and the content.json for each requested content type.

${mode}

${intentInstruction}

Rules for H5P.SingleChoiceSet / H5P.QuestionSet content.json:
- "choices": array. Each: { "subContentId": <uuid v4>, "question": <plain text, NO html tags>, "answers": [<correct answer FIRST>, <distractor>, <distractor>, <distractor>] }
- 5–8 questions in generation mode unless the brief's volume says otherwise; in extraction mode, one per question found in the source.
- Also include "behaviour", "overallFeedback", "l10n" using the STRUCTURE below.

SOURCE:
${text.slice(0, 12000)}

STRUCTURE (format only — all content must come from the SOURCE above):
${sampleBlock}

Return ONLY JSON:
{
  "sourceSummary": string,
  "planNarrative": string,
  "items": [{
    "id": string,
    "contentType": <one of INTENT.contentTypes>,
    "title": string,
    "concepts": string[],
    "rationale": string,
    "mainLibrary": string,
    "contentJson": object,
    "questionSignals": [
      { "grounding": <the exact source sentence THIS question is built from>, "answerKeyNote": <one line: why this question's marked answer is correct>, "confidence": "high" | "medium" | "low" }
    ],
    "confidence": "high" | "medium" | "low",
    "provenance": "extracted" | "inferred"
  }]
}
"questionSignals" MUST have one entry per question in this item's contentJson.choices, in the same order. For Summary items, one entry per summary set. Only include contentType values listed in INTENT.contentTypes.`;

  const { text: out } = await generateText({
    model: openai(TWIN_MODEL),
    prompt,
    temperature: 0.4,
  });
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as Omit<TwinResult, "engine">;
  return { ...parsed, engine: "model" };
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
