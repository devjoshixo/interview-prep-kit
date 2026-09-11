// HTTP page fetcher. Kept behind this interface (FetchPage) so steps that read
// the web can be unit-tested with canned HTML instead of live network.

export type FetchPage = (url: string) => Promise<string | null>;

// Real implementation. Returns HTML text, or null on any failure / non-HTML —
// callers treat null as "this page gave us nothing" (honest-none), never a crash.
export const fetchPage: FetchPage = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "interview-prep-kit/0.1 (research bot)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
};
