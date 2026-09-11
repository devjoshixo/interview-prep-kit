import { NextResponse } from "next/server";
import { makeKit } from "../../../core/pipeline";

// The pipeline uses node APIs (fetch, cheerio) — force the Node.js runtime.
export const runtime = "nodejs";
// Give the long generation room on platforms that honour it (local dev ignores it).
export const maxDuration = 90;

// POST /api/kits  { jd, company_url, days } -> { kit }
//
// NOTE: synchronous for now (waits for the whole pipeline). The designed
// production shape is a background job + poll with progress persisted in Mongo;
// that lands with persistence. This slice is for seeing the kit in a browser.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      jd?: unknown;
      company_url?: unknown;
      days?: unknown;
    };
    const jd = typeof body.jd === "string" ? body.jd : "";
    const company_url =
      typeof body.company_url === "string" ? body.company_url : "";
    const days = Number(body.days) > 0 ? Math.floor(Number(body.days)) : 5;

    if (!jd.trim()) {
      return NextResponse.json({ error: "jd is required" }, { status: 400 });
    }

    const kit = await makeKit({ jd, company_url, days });
    return NextResponse.json({ kit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
