import { describe, it, expect } from "vitest";
import {
  groundQuestions,
  makeQuestions,
  CATEGORIES,
} from "../src/core/steps/makeQuestions";
import type { LlmComplete } from "../src/lib/llm";
import type { Requirement } from "../src/core/types";
import type { CompanyBrief } from "../src/core/steps/visitSite";

const REQUIREMENTS: Requirement[] = [
  { id: "req-1", text: "Go", kind: "technical", priority: "must" },
  { id: "req-2", text: "Kubernetes", kind: "technical", priority: "must" },
];
const BRIEF: CompanyBrief = { summary: "s", what_they_do: "w", sources: [] };

describe("groundQuestions (code verifies the LLM's requirement cross-references)", () => {
  it("strips dangling requirement_ids, clamps difficulty, drops malformed, re-indexes", () => {
    const validIds = new Set(["req-1", "req-2"]);
    const qs = groundQuestions(validIds, [
      {
        category: "technical",
        raw: [
          {
            requirement_ids: ["req-1", "req-99"], // req-99 invented
            prompt: "Explain goroutines.",
            answer_outline: "concurrency model",
            difficulty: 2,
          },
          {
            requirement_ids: ["req-2"],
            prompt: "", // malformed -> skipped
            answer_outline: "x",
            difficulty: 1,
          },
        ],
      },
      {
        category: "company-fit",
        raw: [
          {
            requirement_ids: "not-an-array", // -> []
            prompt: "Why us?",
            answer_outline: "motivation",
            difficulty: 9, // out of range -> clamped
          },
        ],
      },
    ]);

    expect(qs.map((q) => q.id)).toEqual(["q-1", "q-2"]); // contiguous across batches
    expect(qs[0].requirement_ids).toEqual(["req-1"]); // req-99 stripped
    expect(qs[0].category).toBe("technical");
    expect(qs[1].requirement_ids).toEqual([]); // "not-an-array" -> []
    expect(qs[1].difficulty).toBe(2); // 9 clamped to default
    expect(qs[1].category).toBe("company-fit");
  });
});

// A fake LLM that answers calls in order (one per category).
function queuedLlm(responses: string[]): LlmComplete {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("LLM called more times than queued");
    return next;
  };
}

describe("makeQuestions (per-category batching + grounding)", () => {
  it("calls the LLM once per category and grounds every requirement_id", async () => {
    const perCategory = CATEGORIES.map((category, i) =>
      JSON.stringify([
        {
          requirement_ids: i === 0 ? ["req-1", "req-nope"] : ["req-2"],
          prompt: `${category} question`,
          answer_outline: "outline",
          difficulty: 2,
        },
      ])
    );

    const qs = await makeQuestions(REQUIREMENTS, BRIEF, queuedLlm(perCategory));

    expect(qs).toHaveLength(4); // one per category
    expect(qs.map((q) => q.category)).toEqual(CATEGORIES);
    // no dangling ref survived, every id is real
    const validIds = new Set(["req-1", "req-2"]);
    for (const q of qs) {
      for (const id of q.requirement_ids) expect(validIds.has(id)).toBe(true);
    }
    expect(qs[0].requirement_ids).toEqual(["req-1"]); // req-nope stripped
  });

  it("a failed category (bad JSON) yields no questions for it, others survive", async () => {
    const responses = [
      "garbage-not-json", // technical fails
      JSON.stringify([
        { requirement_ids: [], prompt: "b", answer_outline: "o", difficulty: 1 },
      ]),
      JSON.stringify([
        { requirement_ids: [], prompt: "s", answer_outline: "o", difficulty: 1 },
      ]),
      JSON.stringify([
        { requirement_ids: [], prompt: "f", answer_outline: "o", difficulty: 1 },
      ]),
    ];
    const qs = await makeQuestions(REQUIREMENTS, BRIEF, queuedLlm(responses));
    expect(qs.map((q) => q.category)).toEqual([
      "behavioural",
      "system-design",
      "company-fit",
    ]);
  });
});
