import { NextResponse, after } from "next/server";
import { connectDB } from "../../../../../lib/db";
import { KitModel } from "../../../../../models/kit";
import { currentUserId } from "../../../../../lib/auth";
import { runGeneration } from "../../../../../lib/generate";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/kits/[id]/retry -> { ok: true } | { ok: false, reason }
//
// Re-runs generation on an existing failed job, reusing its stored inputs. The
// flip to "generating" is guarded on status:"failed" so two concurrent retries
// (e.g. an auto-retry racing a manual one) can't both launch the pipeline.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const uid = await currentUserId();
    if (!uid) return NextResponse.json({ error: "sign in required" }, { status: 401 });

    await connectDB();
    const doc = await KitModel.findById(id).catch(() => null);
    if (!doc || String(doc.userId) !== uid) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (doc.status !== "failed") {
      // Nothing to retry (already generating or ready) — treat as a no-op win.
      return NextResponse.json({ ok: false, reason: "not in a failed state" });
    }

    const reset = await KitModel.updateOne(
      { _id: id, userId: uid, status: "failed" },
      { $set: { status: "generating", progress: { step: 0, label: "Starting" }, error: null } }
    );
    if (reset.matchedCount === 0 || reset.modifiedCount === 0) {
      // Someone else already retried it between our read and write.
      return NextResponse.json({ ok: false, reason: "already retrying" });
    }

    const inputs = doc.inputs as { jd: string; company_url: string; days: number };
    after(() => runGeneration(id, inputs));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
