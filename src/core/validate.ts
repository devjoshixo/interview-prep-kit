import type { Kit } from "./types";

// Structural validation of a generated kit: required fields, valid enums, and
// id cross-references (questions/flashcards -> requirements, schedule ->
// questions). Used to guard the batch output — a kit that fails this is broken
// regardless of how good its content reads.

const REQ_KINDS = new Set(["technical", "behavioural", "domain"]);
const PRIORITIES = new Set(["must", "nice"]);
const CATEGORIES = new Set(["technical", "behavioural", "system-design", "company-fit"]);

export function validateKit(kit: Kit): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const reqIds = new Set(kit.role.requirements.map((r) => r.id));
  const questionIds = new Set(kit.questions.map((q) => q.id));

  for (const r of kit.role.requirements) {
    if (!r.id) errors.push("requirement missing id");
    if (!r.text) errors.push(`requirement ${r.id} missing text`);
    if (!REQ_KINDS.has(r.kind)) errors.push(`requirement ${r.id} invalid kind: ${r.kind}`);
    if (!PRIORITIES.has(r.priority)) errors.push(`requirement ${r.id} invalid priority: ${r.priority}`);
  }

  for (const q of kit.questions) {
    if (!q.id) errors.push("question missing id");
    if (!q.prompt) errors.push(`question ${q.id} missing prompt`);
    if (!q.answer_outline) errors.push(`question ${q.id} missing answer_outline`);
    if (!CATEGORIES.has(q.category)) errors.push(`question ${q.id} invalid category: ${q.category}`);
    if (![1, 2, 3].includes(q.difficulty)) errors.push(`question ${q.id} invalid difficulty: ${q.difficulty}`);
    for (const id of q.requirement_ids) {
      if (!reqIds.has(id)) errors.push(`question ${q.id} references unknown requirement ${id}`);
    }
  }

  for (const f of kit.flashcards) {
    if (!f.front || !f.back) errors.push(`flashcard ${f.id} missing front/back`);
    for (const id of f.requirement_ids) {
      if (!reqIds.has(id)) errors.push(`flashcard ${f.id} references unknown requirement ${id}`);
    }
  }

  for (const d of kit.schedule.days) {
    for (const id of d.question_ids) {
      if (!questionIds.has(id)) errors.push(`schedule day ${d.day} references unknown question ${id}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
