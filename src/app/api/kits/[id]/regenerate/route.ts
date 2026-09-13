import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db";
import { KitModel } from "../../../../../models/kit";
import { complete } from "../../../../../lib/llm";
import { partition, mergeSection, reconcileFresh, type StatusMap } from "../../../../../core/regenerate";
import {
  regenerateQuestions,
  regenerateFlashcards,
} from "../../../../../core/steps/regenerateSection";
import { findUncovered } from "../../../../../core/coverage";
import { allocateSchedule } from "../../../../../core/schedule";
import { currentUserId } from "../../../../../lib/auth";
import type { Kit, Question, Flashcard } from "../../../../../core/types";

export const runtime = "nodejs";
// Regenerate is a single grounded LLM call; with Fluid Compute enabled Hobby
// allows up to 300s, and the LLM call is itself timed out (src/lib/timeout.ts).
export const maxDuration = 300;

const conflict = () =>
  NextResponse.json({ error: "This kit changed elsewhere.", conflict: true }, { status: 409 });

// POST /api/kits/[id]/regenerate  { section, version }
//
// Replaces ONLY pristine items, keeps edited/user-created ones, avoids deleted.
// Persisted via compare-and-swap on version so a concurrent edit can't be lost.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { section, version } = (await req.json()) as {
      section?: "questions" | "flashcards";
      version?: number;
    };
    if (section !== "questions" && section !== "flashcards") {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }

    const uid = await currentUserId();
    if (!uid) return NextResponse.json({ error: "sign in required" }, { status: 401 });

    await connectDB();
    const doc = await KitModel.findById(id).catch(() => null);
    if (!doc || String(doc.userId) !== uid) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const current = doc.version ?? 0;
    if (typeof version === "number" && version !== current) return conflict();

    const kit = doc.kit as Kit;
    const editState = (doc.editState ?? {}) as Record<string, StatusMap>;
    const tombstones = (doc.tombstones ?? {}) as Record<string, string[]>;
    const status = editState[section] ?? {};
    const avoid = tombstones[section] ?? [];
    const requirements = kit.role.requirements;

    if (section === "questions") {
      const { locked, pristine } = partition(kit.questions, status);
      const keep = locked.map((l) => l.item.prompt);
      const fresh = await regenerateQuestions(requirements, keep, avoid, pristine.length, complete);
      // Never let a short/empty LLM result silently shrink the section.
      const merged = mergeSection<Question>(locked, reconcileFresh(fresh, pristine), "q");
      kit.questions = merged.items;
      kit.coverage.uncovered_requirement_ids = findUncovered(requirements, kit.questions);
      const mustIds = new Set(
        requirements.filter((r) => r.priority === "must").map((r) => r.id)
      );
      kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available, mustIds);
      editState[section] = merged.status;
    } else {
      const { locked, pristine } = partition(kit.flashcards, status);
      const keep = locked.map((l) => l.item.front);
      const fresh = await regenerateFlashcards(requirements, keep, avoid, pristine.length, complete);
      const merged = mergeSection<Flashcard>(locked, reconcileFresh(fresh, pristine), "fc");
      kit.flashcards = merged.items;
      editState[section] = merged.status;
    }

    // Compare-and-swap: the long LLM call ran on a snapshot; only commit if the
    // stored version is still the one we started from.
    const res = await KitModel.updateOne(
      { _id: id, userId: uid, version: current },
      { $set: { kit, editState }, $inc: { version: 1 } }
    );
    if (res.matchedCount === 0) return conflict();

    return NextResponse.json({ kit, editState, version: current + 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
