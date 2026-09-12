import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { fetchWithTimeout } from "../src/lib/timeout";
import { fetchPage } from "../src/lib/http";
import { makeKit } from "../src/core/pipeline";
import type { LlmComplete } from "../src/lib/llm";
import type { WebSearch } from "../src/lib/tavily";

// Track every server we start so a failed assertion can't leak an open port.
const started: Server[] = [];

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    const s = createServer(handler);
    started.push(s);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}/`);
    });
  });
}

// A server that accepts the connection but NEVER responds — exactly the failure
// we were hitting: a company site that hangs and, without a timeout, stalls the
// generation job until the whole function budget is consumed.
const hangingServer = () => listen(() => {});

afterEach(() => {
  for (const s of started.splice(0)) s.close();
});

describe("fetchWithTimeout (the mechanism)", () => {
  it("aborts a request that never responds, within the timeout", async () => {
    const url = await hangingServer();
    const start = Date.now();
    await expect(fetchWithTimeout(url, {}, 200)).rejects.toThrow();
    const elapsed = Date.now() - start;
    // Aborted at ~200ms; without the timeout this would never resolve.
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns the response normally when the server answers in time", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>ok</html>");
    });
    const res = await fetchWithTimeout(url, {}, 2000);
    expect(res.ok).toBe(true);
  });
});

describe("fetchPage SSRF guard (refuses private / loopback hosts)", () => {
  it("returns null immediately for a loopback host, without fetching it", async () => {
    const url = await hangingServer(); // bound to 127.0.0.1 — a blocked range
    const start = Date.now();
    const html = await fetchPage(url);
    const elapsed = Date.now() - start;
    expect(html).toBeNull(); // refused → honest-none, no crash
    // Blocked by the SSRF guard before the 8s fetch even starts — a loopback URL
    // (or cloud-metadata / private LAN) can never be reached from the server.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("full generation with an unreachable company site (the failure, at job level)", () => {
  it("completes in bounded time with an honest-none brief instead of stalling", async () => {
    const hungUrl = await hangingServer(); // loopback — refused by the SSRF guard
    // Minimal fake LLM: real role from step 1, then "[]" for every later call —
    // isolates the test to the site hang, no tokens spent, deterministic.
    const STEP1 = JSON.stringify({
      company: "Acme",
      role_title: "Backend Engineer",
      location: "Remote",
      seniority: "mid",
      responsibilities: ["design services"],
      requirements: [{ text: "Go", kind: "technical", evidence: "strong Go experience" }],
    });
    const queue = [STEP1];
    const llm: LlmComplete = async () => queue.shift() ?? "[]";
    const search: WebSearch = async () => [];

    const start = Date.now();
    const kit = await makeKit(
      { jd: "We need strong Go experience.", company_url: hungUrl, days: 5 },
      { llm, fetchPage, search } // real fetchPage refuses the loopback host -> honest-none
    );
    const elapsed = Date.now() - start;

    // The whole job returned — it did NOT hang until a platform kill.
    expect(elapsed).toBeLessThan(12000);
    // The site hung, so the brief is honest-none; the rest of the kit still built.
    expect(kit.company_brief.what_they_do).toBe("");
    expect(kit.source.pages_used).toEqual([]);
    expect(kit.role.requirements.map((r) => r.text)).toEqual(["Go"]);
  }, 15000);
});
