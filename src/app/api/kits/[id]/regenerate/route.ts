import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db";
import { KitModel } from "../../../../../models/kit";
import { complete } from "../../../../../lib/llm";
import {
  partition,
  mergeSection,
  mergeScoped,
  reconcileFresh,
  type StatusMap,
} from "../../../../../core/regenerate";
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

const QUESTION_CATEGORIES = new Set<Question["category"]>([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);

const conflict = () =>
  NextResponse.json({ error: "This kit changed elsewhere.", conflict: true }, { status: 409 });

// POST /api/kits/[id]/regenerate  { section, version }
//
// Replaces ONLY pristine items, keeps edited/user-created ones, avoids deleted.
// Persisted via compare-and-swap on version so a concurrent edit can't be lost.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { section, version, category } = (await req.json()) as {
      section?: "questions" | "flashcards" | "schedule";
      version?: number;
      category?: Question["category"];
    };
    if (section !== "questions" && section !== "flashcards" && section !== "schedule") {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }
    if (category !== undefined && !QUESTION_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
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
    const statusKey = section === "schedule" ? "questions" : section;
    const status = editState[statusKey] ?? {};
    const avoid = tombstones[statusKey] ?? [];
    const requirements = kit.role.requirements;
    const mustIds = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));

    if (section === "schedule") {
      // The schedule is deterministic — "regenerating" it is a recompute from the
      // current questions, not an LLM call.
      kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available, mustIds);
    } else if (section === "questions") {
      // Scope to one category when asked, so regenerating "system-design" leaves
      // every other category untouched.
      const scope = (q: Question) => (category ? q.category === category : true);
      const inScope = kit.questions.filter(scope);
      const { pristine } = partition(inScope, status);
      // Keep-list is every existing question, so fresh ones don't duplicate a
      // question living in another category either.
      const keep = kit.questions.map((q) => q.prompt);
      const fresh = await regenerateQuestions(
        requirements,
        keep,
        avoid,
        pristine.length,
        complete,
        category
      );
      // Never let a short/empty LLM result silently shrink the section.
      const merged = mergeScoped<Question>(
        kit.questions,
        status,
        scope,
        reconcileFresh(fresh, pristine),
        "q"
      );
      kit.questions = merged.items;
      kit.coverage.uncovered_requirement_ids = findUncovered(requirements, kit.questions);
      kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available, mustIds);
      editState.questions = merged.status;
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
