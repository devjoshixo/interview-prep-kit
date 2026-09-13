// Weak spots — the creative feature. PURE, no LLM.
//
// The kit already links every question and flashcard to the requirement ids it
// covers (that link is what makes coverage checkable rather than a matter of
// opinion). This turns that same graph into a study diagnostic: instead of
// "which cards are shaky", it answers the question a candidate actually has the
// night before — "which REQUIREMENT am I most likely to get burned on, weighted
// by whether the employer marked it must-have?"
//
// Mastery is the average of the practice signals attached to a requirement;
// risk is the un-mastered share, weighted by priority. A must-have you have not
// touched is the worst thing in the kit; a nice-to-have you rated solid is the
// least interesting.

import type { Kit, Requirement } from "./types";

export type PracticeState = {
  knownQuestions: Set<string>;
  cardConfidence: Record<string, number>; // card id -> 1 | 2 | 3 (absent = unrated)
};

export type WeakSpot = {
  requirement: Requirement;
  mastery: number; // 0..1 — how well covered by your own practice
  risk: number; // 0..1 — higher means drill this first
  questionIds: string[];
  flashcardIds: string[];
  untouched: boolean; // no practice signal at all yet
};

// An unrated card counts as zero, not as neutral: you have not proved it.
const CARD_SCORE: Record<number, number> = { 0: 0, 1: 0.2, 2: 0.6, 3: 1 };
const PRIORITY_WEIGHT: Record<Requirement["priority"], number> = { must: 1, nice: 0.6 };

export function computeWeakSpots(kit: Kit, practice: PracticeState): WeakSpot[] {
  const spots = kit.role.requirements.map((requirement) => {
    const questionIds = kit.questions
      .filter((q) => q.requirement_ids.includes(requirement.id))
      .map((q) => q.id);
    const flashcardIds = kit.flashcards
      .filter((f) => f.requirement_ids.includes(requirement.id))
      .map((f) => f.id);

    const signals = [
      ...questionIds.map((id) => (practice.knownQuestions.has(id) ? 1 : 0)),
      ...flashcardIds.map((id) => CARD_SCORE[practice.cardConfidence[id] ?? 0] ?? 0),
    ];
    const mastery = signals.length
      ? signals.reduce((sum, s) => sum + s, 0) / signals.length
      : 0;

    return {
      requirement,
      mastery,
      risk: (1 - mastery) * PRIORITY_WEIGHT[requirement.priority],
      questionIds,
      flashcardIds,
      untouched: signals.every((s) => s === 0),
    };
  });

  // Riskiest first; ties go to must-have, then to whichever has less material
  // to practise against (thin coverage is itself a risk).
  return spots.sort((a, b) => {
    if (b.risk !== a.risk) return b.risk - a.risk;
    const aMust = a.requirement.priority === "must" ? 1 : 0;
    const bMust = b.requirement.priority === "must" ? 1 : 0;
    if (bMust !== aMust) return bMust - aMust;
    return (
      a.questionIds.length + a.flashcardIds.length - (b.questionIds.length + b.flashcardIds.length)
    );
  });
}
