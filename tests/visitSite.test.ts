import { describe, it, expect } from "vitest";
import {
  rankLinks,
  extractLinks,
  extractText,
  visitSite,
  normalizeCompanyUrl,
} from "../src/core/steps/visitSite";
import type { LlmComplete } from "../src/lib/llm";
import type { FetchPage } from "../src/lib/http";

describe("rankLinks (which pages are worth fetching)", () => {
  const base = "https://acme.com";

  it("ranks by keyword weight, drops zero-score and off-domain links", () => {
    const hrefs = [
      "/about", // 5
      "/careers", // 3
      "/blog", // 1
      "/pricing", // 0 -> dropped
      "https://twitter.com/acme", // off-domain -> dropped
      "mailto:hi@acme.com", // not http -> dropped
      "#top", // fragment of home -> dropped
    ];
    expect(rankLinks(base, hrefs)).toEqual([
      "https://acme.com/about",
      "https://acme.com/careers",
      "https://acme.com/blog",
    ]);
  });

  it("resolves relative links, dedupes, and excludes the homepage itself", () => {
    const hrefs = ["/about", "/about/", "https://acme.com/about", "/", base];
    expect(rankLinks(base, hrefs)).toEqual(["https://acme.com/about"]);
  });

  it("caps the number of ranked pages", () => {
    const hrefs = ["/about", "/mission", "/product", "/team", "/careers"];
    expect(rankLinks(base, hrefs, 2)).toHaveLength(2);
  });
});

describe("extractLinks / extractText", () => {
  it("pulls hrefs out of anchors", () => {
    expect(extractLinks('<a href="/a">A</a><a href="/b">B</a>')).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("strips scripts/styles/nav and collapses whitespace", () => {
    const html =
      "<html><head><style>x{color:red}</style></head><body>" +
      "<nav>menu</nav><h1>Acme</h1><p>We build   payments   infra.</p>" +
      "<script>evil()</script></body></html>";
    const text = extractText(html);
    expect(text).toContain("Acme");
    expect(text).toContain("We build payments infra.");
    expect(text).not.toContain("evil()");
    expect(text).not.toContain("color:red");
  });

  it("caps the text length", () => {
    const html = `<body>${"a".repeat(10000)}</body>`;
    expect(extractText(html, 100)).toHaveLength(100);
  });
});

describe("visitSite (orchestration, with injected fake fetch + LLM)", () => {
  it("honest-none: returns an empty brief when the homepage cannot be fetched", async () => {
    const fetchPage: FetchPage = async () => null;
    const llm: LlmComplete = async () => {
      throw new Error("LLM must not be called when there is nothing to summarize");
    };
    const res = await visitSite("https://acme.com", { fetchPage, llm });
    expect(res.pages_used).toEqual([]);
    expect(res.brief).toEqual({ summary: "", what_they_do: "", sources: [] });
  });

  it("fetches homepage + a ranked page and briefs from the text it actually read", async () => {
    const pages: Record<string, string> = {
      "https://acme.com": '<a href="/about">About</a><p>home</p>',
      "https://acme.com/about": "<p>Acme builds payment rails for banks.</p>",
    };
    const fetchPage: FetchPage = async (u) => pages[u] ?? null;
    const llm: LlmComplete = async () =>
      JSON.stringify({
        summary: "Acme, a payments company.",
        what_they_do: "Payment rails for banks.",
      });

    const res = await visitSite("https://acme.com", { fetchPage, llm });
    expect(res.pages_used).toEqual([
      "https://acme.com",
      "https://acme.com/about",
    ]);
    expect(res.brief.what_they_do).toBe("Payment rails for banks.");
    // sources are exactly the pages we read — no fabricated citations
    expect(res.brief.sources).toEqual(res.pages_used);
  });

  it("honest-none on unparsable LLM output, but still reports the pages read", async () => {
    const fetchPage: FetchPage = async () => "<body>some readable company text</body>";
    const llm: LlmComplete = async () => "not json";
    const res = await visitSite("https://acme.com", { fetchPage, llm });
    expect(res.brief.summary).toBe("");
    expect(res.brief.what_they_do).toBe("");
    expect(res.pages_used).toEqual(["https://acme.com"]);
  });
});

describe("normalizeCompanyUrl (M1 — a scheme-less URL must not silently break the brief)", () => {
  it("prepends https:// when there is no scheme", () => {
    expect(normalizeCompanyUrl("acme.com")).toBe("https://acme.com");
    expect(normalizeCompanyUrl("www.acme.com")).toBe("https://www.acme.com");
  });

  it("leaves an existing http(s) scheme untouched", () => {
    expect(normalizeCompanyUrl("https://acme.com")).toBe("https://acme.com");
    expect(normalizeCompanyUrl("http://acme.com")).toBe("http://acme.com");
  });

  it("trims, and returns empty for blank input (honest-none, no fake URL)", () => {
    expect(normalizeCompanyUrl("  acme.com ")).toBe("https://acme.com");
    expect(normalizeCompanyUrl("")).toBe("");
    expect(normalizeCompanyUrl("   ")).toBe("");
  });
});

describe("visitSite normalizes a scheme-less URL before fetching (M1)", () => {
  it("fetches https://acme.com when given bare 'acme.com'", async () => {
    const html: Record<string, string> = {
      "https://acme.com": "<body>Acme builds payment rails.</body>",
    };
    const fetchPage: FetchPage = async (u) => html[u] ?? null;
    const llm: LlmComplete = async () =>
      JSON.stringify({ summary: "Acme.", what_they_do: "Payments." });
    const res = await visitSite("acme.com", { fetchPage, llm });
    expect(res.pages_used).toEqual(["https://acme.com"]);
    expect(res.brief.what_they_do).toBe("Payments.");
  });
});
