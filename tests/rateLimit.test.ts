import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, clientIp, __resetRateLimits } from "../src/lib/rateLimit";

beforeEach(() => __resetRateLimits());

describe("rateLimit (fixed window)", () => {
  it("allows up to the limit, then blocks", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit("k", 3, 60_000, t).ok).toBe(true);
    }
    const blocked = rateLimit("k", 3, 60_000, t);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t = 2_000_000;
    rateLimit("k", 1, 10_000, t);
    expect(rateLimit("k", 1, 10_000, t).ok).toBe(false); // still in window
    expect(rateLimit("k", 1, 10_000, t + 10_001).ok).toBe(true); // window passed
  });

  it("tracks keys independently", () => {
    const t = 3_000_000;
    expect(rateLimit("a", 1, 60_000, t).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000, t).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000, t).ok).toBe(true); // different key, own budget
  });

  it("reports remaining budget", () => {
    const t = 4_000_000;
    expect(rateLimit("k", 5, 60_000, t).remaining).toBe(4);
    expect(rateLimit("k", 5, 60_000, t).remaining).toBe(3);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to 'unknown' when no proxy headers are present", () => {
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
