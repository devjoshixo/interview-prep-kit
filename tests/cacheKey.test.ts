import { describe, it, expect } from "vitest";
import { cacheKey, normalizeText, normalizeUrl } from "../src/core/cacheKey";
import type { CacheKeyInputs } from "../src/core/recording";

const base: CacheKeyInputs = {
  jd: "Senior Go Engineer\nYou will own the booking service.",
  companyUrl: "https://acme.com",
  days: 7,
  promptVersions: { readJd: "1", visitSite: "1", makeQuestions: "2" },
  model: "test-model",
};

const withJd = (jd: string): CacheKeyInputs => ({ ...base, jd });

// The three rules he set: the same job description typed on two machines, or
// pasted with stray whitespace, is ONE job description. If these miss, the cache
// misses too and we pay the model twice for a generation we already hold.
describe("the same JD written two ways hashes to one key", () => {
  it("ignores a trailing space", () => {
    expect(cacheKey(withJd("Senior Go Engineer "))).toBe(
      cacheKey(withJd("Senior Go Engineer"))
    );
  });

  it("ignores Windows line endings", () => {
    expect(cacheKey(withJd("line one\r\nline two"))).toBe(
      cacheKey(withJd("line one\nline two"))
    );
  });

  it("ignores repeated spaces and tabs", () => {
    expect(cacheKey(withJd("Senior  Go\t\tEngineer"))).toBe(
      cacheKey(withJd("Senior Go Engineer"))
    );
  });

  it("ignores leading and trailing blank lines", () => {
    expect(cacheKey(withJd("\n\n  Senior Go Engineer  \n\n"))).toBe(
      cacheKey(withJd("Senior Go Engineer"))
    );
  });
});

// The other half of the contract. A cache that over-merges is worse than no cache:
// it serves a kit built for a different posting.
describe("genuinely different inputs never share a key", () => {
  it("different JD text", () => {
    expect(cacheKey(withJd("Senior Go Engineer"))).not.toBe(
      cacheKey(withJd("Senior Rust Engineer"))
    );
  });

  it("different day counts", () => {
    expect(cacheKey({ ...base, days: 7 })).not.toBe(cacheKey({ ...base, days: 14 }));
  });

  it("different model", () => {
    expect(cacheKey({ ...base, model: "model-a" })).not.toBe(
      cacheKey({ ...base, model: "model-b" })
    );
  });

  // A bumped PROMPT_VERSION is the whole point of versioning the key: the old
  // generation came from a different prompt and must not be served as the new one.
  it("a bumped prompt version", () => {
    expect(cacheKey(base)).not.toBe(
      cacheKey({ ...base, promptVersions: { ...base.promptVersions, readJd: "2" } })
    );
  });

  // Fields are NUL-joined precisely so this cannot collide: without a separator,
  // moving a character across a field boundary would produce the same string.
  it("the same characters split differently across fields", () => {
    expect(cacheKey({ ...base, jd: "ab", companyUrl: "c.com" })).not.toBe(
      cacheKey({ ...base, jd: "abc", companyUrl: ".com" })
    );
  });
});

// Object key order is an accident of how the caller built the record. If it leaked
// into the hash, the same versions would hash two ways and the cache would miss
// for no reason a human could ever see.
describe("prompt version ordering is not part of the key", () => {
  it("same versions, different insertion order", () => {
    const a = cacheKey({ ...base, promptVersions: { a: "1", b: "2", c: "3" } });
    const b = cacheKey({ ...base, promptVersions: { c: "3", a: "1", b: "2" } });
    expect(a).toBe(b);
  });
});

describe("URL normalisation", () => {
  it("treats scheme, www, host case and trailing slash as noise", () => {
    const forms = [
      "https://www.Acme.com/",
      "http://acme.com",
      "acme.com",
      "  https://ACME.com  ",
    ];
    const keys = forms.map((companyUrl) => cacheKey({ ...base, companyUrl }));
    expect(new Set(keys).size).toBe(1);
  });

  // A route is not a different company. `visitSite` drops the path as well, so a
  // deep link and a bare host produce the same crawl AND the same key.
  it("collapses any route to the company itself", () => {
    expect(normalizeUrl("acme.com/contact")).toBe(normalizeUrl("acme.com"));
    expect(cacheKey({ ...base, companyUrl: "https://www.acme.com/careers?x=1" })).toBe(
      cacheKey({ ...base, companyUrl: "acme.com" })
    );
  });

  it("keeps different companies apart", () => {
    expect(normalizeUrl("acme.com")).not.toBe(normalizeUrl("othercorp.com"));
  });

  // Not merged: a subdomain can be a genuinely different site.
  it("keeps subdomains apart from the apex", () => {
    expect(normalizeUrl("careers.acme.com")).not.toBe(normalizeUrl("acme.com"));
  });

  it("leaves an unparseable value stable rather than throwing", () => {
    expect(() => normalizeUrl("::::")).not.toThrow();
    expect(normalizeUrl("::::")).toBe(normalizeUrl("::::"));
  });
});

// Deliberate non-rule, recorded as a test so a later "improvement" has to argue
// with it: shouting at a model is not the same prompt as not shouting at it.
describe("case is NOT normalised away", () => {
  it("keeps differently-cased JDs apart", () => {
    expect(cacheKey(withJd("SENIOR GO ENGINEER"))).not.toBe(
      cacheKey(withJd("Senior Go Engineer"))
    );
  });
});

describe("key shape", () => {
  it("is a stable 64-char sha256 hex digest", () => {
    const k = cacheKey(base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey(base)).toBe(k);
  });

  it("normalizeText is idempotent", () => {
    const once = normalizeText("a  b\r\nc  \n");
    expect(normalizeText(once)).toBe(once);
  });
});
