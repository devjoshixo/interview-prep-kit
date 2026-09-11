import { describe, it, expect } from "vitest";
import { groundFlashcards, makeFlashcards } from "../src/core/steps/makeFlashcards";
import type { LlmComplete } from "../src/lib/llm";
import type { Requirement } from "../src/core/types";

const REQS: Requirement[] = [
  { id: "req-1", text: "Go", kind: "technical", priority: "must" },
  { id: "req-2", text: "Kubernetes", kind: "technical", priority: "must" },
];

describe("groundFlashcards (verifies requirement cross-references)", () => {
  it("strips dangling ids, drops malformed cards, re-indexes ids", () => {
    const cards = groundFlashcards(new Set(["req-1", "req-2"]), [
      { requirement_ids: ["req-1", "req-99"], front: "What is a goroutine?", back: "A lightweight thread." },
      { requirement_ids: ["req-2"], front: "", back: "no front -> dropped" },
      { requirement_ids: "not-array", front: "Kubernetes?", back: "Container orchestration." },
    ]);
    expect(cards.map((c) => c.id)).toEqual(["fc-1", "fc-2"]);
    expect(cards[0].requirement_ids).toEqual(["req-1"]); // req-99 stripped
    expect(cards[1].requirement_ids).toEqual([]); // "not-array" -> []
  });
});

describe("makeFlashcards", () => {
  it("generates grounded flashcards from an injected fake LLM", async () => {
    const llm: LlmComplete = async () =>
      JSON.stringify([
        { requirement_ids: ["req-1"], front: "Goroutine?", back: "Lightweight thread." },
        { requirement_ids: ["req-2", "req-x"], front: "K8s?", back: "Orchestrator." },
      ]);
    const cards = await makeFlashcards(REQS, llm);
    expect(cards).toHaveLength(2);
    expect(cards[1].requirement_ids).toEqual(["req-2"]); // req-x stripped
  });

  it("returns [] with no requirements (never calls the LLM)", async () => {
    const llm: LlmComplete = async () => {
      throw new Error("must not be called");
    };
    expect(await makeFlashcards([], llm)).toEqual([]);
  });

  it("returns [] (honest-none) when the LLM output is unusable", async () => {
    const llm: LlmComplete = async () => "not json";
    expect(await makeFlashcards(REQS, llm)).toEqual([]);
  });
});
