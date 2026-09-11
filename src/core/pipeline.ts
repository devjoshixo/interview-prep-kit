import type { Kit } from "./types";
import { complete, type LlmComplete } from "../lib/llm";
import { fetchPage as defaultFetchPage, type FetchPage } from "../lib/http";
import { tavilySearch, type WebSearch } from "../lib/tavily";
import { readJd } from "./steps/readJd";
import { visitSite } from "./steps/visitSite";
import { searchWeb } from "./steps/searchWeb";

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
};

// The pipeline is built block by block. Steps land in order; each fills its own
// slice of the Kit and never clobbers the ones before it. A later step failing
// (e.g. the site is unreachable) must not undo an earlier step's work.
//
//   [x] step 1 - read the JD (role, requirements, grounded evidence)
//   [x] step 2 - visit the site (company brief, honest-none on failure)
//   [x] step 3 - search the web (enrich brief summary + sources)
//   [ ] step 4 - make questions
//   [ ] step 5 - coverage
//   [ ] step 6 - fill gaps
//   [ ] step 7 - schedule
export async function makeKit(
  input: MakeKitInput,
  deps: MakeKitDeps = {}
): Promise<Kit> {
  const llm = deps.llm ?? complete;
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const search = deps.search ?? tavilySearch;

  // Step 1 — read the JD.
  const role = await readJd(input.jd, llm);

  // Step 2 — visit the site.
  const site = await visitSite(input.company_url, { fetchPage, llm });

  // Step 3 — search the web (enrich the brief; own-site data stays intact).
  const brief = await searchWeb(
    { company: role.company, brief: site.brief },
    { search, llm }
  );

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
