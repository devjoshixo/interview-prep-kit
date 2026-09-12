// HTTP page fetcher. Kept behind this interface (FetchPage) so steps that read
// the web can be unit-tested with canned HTML instead of live network.

import { fetchWithTimeout } from "./timeout";

export type FetchPage = (url: string) => Promise<string | null>;

// A site that connects but never responds must not stall the generation job.
const PAGE_TIMEOUT_MS = 8_000;

// Real implementation. Returns HTML text, or null on any failure / non-HTML —
// callers treat null as "this page gave us nothing" (honest-none), never a crash.
// A timeout aborts the fetch and lands in the catch below, i.e. honest-none.
export const fetchPage: FetchPage = async (url) => {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: { "user-agent": "interview-prep-kit/0.1 (research bot)" },
        redirect: "follow",
      },
      PAGE_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
};
