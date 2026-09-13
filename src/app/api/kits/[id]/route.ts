import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db";
import { KitModel } from "../../../../models/kit";
import { findUncovered } from "../../../../core/coverage";
import { allocateSchedule } from "../../../../core/schedule";
import { currentUserId } from "../../../../lib/auth";
import type { Kit } from "../../../../core/types";

export const runtime = "nodejs";

type Section = "questions" | "flashcards";
const SECTIONS: Section[] = ["questions", "flashcards"];
const QUESTION_CATEGORIES = new Set([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
type EditMap = Record<string, "edited" | "user-created">;
type Item = { id: string; [k: string]: unknown };

function mustIdsOf(kit: Kit): Set<string> {
  return new Set(kit.role.requirements.filter((r) => r.priority === "must").map((r) => r.id));
}

function recomputeQuestionDependents(kit: Kit): void {
  kit.coverage.uncovered_requirement_ids = findUncovered(kit.role.requirements, kit.questions);
  kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available, mustIdsOf(kit));
}

const conflict = () =>
  NextResponse.json({ error: "This kit changed elsewhere.", conflict: true }, { status: 409 });

// Watchdog threshold. Must exceed the generation route's maxDuration (300s) so a
// legitimately slow-but-healthy run is never falsely reaped; this only catches a
// job whose function was hard-killed (OOM / cold-start death) before its own
// catch could write status:"failed", which would otherwise poll forever.
const STUCK_MS = 6 * 60 * 1000;
const STUCK_MSG = "Generation stopped unexpectedly. Please try again.";

// GET — polled by GeneratingView for progress, and refetched after a 409.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  await connectDB();
  const doc = (await KitModel.findById(id).lean().catch(() => null)) as
    | {
        userId?: string;
        kit?: unknown;
        editState?: unknown;
        version?: number;
        status?: string;
        progress?: { step: number; label: string };
        error?: string;
        report?: unknown;
        createdAt?: Date | string;
      }
    | null;
  if (!doc || doc.userId !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Reconcile a job that died mid-run: still "generating" long past the budget
  // means the pipeline's own failure write never ran. Flip it to "failed" (guarded
  // on status so we never race a job that is finishing) so the client stops.
  let status = doc.status ?? "ready";
  let error = doc.error ?? null;
  if (status === "generating" && doc.createdAt) {
    const age = Date.now() - new Date(doc.createdAt).getTime();
    if (age > STUCK_MS) {
      await KitModel.updateOne(
        { _id: id, status: "generating" },
        { $set: { status: "failed", error: STUCK_MSG } }
      );
      status = "failed";
      error = STUCK_MSG;
    }
  }

  return NextResponse.json({
    status,
    progress: doc.progress ?? { step: 0, label: "" },
    error,
    report: doc.report ?? null,
    kit: doc.kit,
    editState: doc.editState ?? {},
    version: doc.version ?? 0,
  });
}

// PATCH /api/kits/[id]  { section, action, itemId?, patch?, item?, version }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      section?: Section;
      action?: "edit" | "delete" | "add" | "reorder" | "move";
      itemId?: string;
      patch?: Record<string, unknown>;
      item?: Record<string, unknown>;
      direction?: "up" | "down";
      category?: string;
      version?: number;
    };
    const section = body.section;
    if (!section || !SECTIONS.includes(section)) {
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
    if (typeof body.version === "number" && body.version !== current) return conflict();

    const kit = doc.kit as Kit;
    const editState = (doc.editState ?? {}) as Record<string, EditMap>;
    const tombstones = (doc.tombstones ?? {}) as Record<string, string[]>;
    editState[section] ??= {};
    tombstones[section] ??= [];
    const items = (kit as unknown as Record<string, Item[]>)[section];
    const setItems = (next: Item[]) => {
      (kit as unknown as Record<string, Item[]>)[section] = next;
    };

    if (body.action === "edit") {
      const it = items.find((x) => x.id === body.itemId);
      if (!it) return NextResponse.json({ error: "item not found" }, { status: 404 });
      Object.assign(it, body.patch ?? {});
      if (editState[section][it.id] !== "user-created") editState[section][it.id] = "edited";
    } else if (body.action === "delete") {
      const it = items.find((x) => x.id === body.itemId);
      if (it) tombstones[section].push(String(section === "questions" ? it.prompt : it.front));
      setItems(items.filter((x) => x.id !== body.itemId));
      delete editState[section][body.itemId ?? ""];
    } else if (body.action === "add") {
      const newId = `${section === "questions" ? "q" : "fc"}-u${Date.now().toString(36)}`;
      setItems([...items, { ...(body.item ?? {}), id: newId }]);
      editState[section][newId] = "user-created";
    } else if (body.action === "reorder") {
      if (body.direction !== "up" && body.direction !== "down") {
        return NextResponse.json({ error: "invalid direction" }, { status: 400 });
      }
      const idx = items.findIndex((x) => x.id === body.itemId);
      if (idx === -1) return NextResponse.json({ error: "item not found" }, { status: 404 });
      const step = body.direction === "up" ? -1 : 1;
      // Questions are grouped by category in the UI, so swap with the nearest
      // neighbour in the SAME category; flashcards swap with the direct neighbour.
      const cat = (items[idx] as { category?: string }).category;
      let j = idx + step;
      if (section === "questions" && cat) {
        while (j >= 0 && j < items.length && (items[j] as { category?: string }).category !== cat) {
          j += step;
        }
      }
      if (j >= 0 && j < items.length) {
        const next = [...items];
        [next[idx], next[j]] = [next[j], next[idx]];
        setItems(next); // already at the end => no-op, still a valid request
      }
    } else if (body.action === "move") {
      if (section !== "questions") {
        return NextResponse.json({ error: "move applies to questions" }, { status: 400 });
      }
      if (typeof body.category !== "string" || !QUESTION_CATEGORIES.has(body.category)) {
        return NextResponse.json({ error: "invalid category" }, { status: 400 });
      }
      const it = items.find((x) => x.id === body.itemId);
      if (!it) return NextResponse.json({ error: "item not found" }, { status: 404 });
      (it as { category?: string }).category = body.category;
      // A hand-moved question is a user decision — lock it against regeneration.
      if (editState[section][it.id] !== "user-created") editState[section][it.id] = "edited";
    } else {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    if (section === "questions") recomputeQuestionDependents(kit);

    // Compare-and-swap on version — fails if another writer committed meanwhile.
    const res = await KitModel.updateOne(
      { _id: id, userId: uid, version: current },
      { $set: { kit, editState, tombstones }, $inc: { version: 1 } }
    );
    if (res.matchedCount === 0) return conflict();

    return NextResponse.json({ kit, editState, version: current + 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
