// Regenerate a section's fresh items, working around what the user locked.
//
// Given the requirements, a KEEP list (locked items — don't duplicate) and an
// AVOID list (deleted tombstones — don't resurrect), ask the LLM for `count` new
// items and ground them (same verification as the pipeline). Honest-none on any
// failure. The caller merges these around the locked items (see core/regenerate).

import type { LlmComplete } from "../../lib/llm";
import type { Flashcard, Question, Requirement } from "../types";
import { groundGapFill } from "./fillGaps";
import { groundFlashcards } from "./makeFlashcards";

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];

function keepAvoidLines(keep: string[], avoid: string[]): string {
  const lines: string[] = [];
  if (keep.length) {
    lines.push("Do NOT duplicate or closely resemble these existing items:");
    lines.push(...keep.map((k) => `- ${k}`));
  }
  if (avoid.length) {
    lines.push("Do NOT produce these previously-rejected items:");
    lines.push(...avoid.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}

const QUESTION_SCHEMA = {
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

export async function regenerateQuestions(
  requirements: Requirement[],
  keep: string[],
  avoid: string[],
  count: number,
  llm: LlmComplete,
  // When given, regenerate ONE category only: the model is told to stay in it and
  // the result is forced to it, so a per-category regenerate can't leak questions
  // into a category the user didn't ask to touch.
  category?: Question["category"]
): Promise<Question[]> {
  if (count <= 0) return [];
  const validIds = new Set(requirements.map((r) => r.id));
  const reqList = requirements.map((r) => `- ${r.id} [${r.priority}] ${r.text}`).join("\n");
  const prompt = [
    category
      ? `Generate ${count} NEW interview questions in the "${category}" category for the role.`
      : `Generate ${count} NEW interview questions for the role.`,
    category
      ? `- EVERY question must be in the "${category}" category;`
      : `- pick a category per question from: ${CATEGORIES.join(", ")};`,
    "- reference requirement ids ONLY from the list below;",
    "- include an answer_outline and a difficulty of 1, 2, or 3.",
    keepAvoidLines(keep, avoid),
    "",
    "Requirements:",
    reqList,
  ].join("\n");
  try {
    const raw = await llm(prompt, { schema: QUESTION_SCHEMA });
    const parsed = JSON.parse(raw);
    const grounded = groundGapFill(validIds, Array.isArray(parsed) ? parsed : [], 0);
    return category ? grounded.map((q) => ({ ...q, category })) : grounded;
  } catch {
    return [];
  }
}

const FLASHCARD_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      requirement_ids: { type: "array", items: { type: "string" } },
      front: { type: "string" },
      back: { type: "string" },
    },
    required: ["requirement_ids", "front", "back"],
  },
};

export async function regenerateFlashcards(
  requirements: Requirement[],
  keep: string[],
  avoid: string[],
  count: number,
  llm: LlmComplete
): Promise<Flashcard[]> {
  if (count <= 0) return [];
  const validIds = new Set(requirements.map((r) => r.id));
  const reqList = requirements.map((r) => `- ${r.id} [${r.priority}] ${r.text}`).join("\n");
  const prompt = [
    `Write ${count} NEW flashcards for quick recall.`,
    "- `front`: a short question or term; `back`: the key answer in 1-2 sentences;",
    "- reference requirement id(s) ONLY from the list below.",
    keepAvoidLines(keep, avoid),
    "",
    "Requirements:",
    reqList,
  ].join("\n");
  try {
    const raw = await llm(prompt, { schema: FLASHCARD_SCHEMA });
    const parsed = JSON.parse(raw);
    return groundFlashcards(validIds, Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}
