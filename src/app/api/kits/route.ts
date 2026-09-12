import { NextResponse, after } from "next/server";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";
import { currentUserId } from "../../../lib/auth";
import { runGeneration } from "../../../lib/generate";

export const runtime = "nodejs";
// With Fluid Compute enabled, Hobby allows up to 300s. A generation is ~18-30s;
// this headroom means a slow-but-healthy run finishes instead of being killed.
// Every outbound call is independently timed out (see src/lib/timeout.ts) so a
// hung upstream can't consume this budget, and a watchdog (GET /api/kits/[id])
// reconciles any job that still dies mid-run.
export const maxDuration = 300;

// POST /api/kits  { jd, company_url, days } -> { id }
// Creates a generating job and returns immediately; the client polls /api/kits/[id].
export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

    const body = (await req.json()) as { jd?: unknown; company_url?: unknown; days?: unknown };
    const jd = typeof body.jd === "string" ? body.jd : "";
    const company_url = typeof body.company_url === "string" ? body.company_url : "";
    const days = Number(body.days) > 0 ? Math.floor(Number(body.days)) : 5;
    if (!jd.trim()) return NextResponse.json({ error: "jd is required" }, { status: 400 });

    await connectDB();
    const doc = await KitModel.create({
      userId,
      status: "generating",
      progress: { step: 0, label: "Starting" },
      inputs: { jd, company_url, days },
      kit: {},
    });
    const id = String(doc._id);

    // Run the pipeline after the response is sent. `after` keeps the function
    // alive to finish (works on serverless within maxDuration AND on long-running
    // hosts), so the response returns instantly while generation continues.
    after(() => runGeneration(id, { jd, company_url, days }));

    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
