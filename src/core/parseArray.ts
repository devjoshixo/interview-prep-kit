// Tolerant array parsing for model output.
//
// Every step that asks the model for a LIST has to cope with the fact that models
// drift between two shapes for the same prompt: a bare array `[...]`, or that array
// wrapped in an object (`{"flashcards": [...]}`, `{"items": [...]}`). Treating the
// wrapped shape as unusable silently produced an EMPTY section — a whole flashcard
// deck vanishing because of a JSON envelope. Accept both; still return [] for
// genuinely unusable output, so honest-none is preserved.
export function parseJsonArray(raw: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    // Take the first array-valued property — covers every wrapper key a model picks.
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}
