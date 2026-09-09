import type { Kit } from "./types";

// Input accepted by the pipeline. The owner may widen this as steps are added.
export type MakeKitInput = {
  jd: string;
  company_url: string;
  days: number;
};

// TODO(owner): implement the real pipeline — research, extraction, question/
// flashcard generation, schedule allocation, coverage. This stub returns a
// valid-shaped empty Kit so the CLI and callers can be wired up today.
export async function makeKit(input: MakeKitInput): Promise<Kit> {
  return {
    source: {
      company: "",
      company_url: input.company_url,
      role: "",
      location: "",
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: {
      summary: "",
      what_they_do: "",
      sources: [],
    },
    role: {
      title: "",
      seniority: "",
      responsibilities: [],
      requirements: [],
    },
    questions: [],
    flashcards: [],
    schedule: {
      days_available: input.days,
      days: [],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 0,
    },
  };
}
