// Kit types — the graded output shape for the pipeline.
// Field names must match the spec exactly. Do NOT rename fields.

export type Requirement = {
  id: string;
  text: string;
  kind: "technical" | "behavioural" | "domain";
  priority: "must" | "nice";
};

export type Question = {
  id: string;
  requirement_ids: string[];
  category: "technical" | "behavioural" | "system-design" | "company-fit";
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
};

export type ScheduleDay = {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
};

export type Kit = {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: {
    summary: string;
    what_they_do: string;
    sources: string[];
  };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
  };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: {
    days_available: number;
    days: ScheduleDay[];
  };
  coverage: {
    uncovered_requirement_ids: string[];
    passes: number;
  };
};

// Batch (CLI) input/output shapes — see Appendix B.

export type BatchCase = {
  id: string;
  jd: string;
  company_url: string;
  days: number;
};

export type BatchResult = {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
};

export type BatchOutput = {
  version: string;
  generated_at: string;
  kits: BatchResult[];
};
