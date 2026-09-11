import { describe, it, expect } from "vitest";
import { allocateSchedule } from "../src/core/schedule";
import type { Question } from "../src/core/types";

function q(
  id: string,
  difficulty: 1 | 2 | 3,
  category: Question["category"] = "technical",
  requirement_ids: string[] = []
): Question {
  return {
    id,
    requirement_ids,
    category,
    prompt: `prompt ${id}`,
    answer_outline: "o",
    difficulty,
  };
}

describe("allocateSchedule (weighted sort + greedy pack)", () => {
  it("returns an empty schedule for no questions or zero days, keeping days_available", () => {
    expect(allocateSchedule([], 5)).toEqual({ days_available: 5, days: [] });
    expect(allocateSchedule([q("q-1", 2)], 0)).toEqual({ days_available: 0, days: [] });
  });

  it("spreads questions across days and places every question exactly once", () => {
    const qs = ["q-1", "q-2", "q-3", "q-4", "q-5", "q-6"].map((id) => q(id, 2));
    const s = allocateSchedule(qs, 3);

    expect(s.days.length).toBeLessThanOrEqual(3);
    const placed = s.days.flatMap((d) => d.question_ids);
    expect(placed.slice().sort()).toEqual(["q-1", "q-2", "q-3", "q-4", "q-5", "q-6"]);
    expect(new Set(placed).size).toBe(6); // no duplicates, no drops
    // day.minutes matches the questions actually on that day (15 min each, diff 2)
    for (const d of s.days) expect(d.minutes).toBe(d.question_ids.length * 15);
  });

  it("never overflows past N days even with far more questions than days", () => {
    const many = Array.from({ length: 20 }, (_, i) => q(`q-${i + 1}`, 3));
    const s = allocateSchedule(many, 3);

    expect(s.days.length).toBe(3); // capped at daysAvailable
    expect(s.days.flatMap((d) => d.question_ids)).toHaveLength(20); // none dropped
    expect(s.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("orders harder questions first (weighted sort)", () => {
    const s = allocateSchedule([q("easy", 1), q("hard", 3), q("mid", 2)], 1);
    expect(s.days[0].question_ids).toEqual(["hard", "mid", "easy"]);
  });

  it("labels each day's focus with its dominant category", () => {
    const qs = [
      q("q-1", 2, "technical"),
      q("q-2", 2, "technical"),
      q("q-3", 2, "behavioural"),
    ];
    const s = allocateSchedule(qs, 1);
    expect(s.days[0].focus).toBe("technical");
  });
});
