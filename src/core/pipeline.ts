import type { Kit } from "./types";
import { complete, type LlmComplete } from "../lib/llm";
import { fetchPage as defaultFetchPage, type FetchPage } from "../lib/http";
import { tavilySearch, type WebSearch } from "../lib/tavily";
import { readJd } from "./steps/readJd";
import { visitSite } from "./steps/visitSite";
import { searchWeb, companyFromUrl } from "./steps/searchWeb";
import { makeQuestions } from "./steps/makeQuestions";
import { fillGaps } from "./steps/fillGaps";
import { makeFlashcards } from "./steps/makeFlashcards";
import { findUncovered } from "./coverage";
import { allocateSchedule } from "./schedule";

// Input accepted by the pipeline. The owner may widen this as steps are added.
export type MakeKitInput = {
  jd: string;
  company_url: string;
  days: number;
};

// External dependencies, injectable so callers/tests can supply fakes.
// Production uses the real Gemini client, real fetch, and real Tavily by default.
export type MakeKitDeps = {
  llm?: LlmComplete;
  fetchPage?: FetchPage;
  search?: WebSearch;
  // Optional progress hook — called before each step so a background runner can
  // persist live progress. No-op by default (batch/tests don't pass it).
  onProgress?: (step: number, label: string) => void | Promise<void>;
};

// The pipeline is built block by block. Steps land in order; each fills its own
// slice of the Kit and never clobbers the ones before it. A later step failing
// (e.g. the site is unreachable) must not undo an earlier step's work.
//
//   [x] step 1 - read the JD (role, requirements, grounded evidence)
//   [x] step 2 - visit the site (company brief, honest-none on failure)
//   [x] step 3 - search the web (enrich brief summary + sources)
//   [x] step 4 - make questions (per-category batches, grounded requirement ids)
//   [x] step 5 - coverage (set-difference: requirements no question references)
//   [x] step 6 - fill gaps (generate-for-gaps + APPEND, capped loop)
//   [x] step 7 - schedule (weighted sort + greedy pack, bounded to N days)
//   [x] step 8 - flashcards (grounded recall cards from requirements)
export async function makeKit(
  input: MakeKitInput,
  deps: MakeKitDeps = {}
): Promise<Kit> {
  const llm = deps.llm ?? complete;
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const search = deps.search ?? tavilySearch;
  const report = deps.onProgress ?? (() => {});

  // Step 1 — read the JD.
  await report(1, "Reading the JD");
  const role = await readJd(input.jd, llm);

  // Step 2 — visit the site.
  await report(2, "Visiting the site");
  const site = await visitSite(input.company_url, { fetchPage, llm });

  // Step 3 — search the web (enrich the brief; own-site data stays intact).
  // If the JD never named the company, derive it from the URL we were given so the
  // research still happens instead of silently skipping.
  await report(3, "Searching the web");
  const companyName = role.company || companyFromUrl(input.company_url);
  const brief = await searchWeb(
    { company: companyName, brief: site.brief },
    { search, llm }
  );

  // Step 4 — make questions (one batched LLM call per category).
  await report(4, "Writing questions");
  const initialQuestions = await makeQuestions(role.requirements, brief, llm);

  // Step 6 — fill gaps: append questions for anything step 5's coverage flags
  // as uncovered, capped. (Step 5's findUncovered is the loop's coverage check.)
  await report(5, "Filling coverage gaps");
  const { questions, passes } = await fillGaps(
    role.requirements,
    initialQuestions,
    brief,
    llm
  );

  // Step 5 — final coverage after gap-filling.
  const uncovered = findUncovered(role.requirements, questions);

  // Step 8 — flashcards (grounded recall cards from the requirements).
  await report(6, "Making flashcards");
  const flashcards = await makeFlashcards(role.requirements, llm);

  // Step 7 — schedule the questions across the days available.
  await report(7, "Building the study plan");
  const mustIds = new Set(
    role.requirements.filter((r) => r.priority === "must").map((r) => r.id)
  );
  const schedule = allocateSchedule(questions, input.days, mustIds);

  return {
    source: {
      company: role.company,
      company_url: input.company_url,
      role: role.role_title,
      location: role.location,
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: site.pages_used,
    },
    company_brief: brief,
    role: {
      title: role.role_title,
      seniority: role.seniority,
      responsibilities: role.responsibilities,
      requirements: role.requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: uncovered,
      passes,
    },
  };
}
