import type { Question, Requirement } from "./types";

// TODO(owner): implement coverage — return the ids of requirements that no
// question references. This stub returns an empty list (nothing uncovered).
export function findUncovered(
  requirements: Requirement[],
  questions: Question[]
): string[] {
  return [];
}
