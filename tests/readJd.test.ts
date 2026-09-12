import { describe, it, expect } from "vitest";
import {
  groundRequirements,
  derivePriority,
  normalize,
  readJd,
} from "../src/core/steps/readJd";
import type { LlmComplete } from "../src/lib/llm";

const JD =
  "We need strong Go experience and hands-on Kubernetes. " +
  "Nice to have: GraphQL. You will design services and mentor juniors.";

describe("groundRequirements (the code that catches LLM hallucinations)", () => {
  it("keeps a requirement whose evidence is in the JD", () => {
    const kept = groundRequirements(JD, [
      { text: "Go experience", kind: "technical", evidence: "strong Go experience" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("req-1");
    expect(kept[0].text).toBe("Go experience");
  });

  it("DROPS an invented requirement whose evidence is not in the JD", () => {
    const kept = groundRequirements(JD, [
      { text: "Rust", kind: "technical", evidence: "must have 5 years of Rust" },
    ]);
    expect(kept).toHaveLength(0);
  });

  it("keeps grounded, drops invented in one batch, re-indexing ids contiguously", () => {
    const kept = groundRequirements(JD, [
      { text: "Go", kind: "technical", evidence: "strong Go experience" },
      { text: "Rust", kind: "technical", evidence: "5 years of Rust" }, // invented
      { text: "Kubernetes", kind: "technical", evidence: "hands-on Kubernetes" },
    ]);
    expect(kept.map((k) => k.text)).toEqual(["Go", "Kubernetes"]);
    expect(kept.map((k) => k.id)).toEqual(["req-1", "req-2"]); // no gap from the drop
  });

  it("tolerates whitespace and casing drift in the evidence quote", () => {
    const kept = groundRequirements(JD, [
      { text: "Go", kind: "technical", evidence: "Strong   GO   Experience" },
    ]);
    expect(kept).toHaveLength(1);
  });

  it("coerces an unknown kind to a valid enum value", () => {
    const kept = groundRequirements(JD, [
      { text: "Go", kind: "wizardry", evidence: "strong Go experience" },
    ]);
    expect(kept[0].kind).toBe("technical");
  });

  it("skips a malformed box that is missing text or evidence", () => {
    const kept = groundRequirements(JD, [
      { kind: "technical", evidence: "strong Go experience" }, // no text
      { text: "Kubernetes", kind: "technical" }, // no evidence
    ]);
    expect(kept).toHaveLength(0);
  });
});

describe("derivePriority (code decides must/nice from wording)", () => {
  it("marks nice-to-have wording as nice", () => {
    expect(derivePriority("GraphQL is a plus")).toBe("nice");
    expect(derivePriority("Nice to have: Terraform")).toBe("nice");
  });
  it("defaults to must", () => {
    expect(derivePriority("5 years of Go")).toBe("must");
  });
});

describe("normalize", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalize("  Strong   GO ")).toBe("strong go");
  });
});

describe("readJd end-to-end with an injected fake LLM (no network)", () => {
  it("parses the form and drops the hallucinated requirement", async () => {
    const fakeLlm: LlmComplete = async () =>
      JSON.stringify({
        company: "Acme",
        role_title: "Backend Engineer",
        location: "Remote",
        seniority: "mid",
        responsibilities: ["design services", "mentor juniors"],
        requirements: [
          { text: "Go", kind: "technical", evidence: "strong Go experience" },
          { text: "Rust", kind: "technical", evidence: "hallucinated, not in jd" },
        ],
      });

    const out = await readJd(JD, fakeLlm);
    expect(out.company).toBe("Acme");
    expect(out.role_title).toBe("Backend Engineer");
    expect(out.requirements.map((r) => r.text)).toEqual(["Go"]);
    expect(out.requirements[0].priority).toBe("must");
  });

  it("throws a clear error when the LLM returns non-JSON", async () => {
    const badLlm: LlmComplete = async () => "sorry, I cannot do that";
    await expect(readJd(JD, badLlm)).rejects.toThrow(/valid JSON/);
  });
});

describe("priority is derived from the JD evidence, not just the paraphrase (M2)", () => {
  it("marks a requirement 'nice' when only the verbatim evidence carries the signal", () => {
    const jd = "Backend role. GraphQL preferred but not required.";
    // The model paraphrased the "preferred" wording out of `text`, but the
    // verbatim `evidence` still carries it — so priority must read both.
    const kept = groundRequirements(jd, [
      { text: "GraphQL", kind: "technical", evidence: "GraphQL preferred but not required" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].priority).toBe("nice");
  });

  it("still defaults a plain requirement to 'must'", () => {
    const jd = "You must have strong Go experience.";
    const kept = groundRequirements(jd, [
      { text: "Go", kind: "technical", evidence: "strong Go experience" },
    ]);
    expect(kept[0].priority).toBe("must");
  });
});
