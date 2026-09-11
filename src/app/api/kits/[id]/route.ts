import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db";
import { KitModel } from "../../../../models/kit";
import { findUncovered } from "../../../../core/coverage";
import { allocateSchedule } from "../../../../core/schedule";
import type { Kit } from "../../../../core/types";

export const runtime = "nodejs";

type Section = "questions" | "flashcards";
const SECTIONS: Section[] = ["questions", "flashcards"];
type EditMap = Record<string, "edited" | "user-created">;
type Item = { id: string; [k: string]: unknown };

function recomputeQuestionDependents(kit: Kit): void {
  kit.coverage.uncovered_requirement_ids = findUncovered(kit.role.requirements, kit.questions);
  kit.schedule = allocateSchedule(kit.questions, kit.schedule.days_available);
}

// PATCH /api/kits/[id]  { section, action: edit|delete|add, itemId?, patch?, item? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      section?: Section;
      action?: "edit" | "delete" | "add";
      itemId?: string;
      patch?: Record<string, unknown>;
      item?: Record<string, unknown>;
    };
    const section = body.section;
    if (!section || !SECTIONS.includes(section)) {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }

    await connectDB();
    const doc = await KitModel.findById(id).catch(() => null);
    if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

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
    } else {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    if (section === "questions") recomputeQuestionDependents(kit);

    doc.kit = kit;
    doc.editState = editState;
    doc.tombstones = tombstones;
    doc.markModified("kit");
    doc.markModified("editState");
    doc.markModified("tombstones");
    await doc.save();

    return NextResponse.json({ kit: doc.kit, editState: doc.editState });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
