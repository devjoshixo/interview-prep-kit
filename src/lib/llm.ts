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

const DEFAULT_MODEL = "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Never echo the URL (it carries the key). Status + provider body is enough.
    const detail = await res.text().catch(() => "");
    throw new Error(`llm.complete: gemini responded ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("llm.complete: gemini returned no text");
  }
  return text;
};
