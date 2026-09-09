import type { Question, ScheduleDay } from "./types";

// TODO(owner): implement schedule allocation — spread question_ids across the
// available days, balance minutes, order by difficulty/priority. This stub
// returns an empty schedule with the correct shape.
export function allocateSchedule(
  questions: Question[],
  daysAvailable: number
): { days_available: number; days: ScheduleDay[] } {
  return { days_available: daysAvailable, days: [] };
}
