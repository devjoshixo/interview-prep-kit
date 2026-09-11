// Step 3 — search the web.
//
// Run a Tavily search on the company and use the results to sharpen the brief's
// summary and add external citations. The company's OWN site (step 2) remains
// the source of `what_they_do`; the web only enriches `summary`. Honest-none: no
// company to search, no results, or unparsable output leaves the brief untouched.

import type { LlmComplete } from "../../lib/llm";
import type { WebSearch, WebResult } from "../../lib/tavily";
import type { CompanyBrief } from "./visitSite";

export type SearchDeps = {
  search: WebSearch;
  llm: LlmComplete;
};

export function buildQuery(company: string): string {
  const c = company.trim();
  return c ? `${c} company overview` : "";
}

// PURE. Append web URLs to the existing sources, de-duplicated, order preserved.
export function mergeSources(existing: string[], webUrls: string[]): string[] {
  const seen = new Set(existing);
  const out = [...existing];
  for (const url of webUrls) {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

const ENRICH_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

function buildEnrichPrompt(brief: CompanyBrief, results: WebResult[]): string {
  const web = results
    .map((r) => `- ${r.title} (${r.url})\n  ${r.snippet}`)
    .join("\n");
  return [
    "You are sharpening a one-to-two sentence company summary.",
    "You are given the current summary (from the company's own site) and a few",
    "web search results. Rewrite the summary using ONLY facts present below.",
    "If the web adds nothing, return the current summary unchanged. Do not invent.",
    "",
    `Current summary: ${brief.summary || "(none)"}`,
    `What they do: ${brief.what_they_do || "(none)"}`,
    "",
    "Web results:",
    web,
  ].join("\n");
}

export async function searchWeb(
  args: { company: string; brief: CompanyBrief },
  deps: SearchDeps
): Promise<CompanyBrief> {
  const query = buildQuery(args.company);
  if (!query) return args.brief; // nothing to search on

  const results = await deps.search(query);
  if (results.length === 0) return args.brief; // honest-none

  const sources = mergeSources(
    args.brief.sources,
    results.map((r) => r.url)
  );

  // Enrich the summary; keep the original if the model returns nothing usable.
  let summary = args.brief.summary;
  try {
    const raw = await deps.llm(buildEnrichPrompt(args.brief, results), {
      schema: ENRICH_SCHEMA,
    });
    const form = JSON.parse(raw) as { summary?: unknown };
    const next = typeof form.summary === "string" ? form.summary.trim() : "";
    if (next) summary = next;
  } catch {
    // keep original summary
  }

  return { summary, what_they_do: args.brief.what_they_do, sources };
}
