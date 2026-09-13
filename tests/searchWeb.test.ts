import { describe, it, expect } from "vitest";
import { buildQuery, mergeSources, searchWeb, companyFromUrl } from "../src/core/steps/searchWeb";
import type { LlmComplete } from "../src/lib/llm";
import type { WebSearch } from "../src/lib/tavily";
import type { CompanyBrief } from "../src/core/steps/visitSite";

const BRIEF: CompanyBrief = {
  summary: "Acme, a payments company.",
  what_they_do: "Payment rails for banks.",
  sources: ["https://acme.com", "https://acme.com/about"],
};

describe("buildQuery", () => {
  it("builds a company query", () => {
    expect(buildQuery("Acme")).toBe("Acme company overview");
  });
  it("returns empty when there is no company", () => {
    expect(buildQuery("   ")).toBe("");
  });
});

describe("mergeSources", () => {
  it("appends new urls and de-dupes against existing ones", () => {
    expect(
      mergeSources(["https://a.com"], ["https://b.com", "https://a.com", ""])
    ).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("searchWeb (honest-none guards)", () => {
  it("returns the brief unchanged when there is no company to search", async () => {
    const search: WebSearch = async () => {
      throw new Error("search must not run without a company");
    };
    const llm: LlmComplete = async () => {
      throw new Error("llm must not run");
    };
    const out = await searchWeb({ company: "", brief: BRIEF }, { search, llm });
    expect(out).toEqual(BRIEF);
  });

  it("returns the brief unchanged (no LLM call) when the web has no results", async () => {
    const search: WebSearch = async () => [];
    const llm: LlmComplete = async () => {
      throw new Error("llm must not run on honest-none");
    };
    const out = await searchWeb({ company: "Acme", brief: BRIEF }, { search, llm });
    expect(out).toEqual(BRIEF);
  });
});

describe("searchWeb (enrichment)", () => {
  const search: WebSearch = async () => [
    {
      title: "Acme raises Series B",
      url: "https://news.example.com/acme",
      snippet: "Acme, the payments infra startup, raised $40M.",
    },
  ];

  it("sharpens the summary, keeps what_they_do, appends web sources", async () => {
    const llm: LlmComplete = async () =>
      JSON.stringify({ summary: "Acme is a fast-growing payments infra startup." });
    const out = await searchWeb({ company: "Acme", brief: BRIEF }, { search, llm });

    expect(out.summary).toBe("Acme is a fast-growing payments infra startup.");
    expect(out.what_they_do).toBe(BRIEF.what_they_do); // untouched
    expect(out.sources).toEqual([
      "https://acme.com",
      "https://acme.com/about",
      "https://news.example.com/acme",
    ]);
  });

  it("keeps the original summary but still appends sources when the LLM output is unusable", async () => {
    const llm: LlmComplete = async () => "not json";
    const out = await searchWeb({ company: "Acme", brief: BRIEF }, { search, llm });

    expect(out.summary).toBe(BRIEF.summary); // preserved
    expect(out.sources).toContain("https://news.example.com/acme"); // still cited
  });
});

describe("companyFromUrl (research still runs when the JD doesn't name the company)", () => {
  it("derives the registrable name from the URL", () => {
    expect(companyFromUrl("https://posthog.com")).toBe("posthog");
    expect(companyFromUrl("https://www.stripe.com/jobs")).toBe("stripe");
    expect(companyFromUrl("acme.co.uk")).toBe("acme");
  });

  it("returns empty for unusable input rather than guessing", () => {
    expect(companyFromUrl("")).toBe("");
    expect(companyFromUrl("   ")).toBe("");
    expect(companyFromUrl("not a url at all !!")).toBe("");
  });
});
