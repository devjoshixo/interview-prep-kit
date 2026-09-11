import type { Question, Requirement } from "./types";

// Step 5 — coverage. PURE, no LLM.
//
// Set difference: the requirement ids that NO question references. Because step 4
// already grounded every question's requirement_ids against real requirements,
// this can trust the links and just diff the two sets. Order follows the
// requirements list, so the output is stable.
export function findUncovered(
  requirements: Requirement[],
  questions: Question[]
): string[] {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const id of q.requirement_ids) covered.add(id);
  }
  return requirements.map((r) => r.id).filter((id) => !covered.has(id));
}
