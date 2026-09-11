// LLM client wrapper. The pipeline depends on this interface (LlmComplete),
// never on a specific provider/SDK — so steps can be unit-tested with a fake.
//
// Provider config comes from the environment (see .env.example):
//   LLM_PROVIDER  - currently "gemini"
//   LLM_API_KEY   - key for the provider
//   LLM_MODEL     - model id (default: gemini-2.0-flash)

// A step calls the LLM through exactly this shape. Pass a fake in tests.
export type LlmComplete = (
  prompt: string,
  opts?: { schema?: unknown }
) => Promise<string>;

const DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Transient failures worth retrying: rate limit, overload, gateway errors.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Exponential backoff with jitter: ~0.5s, 1s, 2s between attempts.
const backoffMs = (attempt: number) =>
  500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

// Real implementation. Returns the model's raw text — JSON text when a schema
// is given, because the caller asked the model to fill a form.
export const complete: LlmComplete = async (prompt, opts) => {
  const provider = process.env.LLM_PROVIDER;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  if (provider !== "gemini") {
    throw new Error(
      `llm.complete: unsupported LLM_PROVIDER "${provider ?? ""}" (expected "gemini")`
    );
  }
  if (!apiKey) {
    throw new Error("llm.complete: LLM_API_KEY is not set");
  }

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      // JSON mode: the model must return a single JSON value. When a schema is
      // supplied, the shape of the "form" is enforced by the provider.
      responseMimeType: "application/json",
      ...(opts?.schema ? { responseSchema: opts.schema } : {}),
    },
  };

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Network-level failure — retry unless we're out of attempts.
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
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("llm.complete: gemini returned no text");
      }
      return text;
    }

    // Never echo the URL (it carries the key). Status + provider body is enough.
    const detail = await res.text().catch(() => "");
    const transient =
      RETRYABLE_STATUS.has(res.status) || /overloaded|unavailable/i.test(detail);
    if (transient && attempt < MAX_ATTEMPTS) {
      lastError = `${res.status}`;
      await sleep(backoffMs(attempt));
      continue; // e.g. 503 "model is overloaded" — back off and try again
    }
    throw new Error(`llm.complete: gemini responded ${res.status}: ${detail}`);
  }

  throw new Error(`llm.complete: exhausted ${MAX_ATTEMPTS} attempts: ${lastError}`);
};
