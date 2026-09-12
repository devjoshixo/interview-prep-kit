import { NextResponse, after } from "next/server";
import { makeKit } from "../../../core/pipeline";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";
import { currentUserId } from "../../../lib/auth";

export const runtime = "nodejs";
// Vercel Hobby caps serverless functions at 60s; a Groq generation is ~18s.
export const maxDuration = 60;

type Input = { jd: string; company_url: string; days: number };

// Runs the pipeline in the background, persisting progress each step, then marks
// the job ready (or failed). Fire-and-forget on a long-running server.
async function runGeneration(id: string, input: Input): Promise<void> {
  const t0 = Date.now();
  const steps: { step: number; label: string; ms: number }[] = [];
  const starts: { step: number; label: string; t: number }[] = [];
  try {
    const kit = await makeKit(input, {
      onProgress: async (step, label) => {
        const now = Date.now();
        const prev = starts[starts.length - 1];
        if (prev) steps.push({ step: prev.step, label: prev.label, ms: now - prev.t });
        starts.push({ step, label, t: now });
        await KitModel.updateOne({ _id: id }, { $set: { progress: { step, label } } });
      },
    });
    const finalPrev = starts[starts.length - 1];
    if (finalPrev) steps.push({ step: finalPrev.step, label: finalPrev.label, ms: Date.now() - finalPrev.t });
    const report = {
      durationMs: Date.now() - t0,
      steps,
      provider: process.env.LLM_PROVIDER,
      model: process.env.LLM_MODEL,
    };
    await KitModel.updateOne(
      { _id: id },
      { $set: { kit, status: "ready", progress: { step: 8, label: "Ready" }, report } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    await KitModel.updateOne({ _id: id }, { $set: { status: "failed", error: message } });
  }
}

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
