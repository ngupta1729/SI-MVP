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

function heuristicAnalysis(text: string): SourceAnalysis {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = (text.match(/[^.!?]{15,}[.!?]/g) ?? []).map((s) => s.trim());
  const concepts = extractConcepts(text, 6);
  return {
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
    watchOuts: ["Read-back is running without the model — concepts are frequency-based only"],
    detectedQuestions: (text.match(/\?/g) ?? []).length,
    suggestedObjectives: [],
    engine: "heuristic",
  };
}

export async function analyzeSource(source: TwinSource): Promise<SourceAnalysis> {
  const text = await resolveSourceText(source);
  const words = text.split(/\s+/).filter(Boolean);
  const detectedQuestions = (text.match(/\?/g) ?? []).length;

  if (!hasModel()) return heuristicAnalysis(text);

  try {
    const prompt = `Read this source material that a teacher wants to turn into H5P quiz/assessment activities. Return a neutral read-back — describe it so the teacher knows what to expect. Do NOT tell them whether to use it; that is their choice.

SOURCE:
${text.slice(0, 12000)}

Return ONLY JSON:
{
  "kind": "conceptual" | "procedural" | "narrative" | "reference" | "mixed",
  "readingLevel": "<in a teacher's words, e.g. 'introductory', 'upper-secondary', 'undergraduate', 'dense'>",
  "concepts": ["<5-8 substantive things a teacher would assess; multi-word allowed; NOT just frequent words>"],
  "themes": ["<3-5 themes the generated questions will draw on, heaviest-covered first>"],
  "strengths": ["<2-3 short phrases: what this source is good raw material for>"],
  "watchOuts": ["<2-3 short phrases: what to expect or what it won't cover well — neutral, e.g. 'fact-dense, so expect what/when questions over why'; NOT 'don't use this'>"]
}`;
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
    return {
      ...parsed,
      wordCount: words.length,
      detectedQuestions,
      suggestedObjectives: [],
      engine: "model",
    };
  } catch (err) {
    console.error("analyze model call failed, using heuristic:", err);
    return heuristicAnalysis(text);
  }
}

/** Rank the catalog against a source analysis + intent — drives recommendations. */
export function recommendActivities(analysis: SourceAnalysis, intent: ImportIntent) {
  const wantAssessment = intent.emphasis === "assessment";
  return CONTENT_TYPES.map((ct) => {
    let score = 0;
    const reasons: string[] = [];
    if (ct.goodFor.includes(analysis.kind)) {
      score += 2;
      reasons.push(`fits ${analysis.kind} material`);
    }
    if (wantAssessment && ct.goodFor.includes("assessment")) {
      score += 2;
      reasons.push("matches your assessment emphasis");
    }
    if (analysis.kind === "procedural" && ct.goodFor.includes("recall")) {
      score -= 1;
    }
    if (ct.goodFor.includes("vocabulary") && analysis.concepts.length < 4) {
      score -= 2;
      reasons.push("few short factual terms in the source");
    }
    return {
      name: ct.name,
      recommended: score >= 2,
      reason: reasons[0] ?? "usable, but not a strong fit for this source",
      score,
    };
  }).sort((a, b) => b.score - a.score);
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
    switch (typeName) {
      case "H5P.Summary":
        contentJson = buildSummary(concepts);
        break;
      case "H5P.SingleChoiceSet":
      case "H5P.QuestionSet":
        contentJson = buildSingleChoiceSet(qa);
        break;
      default:
        // Catalog type with no mock builder yet — still show it in the plan,
        // just without a content payload to preview.
        contentJson = null;
    }
    items.push({ ...base, contentJson });
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
    "grounding": <the source sentence this item is built from>,
    "answerKeyNote": <one line: why the marked key is correct>,
    "confidence": "high" | "medium" | "low",
    "provenance": "extracted" | "inferred"
  }]
}
Only include contentType values listed in INTENT.contentTypes.`;

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
