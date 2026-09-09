import type { Kit } from "./types";

// TODO(owner): implement structural validation — check required fields, id
// cross-references (question.requirement_ids -> requirement.id), enums, and
// non-empty invariants. This stub always reports ok.
export function validateKit(kit: Kit): { ok: boolean; errors: string[] } {
  return { ok: true, errors: [] };
}
