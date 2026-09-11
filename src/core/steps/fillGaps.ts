// Step 6 — fill gaps.
//
// The pipeline sibling of the UI's regenerate model: look at what coverage says
// is uncovered, generate questions ONLY for those requirements, and APPEND them —
// the existing questions are never regenerated or touched. Loop until nothing is
// uncovered (early exit) or a hard pass cap is hit (the infinite-loop guard, for
// when the model simply cannot cover a requirement).

import type { LlmComplete } from "../../lib/llm";
import type { Question, Requirement } from "../types";
import type { CompanyBrief } from "./visitSite";
import { findUncovered } from "../coverage";
import { CATEGORIES } from "./makeQuestions";

const MAX_PASSES = 3; // total passes incl. the initial generation

type RawGapQuestion = {
  requirement_ids?: unknown;
  category?: unknown;
  prompt?: unknown;
  answer_outline?: unknown;
  difficulty?: unknown;
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

function asString(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function clampDifficulty(x: unknown): 1 | 2 | 3 {
  return x === 1 || x === 2 || x === 3 ? x : 2;
}

function clampCategory(x: unknown): Question["category"] {
  return typeof x === "string" && CATEGORY_SET.has(x)
    ? (x as Question["category"])
    : "technical";
}

// PURE. Ground appended gap questions. Unlike step 4, category is chosen per
// question (a gap can be any category). ids continue from `startIndex`, so the
// appended questions never collide with the existing ones.
export function groundGapFill(
  validIds: Set<string>,
  raw: RawGapQuestion[],
  startIndex: number
): Question[] {
  const out: Question[] = [];
  for (const q of raw) {
    const prompt = asString(q.prompt);
    const answer_outline = asString(q.answer_outline);
    if (!prompt || !answer_outline) continue;
    const requirement_ids = Array.isArray(q.requirement_ids)
      ? q.requirement_ids.filter(
          (id): id is string => typeof id === "string" && validIds.has(id)
        )
      : [];
    out.push({
      id: `q-${startIndex + out.length + 1}`,
      requirement_ids,
      category: clampCategory(q.category),
      prompt,
      answer_outline,
      difficulty: clampDifficulty(q.difficulty),
    });
  }
  return out;
}

function buildGapPrompt(uncovered: Requirement[], brief: CompanyBrief): string {
  const reqList = uncovered
    .map((r) => `- ${r.id} [${r.priority}] ${r.text}`)
    .join("\n");
  return [
    "Some requirements have no interview question yet. Write ONE question for",
    "each requirement below. Each question must:",
    "- reference that requirement's id in `requirement_ids`;",
    `- pick a \`category\` from: ${CATEGORIES.join(", ")};`,
    "- include an `answer_outline` and a `difficulty` of 1, 2, or 3.",
    brief.what_they_do ? `\nCompany context: ${brief.what_they_do}\n` : "",
    "Uncovered requirements:",
    reqList,
  ].join("\n");
}

const GAP_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      requirement_ids: { type: "array", items: { type: "string" } },
      category: { type: "string", enum: CATEGORIES },
      prompt: { type: "string" },
      answer_outline: { type: "string" },
      difficulty: { type: "integer" },
    },
    required: ["requirement_ids", "category", "prompt", "answer_outline", "difficulty"],
  },
};

async function callGapFill(
  uncovered: Requirement[],
  brief: CompanyBrief,
  llm: LlmComplete
): Promise<RawGapQuestion[]> {
  try {
    const raw = await llm(buildGapPrompt(uncovered, brief), { schema: GAP_SCHEMA });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RawGapQuestion[]) : [];
  } catch {
    return [];
  }
}

export type FillGapsResult = { questions: Question[]; passes: number };

export async function fillGaps(
  requirements: Requirement[],
  initialQuestions: Question[],
  brief: CompanyBrief,
  llm: LlmComplete,
  cap = MAX_PASSES
): Promise<FillGapsResult> {
  const validIds = new Set(requirements.map((r) => r.id));
  let questions = initialQuestions;
  let passes = 1; // the initial generation is pass 1

  while (passes < cap) {
    const uncoveredIds = new Set(findUncovered(requirements, questions));
    if (uncoveredIds.size === 0) break; // early exit — everything covered

    const uncovered = requirements.filter((r) => uncoveredIds.has(r.id));
    const raw = await callGapFill(uncovered, brief, llm);
    const added = groundGapFill(validIds, raw, questions.length);
    if (added.length === 0) break; // model produced nothing usable — don't spin

    questions = [...questions, ...added]; // APPEND — existing questions untouched
    passes += 1;
  }

  return { questions, passes };
}
