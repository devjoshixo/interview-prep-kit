// LLM client wrapper. The pipeline depends on this interface (LlmComplete),
// never on a specific provider — so steps unit-test with a fake, and the app can
// switch providers via env without touching pipeline code.
//
// Config (see .env.example):
//   LLM_PROVIDER  - "gemini" | "groq"
//   LLM_API_KEY   - key for the chosen provider
//   LLM_MODEL     - model id (provider default used if unset)

import { fetchWithTimeout } from "./timeout";

export type LlmComplete = (
  prompt: string,
  opts?: { schema?: unknown }
) => Promise<string>;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-3.6-flash",
  groq: "llama-3.3-70b-versatile",
};

// Transient failures worth retrying: rate limit, overload, gateway errors.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 5;
// A provider that rate-limits usually tells us how long to wait. Honour that
// instead of guessing — but never block a run for longer than this.
const RETRY_AFTER_CAP_MS = 20_000;

// Free tiers limit TOKENS per minute, not just requests, so a 429 here is normal
// rather than exceptional. Providers signal the wait either in a `retry-after`
// header or inside the error body ("Please try again in 2.265s"). Reading it is
// the difference between riding out the window and falling over on the first
// "slow down" — which is precisely how a pipeline loses a run.
export function retryAfterMs(res: Response, body: string): number | null {
  const header = res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
  }
  const match = body.match(/try again in\s+([\d.]+)\s*(ms|s)\b/i);
  if (match) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value)) {
      return Math.ceil(match[2].toLowerCase() === "ms" ? value : value * 1000);
    }
  }
  return null;
}
// A single provider call that never responds must not hang the job. On abort the
// fetch throws and is treated as a transient network error (retried below).
const LLM_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Exponential backoff with jitter: ~0.5s, 1s, 2s.
const backoffMs = (attempt: number) =>
  500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);

// Some models wrap JSON in a ```json fence — strip it before parsing.
function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1].trim() : t;
}

type ProviderCall = {
  url: string;
  init: RequestInit;
  extract: (json: unknown) => string | undefined;
};

// Gemini: native JSON mode; when a schema is given the provider enforces the shape.
function geminiCall(
  model: string,
  apiKey: string,
  prompt: string,
  opts?: { schema?: unknown }
): ProviderCall {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      ...(opts?.schema ? { responseSchema: opts.schema } : {}),
    },
  };
  return {
    url: `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    extract: (json) => {
      const j = json as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return j.candidates?.[0]?.content?.parts?.[0]?.text;
    },
  };
}

// Groq: OpenAI-compatible chat API. No enforced schema, so the schema is
// described in the prompt and the JSON is parsed defensively by each step.
function groqCall(
  model: string,
  apiKey: string,
  prompt: string,
  opts?: { schema?: unknown }
): ProviderCall {
  const schemaHint = opts?.schema
    ? `Respond with ONLY a single valid JSON value matching this JSON schema. No markdown, no commentary:\n${JSON.stringify(opts.schema)}`
    : "Respond with ONLY valid JSON. No markdown, no commentary.";
  const body = {
    model,
    messages: [
      { role: "system", content: "You output only valid JSON, no prose." },
      { role: "user", content: `${prompt}\n\n${schemaHint}` },
    ],
    temperature: 0.3,
  };
  return {
    url: GROQ_URL,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    extract: (json) => {
      const j = json as { choices?: { message?: { content?: string } }[] };
      const content = j.choices?.[0]?.message?.content;
      return typeof content === "string" ? stripFences(content) : undefined;
    },
  };
}

export const complete: LlmComplete = async (prompt, opts) => {
  const provider = process.env.LLM_PROVIDER ?? "";
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL[provider];

  if (provider !== "gemini" && provider !== "groq") {
    throw new Error(
      `llm.complete: unsupported LLM_PROVIDER "${provider}" (expected "gemini" or "groq")`
    );
  }
  if (!apiKey) throw new Error("llm.complete: LLM_API_KEY is not set");

  const call =
    provider === "gemini"
      ? geminiCall(model, apiKey, prompt, opts)
      : groqCall(model, apiKey, prompt, opts);

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(call.url, call.init, LLM_TIMEOUT_MS);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "network error";
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(
        `llm.complete: network error after ${attempt} attempts: ${lastError}`
      );
    }

    if (res.ok) {
      const data = await res.json();
      const text = call.extract(data);
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("llm.complete: provider returned no text");
      }
      return text;
    }

    // Never echo the request (it may carry the key). Status + body is enough.
    const detail = await res.text().catch(() => "");
    const transient =
      RETRYABLE_STATUS.has(res.status) || /overloaded|unavailable/i.test(detail);
    if (transient && attempt < MAX_ATTEMPTS) {
      lastError = `${res.status}`;
      // Prefer the provider's own stated wait; fall back to exponential backoff.
      // The small buffer avoids landing right on the boundary and 429ing again.
      const advised = retryAfterMs(res, detail);
      const wait =
        advised === null
          ? backoffMs(attempt)
          : Math.min(advised + 250, RETRY_AFTER_CAP_MS);
      await sleep(wait);
      continue;
    }
    throw new Error(`llm.complete: ${provider} responded ${res.status}: ${detail}`);
  }

  throw new Error(`llm.complete: exhausted ${MAX_ATTEMPTS} attempts: ${lastError}`);
};
