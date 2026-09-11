import { describe, it, expect } from "vitest";
import { fillGaps, groundGapFill } from "../src/core/steps/fillGaps";
import { findUncovered } from "../src/core/coverage";
import type { LlmComplete } from "../src/lib/llm";
import type { Question, Requirement } from "../src/core/types";
import type { CompanyBrief } from "../src/core/steps/visitSite";

const REQS: Requirement[] = [
  { id: "req-1", text: "Go", kind: "technical", priority: "must" },
  { id: "req-2", text: "Kubernetes", kind: "technical", priority: "must" },
];
const BRIEF: CompanyBrief = { summary: "s", what_they_do: "w", sources: [] };

function question(id: string, reqIds: string[]): Question {
  return {
    id,
    requirement_ids: reqIds,
    category: "technical",
    prompt: `prompt ${id}`,
    answer_outline: "outline",
    difficulty: 2,
  };
}

function queuedLlm(responses: string[]): LlmComplete {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("LLM called more times than queued");
    return next;
  };
}

describe("groundGapFill (append with continued ids, per-question category)", () => {
  it("continues ids from startIndex and clamps category/difficulty", () => {
    const added = groundGapFill(
      new Set(["req-2"]),
      [
        {
          requirement_ids: ["req-2", "req-x"],
          category: "system-design",
          prompt: "Design it",
          answer_outline: "o",
          difficulty: 3,
        },
        {
          requirement_ids: ["req-2"],
          category: "bogus", // -> technical
          prompt: "P",
          answer_outline: "o",
          difficulty: 7, // -> 2
        },
      ],
      5 // existing length -> next id is q-6
    );
    expect(added.map((q) => q.id)).toEqual(["q-6", "q-7"]);
    expect(added[0].requirement_ids).toEqual(["req-2"]); // req-x stripped
    expect(added[0].category).toBe("system-design");
    expect(added[1].category).toBe("technical");
    expect(added[1].difficulty).toBe(2);
  });
});

describe("fillGaps (loop, append-don't-clobber, early-exit, cap)", () => {
  it("early-exits without calling the LLM when nothing is uncovered", async () => {
    const initial = [question("q-1", ["req-1"]), question("q-2", ["req-2"])];
    const res = await fillGaps(REQS, initial, BRIEF, queuedLlm([]));
    expect(res.passes).toBe(1);
    expect(res.questions).toEqual(initial);
  });

  it("fills the gap by APPENDING, leaving the original questions byte-for-byte", async () => {
    const initial = [question("q-1", ["req-1"])]; // req-2 uncovered
    const gap = JSON.stringify([
      {
        requirement_ids: ["req-2"],
        category: "system-design",
        prompt: "Design a scheduler",
        answer_outline: "durability",
        difficulty: 3,
      },
    ]);

    const res = await fillGaps(REQS, initial, BRIEF, queuedLlm([gap]));

    expect(res.passes).toBe(2);
    expect(res.questions).toHaveLength(2);
    expect(res.questions[0]).toEqual(initial[0]); // untouched
    expect(res.questions[1].id).toBe("q-2"); // id continues
    expect(res.questions[1].requirement_ids).toEqual(["req-2"]);
    expect(findUncovered(REQS, res.questions)).toEqual([]); // gap closed
  });

  it("stops at the cap when the model never actually covers the gap (no infinite loop)", async () => {
    const initial = [question("q-1", ["req-1"])]; // req-2 stays uncovered
    // each pass returns a question that does NOT reference req-2
    const useless = JSON.stringify([
      {
        requirement_ids: [],
        category: "technical",
        prompt: "unrelated",
        answer_outline: "o",
        difficulty: 1,
      },
    ]);

    const res = await fillGaps(REQS, initial, BRIEF, queuedLlm([useless, useless, useless]), 3);

    expect(res.passes).toBe(3); // 1 initial + 2 gap passes, then capped
    expect(findUncovered(REQS, res.questions)).toEqual(["req-2"]); // still uncovered, but bounded
  });

  it("stops immediately when the model returns nothing usable", async () => {
    const initial = [question("q-1", ["req-1"])];
    const res = await fillGaps(REQS, initial, BRIEF, queuedLlm(["[]"]));
    expect(res.passes).toBe(1);
    expect(res.questions).toEqual(initial);
  });
});
