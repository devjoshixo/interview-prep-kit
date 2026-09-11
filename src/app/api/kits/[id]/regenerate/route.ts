import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db";
import { KitModel } from "../../../../../models/kit";
import { complete } from "../../../../../lib/llm";
import { partition, mergeSection, type StatusMap } from "../../../../../core/regenerate";
import {
  regenerateQuestions,
  regenerateFlashcards,
} from "../../../../../core/steps/regenerateSection";
import { findUncovered } from "../../../../../core/coverage";
import { allocateSchedule } from "../../../../../core/schedule";
import { currentUserId } from "../../../../../lib/auth";
import type { Kit, Question, Flashcard } from "../../../../../core/types";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST /api/kits/[id]/regenerate  { section: "questions" | "flashcards" }
//
// Replaces ONLY the pristine items, keeping edited/user-created ones verbatim and
// feeding deleted items back as an avoid-list. Questions cascade to coverage +
// schedule (their ids are reassigned).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { section } = (await req.json()) as { section?: "questions" | "flashcards" };
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
      const merged = mergeSection<Question>(locked, fresh, "q");
      kit.questions = merged.items;
      kit.coverage.uncovered_requirement_ids = findUncovered(requirements, kit.questions);
      kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available);
      editState[section] = merged.status;
    } else {
      const { locked, pristine } = partition(kit.flashcards, status);
      const keep = locked.map((l) => l.item.front);
      const fresh = await regenerateFlashcards(requirements, keep, avoid, pristine.length, complete);
      const merged = mergeSection<Flashcard>(locked, fresh, "fc");
      kit.flashcards = merged.items;
      editState[section] = merged.status;
    }

    doc.kit = kit;
    doc.editState = editState;
    doc.markModified("kit");
    doc.markModified("editState");
    await doc.save();

    return NextResponse.json({ kit: doc.kit, editState: doc.editState });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
