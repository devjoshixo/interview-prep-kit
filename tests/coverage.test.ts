import { describe, it, expect } from "vitest";
import { findUncovered } from "../src/core/coverage";
import type { Question, Requirement } from "../src/core/types";

const REQS: Requirement[] = [
  { id: "req-1", text: "Go", kind: "technical", priority: "must" },
  { id: "req-2", text: "Kubernetes", kind: "technical", priority: "must" },
  { id: "req-3", text: "SQL", kind: "technical", priority: "nice" },
];

function q(ids: string[]): Question {
  return {
    id: "q",
    requirement_ids: ids,
    category: "technical",
    prompt: "p",
    answer_outline: "a",
    difficulty: 2,
  };
}

describe("findUncovered (set difference on requirement ids)", () => {
  it("returns [] when every requirement is referenced by some question", () => {
    expect(findUncovered(REQS, [q(["req-1", "req-2"]), q(["req-3"])])).toEqual([]);
  });

  it("returns all ids when no question references anything", () => {
    expect(findUncovered(REQS, [q([]), q([])])).toEqual([
      "req-1",
      "req-2",
      "req-3",
    ]);
  });

  it("returns only the unreferenced ids, in requirement order", () => {
    expect(findUncovered(REQS, [q(["req-2"])])).toEqual(["req-1", "req-3"]);
  });

  it("ignores an unknown id a question might carry", () => {
    expect(findUncovered(REQS, [q(["req-1", "req-999"])])).toEqual([
      "req-2",
      "req-3",
    ]);
  });

  it("no requirements -> nothing uncovered", () => {
    expect(findUncovered([], [q([])])).toEqual([]);
  });
});
