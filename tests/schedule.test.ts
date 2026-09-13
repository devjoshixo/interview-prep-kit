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

describe("allocateSchedule — spans exactly the days requested", () => {
  it("emits exactly N days when questions are sparse (the 60-day case)", () => {
    const res = allocateSchedule([q("q-1", 3), q("q-2", 2), q("q-3", 1)], 60);
    expect(res.days).toHaveLength(60); // not 1, not 3 — exactly what was asked for
    expect(res.days.map((d) => d.day)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1)
    );
    // the three questions are spread one per day, hardest first, rest are review
    expect(res.days.slice(0, 3).map((d) => d.question_ids)).toEqual([["q-1"], ["q-2"], ["q-3"]]);
    expect(res.days[3]).toEqual({ day: 4, focus: "review", question_ids: [], minutes: 0 });
    const scheduled = res.days.flatMap((d) => d.question_ids);
    expect(scheduled.sort()).toEqual(["q-1", "q-2", "q-3"]); // nothing dropped
  });

  it("still fits a dense kit inside N days without dropping anything", () => {
    const many = Array.from({ length: 12 }, (_, i) => q(`q-${i + 1}`, 2));
    const res = allocateSchedule(many, 3);
    expect(res.days).toHaveLength(3);
    expect(res.days.flatMap((d) => d.question_ids)).toHaveLength(12);
  });
});

describe("allocateSchedule — must-have material lands earlier", () => {
  it("puts a must-have question before an easier nice-to-have one", () => {
    const mustIds = new Set(["req-must"]);
    // the nice-to-have is HARDER, so without priority it would sort first
    const questions = [
      q("q-nice", 3, "technical", ["req-nice"]),
      q("q-must", 1, "technical", ["req-must"]),
    ];
    const res = allocateSchedule(questions, 2, mustIds);
    expect(res.days[0].question_ids).toEqual(["q-must"]);
    expect(res.days[1].question_ids).toEqual(["q-nice"]);
  });

  it("falls back to difficulty ordering when no priorities are given", () => {
    const res = allocateSchedule([q("q-easy", 1), q("q-hard", 3)], 2);
    expect(res.days[0].question_ids).toEqual(["q-hard"]);
  });
});

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
