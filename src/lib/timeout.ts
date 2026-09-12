// A clock on every outbound request. Without this, a fetch to a host that
// accepts the connection but never responds hangs indefinitely — on serverless
// that silently eats the whole function budget and the generation job dies
// mid-run. AbortController turns "hang forever" into a fast, catchable failure,
// so callers degrade to honest-none instead of stalling the pipeline.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
