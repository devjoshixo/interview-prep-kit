import { describe, it, expect } from "vitest";
import { computeWeakSpots, type PracticeState } from "../src/core/weakSpots";
import type { Kit } from "../src/core/types";

function kitWith(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.com",
      role: "Backend Engineer",
      location: "Remote",
      jd_chars: 100,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: "", what_they_do: "", sources: [] },
    role: {
      title: "Backend Engineer",
      seniority: "mid",
      responsibilities: [],
      requirements: [
        { id: "req-1", text: "Go", kind: "technical", priority: "must" },
        { id: "req-2", text: "GraphQL", kind: "technical", priority: "nice" },
        { id: "req-3", text: "Kubernetes", kind: "technical", priority: "must" },
      ],
    },
    questions: [
      { id: "q-1", requirement_ids: ["req-1"], category: "technical", prompt: "Go?", answer_outline: "o", difficulty: 2 },
      { id: "q-2", requirement_ids: ["req-2"], category: "technical", prompt: "GraphQL?", answer_outline: "o", difficulty: 2 },
    ],
    flashcards: [
      { id: "fc-1", requirement_ids: ["req-1"], front: "Go", back: "lang" },
      { id: "fc-2", requirement_ids: ["req-2"], front: "GraphQL", back: "query" },
    ],
    schedule: { days_available: 5, days: [] },
    coverage: { uncovered_requirement_ids: ["req-3"], passes: 1 },
  };
}

const empty: PracticeState = { knownQuestions: new Set(), cardConfidence: {} };

describe("computeWeakSpots (creative feature — requirement-level study diagnostic)", () => {
  it("ranks an untouched MUST-have with no material as the biggest risk", () => {
    const spots = computeWeakSpots(kitWith(), empty);
    // req-3 is a must-have with zero questions/cards -> nothing to practise, max risk
    expect(spots[0].requirement.id).toBe("req-3");
    expect(spots[0].untouched).toBe(true);
    expect(spots[0].mastery).toBe(0);
  });

  it("drops a requirement down the list as you master its material", () => {
    const practice: PracticeState = {
      knownQuestions: new Set(["q-1"]),
      cardConfidence: { "fc-1": 3 }, // solid on both Go items
    };
    const spots = computeWeakSpots(kitWith(), practice);
    const go = spots.find((s) => s.requirement.id === "req-1")!;
    expect(go.mastery).toBe(1);
    expect(go.risk).toBe(0);
    expect(spots[spots.length - 1].requirement.id).toBe("req-1"); // now the safest
  });

  it("weights a must-have above a nice-to-have at equal mastery", () => {
    // both untouched, both have one question + one card
    const kit = kitWith();
    kit.role.requirements = kit.role.requirements.filter((r) => r.id !== "req-3");
    const spots = computeWeakSpots(kit, empty);
    expect(spots[0].requirement.id).toBe("req-1"); // must beats nice
    expect(spots[0].risk).toBeGreaterThan(spots[1].risk);
  });

  it("counts an unrated card as unproven, and a shaky rating as barely better", () => {
    const unrated = computeWeakSpots(kitWith(), empty).find((s) => s.requirement.id === "req-2")!;
    const shaky = computeWeakSpots(kitWith(), {
      knownQuestions: new Set(),
      cardConfidence: { "fc-2": 1 },
    }).find((s) => s.requirement.id === "req-2")!;
    expect(unrated.mastery).toBe(0);
    expect(shaky.mastery).toBeGreaterThan(0);
    expect(shaky.mastery).toBeLessThan(0.5); // still firmly a weak spot
  });

  it("links each weak spot to the exact material to drill", () => {
    const spots = computeWeakSpots(kitWith(), empty);
    const go = spots.find((s) => s.requirement.id === "req-1")!;
    expect(go.questionIds).toEqual(["q-1"]);
    expect(go.flashcardIds).toEqual(["fc-1"]);
  });
});
