// Step 8 — make flashcards.
//
// Concise recall cards derived from the requirements. One batched LLM call; the
// model tags each card with the requirement ids it covers, and CODE verifies
// those ids exist (dangling refs stripped) — the same grounding move as step 4.
// Honest-none: no requirements, or unusable output, yields no flashcards.

import type { LlmComplete } from "../../lib/llm";
import type { Flashcard, Requirement } from "../types";
import { parseJsonArray } from "../parseArray";

type RawFlashcard = { requirement_ids?: unknown; front?: unknown; back?: unknown };

function asString(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
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

// PURE. Drop malformed cards, strip requirement_ids that don't exist, assign
// contiguous ids (fc-1, fc-2, ...).
export function groundFlashcards(
  validIds: Set<string>,
  raw: RawFlashcard[]
): Flashcard[] {
  const out: Flashcard[] = [];
  for (const f of raw) {
    const front = asString(f.front);
    const back = asString(f.back);
    if (!front || !back) continue;
    const requirement_ids = Array.isArray(f.requirement_ids)
      ? f.requirement_ids.filter(
          (id): id is string => typeof id === "string" && validIds.has(id)
        )
      : [];
    out.push({ id: `fc-${out.length + 1}`, front, back, requirement_ids });
  }
  return out;
}

function buildPrompt(requirements: Requirement[]): string {
  const list = requirements
    .map((r) => `- ${r.id} [${r.priority}] ${r.text}`)
    .join("\n");
  return [
    "Write concise interview flashcards for quick recall.",
    "For each flashcard:",
    "- `front`: a short question or term to recall;",
    "- `back`: the key answer in 1-2 sentences;",
    "- reference the requirement id(s) it covers, chosen ONLY from the list below.",
    "Aim for one card per important requirement (8-12 total).",
    "",
    "Requirements:",
    list,
  ].join("\n");
}

export async function makeFlashcards(
  requirements: Requirement[],
  llm: LlmComplete
): Promise<Flashcard[]> {
  if (requirements.length === 0) return [];
  const validIds = new Set(requirements.map((r) => r.id));
  try {
    const raw = await llm(buildPrompt(requirements), { schema: FLASHCARD_SCHEMA });
    return groundFlashcards(validIds, parseJsonArray(raw) as RawFlashcard[]);
  } catch {
    return []; // honest-none: no flashcards rather than a crash
  }
}
