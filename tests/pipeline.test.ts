import { describe, it, expect } from "vitest";
import { makeKit } from "../src/core/pipeline";
import type { LlmComplete } from "../src/lib/llm";
import type { FetchPage } from "../src/lib/http";
import type { WebSearch } from "../src/lib/tavily";

const JD =
  "We need strong Go experience and hands-on Kubernetes. " +
  "You will design services and mentor juniors.";

// A fake LLM that answers calls in order, so each step gets the right form back.
function queuedLlm(responses: string[]): LlmComplete {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("LLM called more times than queued");
    return next;
  };
}

const STEP1 = JSON.stringify({
  company: "Acme",
  role_title: "Backend Engineer",
  location: "Remote",
  seniority: "mid",
  responsibilities: ["design services", "mentor juniors"],
  requirements: [
    { text: "Go", kind: "technical", evidence: "strong Go experience" },
    { text: "Kubernetes", kind: "technical", evidence: "hands-on Kubernetes" },
    { text: "Rust", kind: "technical", evidence: "not in the jd at all" }, // invented
  ],
});

const STEP2 = JSON.stringify({
  summary: "Acme, a payments company.",
  what_they_do: "Payment rails for banks.",
});

const STEP3 = JSON.stringify({
  summary: "Acme is a fast-growing payments infrastructure startup.",
});

describe("makeKit — step 1 -> 2 -> 3 chain", () => {
  it("builds role + site brief + web enrichment, each step keeping the last intact", async () => {
    const html: Record<string, string> = {
      "https://acme.com": '<a href="/about">About</a><p>home</p>',
      "https://acme.com/about": "<p>Acme builds payment rails.</p>",
    };
    const fetchPage: FetchPage = async (u) => html[u] ?? null;
    const search: WebSearch = async () => [
      {
        title: "Acme raises Series B",
        url: "https://news.example.com/acme",
        snippet: "Acme raised $40M for payments infra.",
      },
    ];

    const kit = await makeKit(
      { jd: JD, company_url: "https://acme.com", days: 5 },
      { llm: queuedLlm([STEP1, STEP2, STEP3]), fetchPage, search }
    );

    // step 1
    expect(kit.role.requirements.map((r) => r.text)).toEqual(["Go", "Kubernetes"]);
    // step 2 (own site) — what_they_do survives step 3 untouched
    expect(kit.company_brief.what_they_do).toBe("Payment rails for banks.");
    // step 3 (web) — summary sharpened, web source appended
    expect(kit.company_brief.summary).toBe(
      "Acme is a fast-growing payments infrastructure startup."
    );
    expect(kit.company_brief.sources).toContain("https://news.example.com/acme");
    // pages_used stays own-site only; the web URL is a brief source, not a crawled page
    expect(kit.source.pages_used).not.toContain("https://news.example.com/acme");
  });

  it("all external steps failing leaves step 1 intact — honest-none, no crash", async () => {
    const fetchPage: FetchPage = async () => null; // site unreachable
    const search: WebSearch = async () => []; // web finds nothing

    const kit = await makeKit(
      { jd: JD, company_url: "https://acme.com", days: 5 },
      { llm: queuedLlm([STEP1]), fetchPage, search } // steps 2 & 3 never call the LLM
    );

    expect(kit.role.requirements.map((r) => r.text)).toEqual(["Go", "Kubernetes"]);
    expect(kit.company_brief).toEqual({ summary: "", what_they_do: "", sources: [] });
    expect(kit.source.pages_used).toEqual([]);
  });
});
