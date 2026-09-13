import { describe, it, expect } from "vitest";
import { retryAfterMs } from "../src/lib/llm";

function resWith(headers: Record<string, string> = {}): Response {
  return new Response("", { headers });
}

describe("retryAfterMs (free tiers limit TOKENS per minute — honour the stated wait)", () => {
  it("reads a retry-after header in seconds", () => {
    expect(retryAfterMs(resWith({ "retry-after": "3" }), "")).toBe(3000);
  });

  it("parses the wait out of the error body when there's no header", () => {
    // the exact shape Groq returns on a TPM limit
    const body = JSON.stringify({
      error: {
        message:
          "Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7025, Requested 1277. Please try again in 2.265s.",
        type: "tokens",
        code: "rate_limit_exceeded",
      },
    });
    expect(retryAfterMs(resWith(), body)).toBe(2265);
  });

  it("handles a millisecond wait", () => {
    expect(retryAfterMs(resWith(), "Please try again in 800ms")).toBe(800);
  });

  it("prefers the header over the body", () => {
    expect(retryAfterMs(resWith({ "retry-after": "5" }), "try again in 99s")).toBe(5000);
  });

  it("returns null when nothing is advised, so the caller backs off normally", () => {
    expect(retryAfterMs(resWith(), "internal server error")).toBeNull();
    expect(retryAfterMs(resWith({ "retry-after": "soon" }), "")).toBeNull();
  });
});
