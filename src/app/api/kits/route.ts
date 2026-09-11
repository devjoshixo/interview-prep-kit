import { NextResponse } from "next/server";
import { makeKit } from "../../../core/pipeline";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";

// The pipeline uses node APIs (fetch, cheerio) — force the Node.js runtime.
export const runtime = "nodejs";
// Give the long generation room on platforms that honour it (local dev ignores it).
export const maxDuration = 90;

// POST /api/kits  { jd, company_url, days } -> { id, kit }
//
// Runs the pipeline, saves the kit, and returns its id so the client can route
// to /kit/[id]. Synchronous for now; the designed production shape is a
// background job + poll (progress persisted in Mongo).
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

    await connectDB();
    const doc = await KitModel.create({ inputs: { jd, company_url, days }, kit });

    return NextResponse.json({ id: String(doc._id), kit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
