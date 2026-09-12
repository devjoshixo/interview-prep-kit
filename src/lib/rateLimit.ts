// Lightweight in-memory rate limiter (fixed window). Guards brute-forcing on auth
// and abuse of the expensive generation endpoint.
//
// Scope note: state lives in process memory, so on a multi-instance serverless
// deployment the limit is enforced PER INSTANCE, not globally. With Fluid Compute
// (instances are reused and handle concurrent requests) this is meaningfully
// effective as a first line of defense; a globally exact limit would back this
// with a shared store (e.g. Upstash Redis). See README "Trade-offs".

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateResult = { ok: boolean; remaining: number; retryAfterMs: number };

// Records one hit against `key`. Returns ok:false (without counting the hit) once
// `limit` hits have occurred within `windowMs`. `now` is injectable for testing.
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateResult {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: b.resetAt - now };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterMs: 0 };
}

// Best-effort client identifier from proxy headers (Vercel sets x-forwarded-for).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Test-only: clear all buckets between cases.
export function __resetRateLimits(): void {
  buckets.clear();
}
