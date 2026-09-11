import { NextResponse } from "next/server";
import { makeKit } from "../../../core/pipeline";
import { connectDB } from "../../../lib/db";
import { KitModel } from "../../../models/kit";
import { currentUserId } from "../../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

type Input = { jd: string; company_url: string; days: number };

// Runs the pipeline in the background, persisting progress each step, then marks
// the job ready (or failed). Fire-and-forget on a long-running server.
async function runGeneration(id: string, input: Input): Promise<void> {
  try {
    const kit = await makeKit(input, {
      onProgress: async (step, label) => {
        await KitModel.updateOne({ _id: id }, { $set: { progress: { step, label } } });
      },
    });
    await KitModel.updateOne(
      { _id: id },
      { $set: { kit, status: "ready", progress: { step: 8, label: "Ready" } } }
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

    void runGeneration(id, { jd, company_url, days });

    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
