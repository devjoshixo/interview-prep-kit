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

// Must-have material first, then harder first, then broader coverage. Priority
// leads because the brief asks for "harder AND higher-priority material earlier":
// a must-have requirement must not end up behind a nice-to-have.
function byWeight(mustIds: Set<string>) {
  return (a: Question, b: Question): number => {
    const aMust = a.requirement_ids.some((id) => mustIds.has(id)) ? 1 : 0;
    const bMust = b.requirement_ids.some((id) => mustIds.has(id)) ? 1 : 0;
    if (bMust !== aMust) return bMust - aMust;
    if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
    return b.requirement_ids.length - a.requirement_ids.length;
  };
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

// Pad out to exactly the requested number of days. The brief requires the plan to
// span EXACTLY the days asked for, so a sparse kit (few questions, many days)
// gets review days rather than a short plan.
function padToDays(days: ScheduleDay[], daysAvailable: number): ScheduleDay[] {
  const out = [...days];
  while (out.length < daysAvailable) {
    out.push({ day: out.length + 1, focus: "review", question_ids: [], minutes: 0 });
  }
  return out;
}

export function allocateSchedule(
  questions: Question[],
  daysAvailable: number,
  mustRequirementIds: Set<string> = new Set()
): { days_available: number; days: ScheduleDay[] } {
  // No questions => nothing to distribute; an empty schedule is the honest answer
  // (a thin kit should say so rather than invent N days of review).
  if (daysAvailable <= 0 || questions.length === 0) {
    return { days_available: daysAvailable, days: [] };
  }

  const byId = new Map(questions.map((q) => [q.id, q]));
  const sorted = [...questions].sort(byWeight(mustRequirementIds));

  // More days than questions: spread one per day (hardest/must-have first) and
  // pad the rest, instead of cramming everything into day 1.
  if (sorted.length <= daysAvailable) {
    const spread = sorted.map((q, i) => ({
      day: i + 1,
      focus: dayFocus([q.id], byId),
      question_ids: [q.id],
      minutes: estMinutes(q),
    }));
    return { days_available: daysAvailable, days: padToDays(spread, daysAvailable) };
  }

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

  return { days_available: daysAvailable, days: padToDays(days, daysAvailable) };
}
