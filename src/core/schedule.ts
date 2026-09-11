import type { Question, ScheduleDay } from "./types";

// Step 7 — schedule. PURE, no LLM.
//
// Weighted sort (harder + broader-coverage questions first) then a GREEDY PACK:
// spread questions across the available days using a per-day minute budget so the
// plan fits in exactly N days. The key property (owner's catch): it never spills
// past N days and never drops a question — once we're on the last day, everything
// remaining lands there instead of opening a day N+1.

const MINUTES: Record<1 | 2 | 3, number> = { 1: 10, 2: 15, 3: 20 };

function estMinutes(q: Question): number {
  return MINUTES[q.difficulty];
}

// Harder first; ties broken by how many requirements the question covers.
function byWeight(a: Question, b: Question): number {
  if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
  return b.requirement_ids.length - a.requirement_ids.length;
}

function dayFocus(ids: string[], byId: Map<string, Question>): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const category = byId.get(id)?.category;
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let focus = "mixed";
  let best = 0;
  for (const [category, n] of counts) {
    if (n > best) {
      best = n;
      focus = category;
    }
  }
  return focus;
}

export function allocateSchedule(
  questions: Question[],
  daysAvailable: number
): { days_available: number; days: ScheduleDay[] } {
  if (daysAvailable <= 0 || questions.length === 0) {
    return { days_available: daysAvailable, days: [] };
  }

  const byId = new Map(questions.map((q) => [q.id, q]));
  const sorted = [...questions].sort(byWeight);
  const total = sorted.reduce((sum, q) => sum + estMinutes(q), 0);
  const perDay = Math.ceil(total / daysAvailable); // budget that fits in N days

  const days: ScheduleDay[] = [];
  let ids: string[] = [];
  let minutes = 0;
  let dayNum = 1;

  const flush = () => {
    days.push({ day: dayNum, focus: dayFocus(ids, byId), question_ids: ids, minutes });
  };

  for (const q of sorted) {
    const m = estMinutes(q);
    const onLastDay = dayNum >= daysAvailable;
    // Close the day once it's over budget — but never open a day past N, and
    // never leave a day empty. Together these bound the plan to <= N days with
    // no dropped questions.
    if (!onLastDay && ids.length > 0 && minutes + m > perDay) {
      flush();
      dayNum += 1;
      ids = [];
      minutes = 0;
    }
    ids.push(q.id);
    minutes += m;
  }
  if (ids.length > 0) flush();

  return { days_available: daysAvailable, days };
}
