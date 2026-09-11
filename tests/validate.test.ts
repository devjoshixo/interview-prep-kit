import { describe, it, expect } from "vitest";
import { validateKit } from "../src/core/validate";
import type { Kit } from "../src/core/types";

function validKit(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.com",
      role: "Backend Engineer",
      location: "",
      jd_chars: 100,
      researched_at: "2026-01-01T00:00:00.000Z",
      pages_used: [],
    },
    company_brief: { summary: "s", what_they_do: "w", sources: [] },
    role: {
      title: "Backend Engineer",
      seniority: "mid",
      responsibilities: [],
      requirements: [{ id: "req-1", text: "Go", kind: "technical", priority: "must" }],
    },
    questions: [
      { id: "q-1", requirement_ids: ["req-1"], category: "technical", prompt: "P", answer_outline: "A", difficulty: 2 },
    ],
    flashcards: [{ id: "fc-1", front: "F", back: "B", requirement_ids: ["req-1"] }],
    schedule: { days_available: 5, days: [{ day: 1, focus: "technical", question_ids: ["q-1"], minutes: 20 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("validateKit", () => {
  it("passes a well-formed kit", () => {
    expect(validateKit(validKit())).toEqual({ ok: true, errors: [] });
  });

  it("flags a question referencing an unknown requirement", () => {
    const kit = validKit();
    kit.questions[0].requirement_ids = ["req-999"];
    const res = validateKit(kit);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toContain("unknown requirement req-999");
  });

  it("flags a schedule day referencing an unknown question", () => {
    const kit = validKit();
    kit.schedule.days[0].question_ids = ["q-nope"];
    const res = validateKit(kit);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toContain("unknown question q-nope");
  });

  it("flags an invalid enum and a missing field", () => {
    const kit = validKit();
    // @ts-expect-error deliberately invalid category for the test
    kit.questions[0].category = "gibberish";
    kit.questions[0].prompt = "";
    const res = validateKit(kit);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("invalid category"))).toBe(true);
    expect(res.errors.some((e) => e.includes("missing prompt"))).toBe(true);
  });

  it("flags a flashcard with a dangling requirement and missing back", () => {
    const kit = validKit();
    kit.flashcards[0].back = "";
    kit.flashcards[0].requirement_ids = ["req-x"];
    const res = validateKit(kit);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("missing front/back"))).toBe(true);
    expect(res.errors.some((e) => e.includes("unknown requirement req-x"))).toBe(true);
  });
});
