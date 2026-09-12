// The background generation job, shared by POST /api/kits (first run) and
// POST /api/kits/[id]/retry (self-heal). Kept out of the route files so both
// entry points run the exact same pipeline and persistence logic.

import { makeKit } from "../core/pipeline";
import { KitModel } from "../models/kit";

export type GenerationInput = { jd: string; company_url: string; days: number };

// Runs the pipeline, persisting progress each step, then marks the job ready
// (or failed). Fire-and-forget via the route's `after(...)`; every outbound call
// is independently timed out (src/lib/timeout.ts) so a hung upstream can't stall
// the run past the function budget.
export async function runGeneration(id: string, input: GenerationInput): Promise<void> {
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
