// Web search via Tavily. Behind this interface (WebSearch) so step 3 can be
// unit-tested with canned results instead of a live API call.

export type WebResult = { title: string; url: string; snippet: string };
export type WebSearch = (query: string) => Promise<WebResult[]>;

const TAVILY_URL = "https://api.tavily.com/search";
const MAX_RESULTS = 3;

function asString(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

type TavilyRaw = { results?: { title?: unknown; url?: unknown; content?: unknown }[] };

// Real implementation. Returns [] on any failure or missing key — the pipeline
// treats "no web results" as honest-none, never a crash.
export const tavilySearch: WebSearch = async (query) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query.trim()) return [];
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: MAX_RESULTS,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as TavilyRaw;
    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .map((r) => ({
        title: asString(r.title),
        url: asString(r.url),
        snippet: asString(r.content),
      }))
      .filter((r) => r.url);
  } catch {
    return [];
  }
};
