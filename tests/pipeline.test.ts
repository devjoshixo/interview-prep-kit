import { describe, it, expect } from "vitest";
import { makeKit } from "../src/core/pipeline";
import type { LlmComplete } from "../src/lib/llm";
import type { FetchPage } from "../src/lib/http";
import type { WebSearch } from "../src/lib/tavily";

const JD =
  "We need strong Go experience and hands-on Kubernetes. " +
  "You will design services and mentor juniors.";

// A fake LLM that answers calls in order. When the queue is exhausted it returns
// `fallback` if given (e.g. "[]" for step 4's per-category calls), else throws.
function queuedLlm(responses: string[], fallback?: string): LlmComplete {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next !== undefined) return next;
    if (fallback !== undefined) return fallback;
    throw new Error("LLM called more times than queued");
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

// Step 4 — one response per category (technical, behavioural, system-design,
// company-fit). The technical batch carries a dangling id to prove it's stripped.
const STEP4 = [
  JSON.stringify([
    {
      requirement_ids: ["req-1", "req-nope"],
      prompt: "Explain goroutines.",
      answer_outline: "concurrency",
      difficulty: 2,
    },
  ]),
  JSON.stringify([
    { requirement_ids: [], prompt: "Tell me about conflict.", answer_outline: "STAR", difficulty: 1 },
  ]),
  JSON.stringify([
    { requirement_ids: ["req-2"], prompt: "Design a queue.", answer_outline: "durability", difficulty: 3 },
  ]),
  JSON.stringify([
    { requirement_ids: [], prompt: "Why Acme?", answer_outline: "mission fit", difficulty: 1 },
  ]),
];

describe("makeKit — step 1 -> 2 -> 3 -> 4 chain", () => {
  it("builds role + brief + web enrichment + questions, each step keeping the last intact", async () => {
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
      { llm: queuedLlm([STEP1, STEP2, STEP3, ...STEP4]), fetchPage, search }
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
    expect(kit.source.pages_used).not.toContain("https://news.example.com/acme");
    // step 4 — one question per category, and every requirement_id is real
    expect(kit.questions).toHaveLength(4);
    const validIds = new Set(kit.role.requirements.map((r) => r.id));
    for (const q of kit.questions) {
      for (const id of q.requirement_ids) expect(validIds.has(id)).toBe(true);
    }
    expect(kit.questions[0].requirement_ids).toEqual(["req-1"]); // req-nope stripped
    // step 5 — both requirements are referenced (req-1 by technical, req-2 by system-design)
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    // step 6 — everything covered on the first pass, so the gap-fill loop early-exits
    expect(kit.coverage.passes).toBe(1);
    // step 7 — all questions scheduled once, bounded to the days available
    expect(kit.schedule.days_available).toBe(5);
    expect(kit.schedule.days.length).toBeLessThanOrEqual(5);
    const scheduled = kit.schedule.days.flatMap((d) => d.question_ids);
    expect(scheduled.slice().sort()).toEqual(kit.questions.map((q) => q.id).sort());
  });

  it("all external steps failing leaves step 1 intact — honest-none, no crash", async () => {
    const fetchPage: FetchPage = async () => null; // site unreachable
    const search: WebSearch = async () => []; // web finds nothing

    const kit = await makeKit(
      { jd: JD, company_url: "https://acme.com", days: 5 },
      // steps 2 & 3 never call the LLM; step 4's category calls fall back to "[]"
      { llm: queuedLlm([STEP1], "[]"), fetchPage, search }
    );

    expect(kit.role.requirements.map((r) => r.text)).toEqual(["Go", "Kubernetes"]);
    expect(kit.company_brief).toEqual({ summary: "", what_they_do: "", sources: [] });
    expect(kit.source.pages_used).toEqual([]);
    expect(kit.questions).toEqual([]); // no question data -> no questions, no crash
    // step 5 — with no questions, every requirement is uncovered
    expect(kit.coverage.uncovered_requirement_ids).toEqual(["req-1", "req-2"]);
    // step 6 — no question data to fill with, so it stops at pass 1 without spinning
    expect(kit.coverage.passes).toBe(1);
    // step 7 — no questions -> empty schedule, days_available preserved
    expect(kit.schedule).toEqual({ days_available: 5, days: [] });
  });
});
