// HTTP page fetcher. Kept behind this interface (FetchPage) so steps that read
// the web can be unit-tested with canned HTML instead of live network.

import { fetchWithTimeout } from "./timeout";
import { isHostBlocked } from "./ssrf";

export type FetchPage = (url: string) => Promise<string | null>;

// A site that connects but never responds must not stall the generation job.
const PAGE_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;

// Real implementation. Returns HTML text, or null on any failure / non-HTML —
// callers treat null as "this page gave us nothing" (honest-none), never a crash.
//
// Two guards on the user-supplied URL:
//   - timeout: a hung server can't stall the job (see timeout.ts);
//   - SSRF: the host must not resolve to a private/loopback/link-local range,
//     re-checked on every redirect hop (redirects are followed MANUALLY so a
//     public URL can't bounce us to an internal one).
export const fetchPage: FetchPage = async (url) => {
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        return null;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      // Reject private/loopback targets IN PRODUCTION only. The batch entry point
      // is run against company sites that may be served from a local address, so
      // blocking those outside production would break legitimate evaluation runs.
      if (process.env.NODE_ENV === "production" && (await isHostBlocked(parsed.hostname))) {
        return null;
      }

      const res = await fetchWithTimeout(
        current,
        {
          headers: { "user-agent": "interview-prep-kit/0.1 (research bot)" },
          redirect: "manual",
        },
        PAGE_TIMEOUT_MS
      );

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString(); // resolve + re-validate next loop
        continue;
      }

      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return null;
      return await res.text();
    }
    return null; // too many redirects
  } catch {
    return null;
  }
};
